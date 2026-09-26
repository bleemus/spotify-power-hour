import { SpotifyError, type Track } from '../spotify/api';
import { computeSegment, shuffle, type Rng, type Segment } from './segment';
import type { Settings, SoundSettings } from './settings';
import type { StopTicker, TickerFactory } from './ticker';

export type Status = 'idle' | 'starting' | 'playing' | 'paused' | 'cue' | 'done' | 'error';

export interface SessionView {
  status: Status;
  round: number;
  total: number;
  track: Track | null;
  segment: Segment | null;
  remainingMs: number;
  skipped: number;
  message: string | null;
}

export interface Target {
  deviceId: string;
  isBrowser: boolean;
  /** Shown in error messages, e.g. "iPhone". */
  name?: string;
}

export interface SessionDeps {
  playTrack(uri: string, positionMs: number, deviceId: string): Promise<void>;
  pausePlayback(deviceId: string): Promise<void>;
  resumePlayback(deviceId: string): Promise<void>;
  /** Resolves once the track is audibly playing (or after a timeout). */
  confirmPlaying(uri: string, target: Target): Promise<void>;
  playCue(sound: SoundSettings): Promise<void>;
  /** Best-effort nudge for a device that didn't answer (e.g. transfer playback to it). */
  wakeDevice(target: Target): Promise<void>;
  sleep(ms: number): Promise<void>;
  ticker: TickerFactory;
  now(): number;
  rng: Rng;
  onChange(view: SessionView): void;
}

export const IDLE_VIEW: SessionView = {
  status: 'idle',
  round: 0,
  total: 0,
  track: null,
  segment: null,
  remainingMs: 0,
  skipped: 0,
  message: null,
};

/** Give up after this many tracks in a row are refused as unplayable. */
const MAX_CONSECUTIVE_FAILURES = 3;
/** Attempts per track when the device itself doesn't answer, with a wake-up and backoff between. */
const DEVICE_ATTEMPTS = 4;
const DEVICE_BACKOFF_MS = 1500;
/**
 * A tick arriving this long after the deadline means timers were frozen: phones suspend
 * background pages. The song kept playing meanwhile, so stop and let the user resume
 * instead of silently jumping ahead.
 */
const OVERRUN_MS = 3000;
/** Ignore player events this soon after our own play/pause calls; they are echoes. */
const ECHO_WINDOW_MS = 1500;

/**
 * Failures that mean the playback device didn't respond, rather than the track being
 * unplayable: network errors, 5xx (Spotify couldn't reach the device, often a phone app
 * asleep in the background), 404 device/player not found, and no-active-device reasons.
 */
export function isDeviceProblem(e: unknown): boolean {
  if (!(e instanceof SpotifyError)) return true;
  return e.status >= 500 || e.status === 404 || e.status === 408 || e.reason === 'NO_ACTIVE_DEVICE';
}

export function describeError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  if (!(e instanceof SpotifyError)) return message;
  return `${message} (HTTP ${e.status}${e.reason ? `, ${e.reason}` : ''})`;
}

type StartResult = { ok: true } | { ok: false; error: unknown } | null;

/**
 * Drives a power-hour run: for each track, start playback at the chosen offset,
 * count down the play length, optionally play a cue, then move on.
 * Every async step checks `run` so stop/skip cancel whatever was in flight.
 */
export class SessionController {
  private view: SessionView = IDLE_VIEW;
  private run = 0;
  private order: Track[] = [];
  private index = 0;
  private settings: Settings | null = null;
  private target: Target | null = null;
  private deadline = 0;
  private remaining = 0;
  private stopTicker: StopTicker | null = null;
  private failures = 0;
  private lastControlAt = -Infinity;
  /** Index of the track that stopped the session, so retry() can play it again. */
  private retryIndex: number | null = null;

  constructor(private deps: SessionDeps) {}

  get state(): SessionView {
    return this.view;
  }

  get active(): boolean {
    return ['starting', 'playing', 'paused', 'cue'].includes(this.view.status);
  }

  start(tracks: Track[], settings: Settings, target: Target): void {
    this.clearTicker();
    const run = ++this.run;
    this.settings = settings;
    this.target = target;
    this.order = settings.shuffle ? shuffle(tracks, this.deps.rng) : [...tracks];
    this.index = 0;
    this.failures = 0;
    const total = settings.roundLimit > 0 ? Math.min(settings.roundLimit, this.order.length) : this.order.length;
    this.set({ ...IDLE_VIEW, status: 'starting', total });
    void this.next(run);
  }

  pause(): void {
    if (this.view.status !== 'playing' || !this.target) return;
    this.freeze();
    this.set({ status: 'paused', message: null });
    this.control(() => this.deps.pausePlayback(this.target!.deviceId));
  }

  resume(): void {
    if (this.view.status !== 'paused' || !this.target) return;
    if (this.remaining <= 0) {
      void this.expire(this.run);
      return;
    }
    this.control(() => this.deps.resumePlayback(this.target!.deviceId));
    this.countdown(this.run, this.remaining);
  }

  skip(): void {
    if (!this.active) return;
    this.clearTicker();
    void this.next(++this.run);
  }

  /** After an error, try the track that failed again. */
  retry(): void {
    if (this.view.status !== 'error' || this.retryIndex === null) return;
    this.index = this.retryIndex;
    this.retryIndex = null;
    this.failures = 0;
    this.set({ round: Math.max(0, this.view.round - 1), message: null });
    void this.next(++this.run);
  }

  stop(): void {
    const wasActive = this.active;
    this.clearTicker();
    this.run++;
    this.set({ ...IDLE_VIEW });
    if (wasActive && this.target) this.control(() => this.deps.pausePlayback(this.target!.deviceId));
  }

  /** The browser player reported a pause/resume of the current track that we didn't cause. */
  externalPlayState(uri: string, paused: boolean): void {
    if (this.deps.now() - this.lastControlAt < ECHO_WINDOW_MS) return;
    if (this.view.track?.uri !== uri) return;
    if (paused && this.view.status === 'playing') {
      this.freeze();
      this.set({ status: 'paused', message: 'Paused from Spotify' });
    } else if (!paused && this.view.status === 'paused') {
      this.countdown(this.run, this.remaining);
    }
  }

  /** Playback left the browser player (e.g. the user picked another device in Spotify). */
  externalLoss(): void {
    if (this.view.status !== 'playing') return;
    if (this.deps.now() - this.lastControlAt < ECHO_WINDOW_MS) return;
    this.freeze();
    this.set({ status: 'paused', message: 'Playback moved to another device' });
  }

  // ---------- internals ----------

  private set(patch: Partial<SessionView>): void {
    this.view = { ...this.view, ...patch };
    this.deps.onChange(this.view);
  }

  private alive(run: number): boolean {
    return run === this.run;
  }

  private control(call: () => Promise<void>): void {
    this.lastControlAt = this.deps.now();
    call().catch(() => {
      // Best effort: the session state is already updated either way.
    });
  }

  private clearTicker(): void {
    this.stopTicker?.();
    this.stopTicker = null;
  }

  private freeze(): void {
    this.remaining = Math.max(0, this.deadline - this.deps.now());
    this.clearTicker();
    this.set({ remainingMs: this.remaining });
  }

  private async next(run: number): Promise<void> {
    const settings = this.settings!;
    const target = this.target!;
    if (this.view.round >= this.view.total || this.index >= this.order.length) return this.finish(run);

    const track = this.order[this.index++];
    const segment = computeSegment(settings, track.durationMs, this.deps.rng);
    this.set({
      status: 'starting',
      round: this.view.round + 1,
      track,
      segment,
      remainingMs: segment.playMs,
      message: null,
    });

    const result = await this.startTrack(run, track.uri, segment.startMs, target);
    if (!result) return; // cancelled
    if (!result.ok) {
      const { error } = result;
      console.warn('Power Hour: could not start track', track.uri, error);
      if (isDeviceProblem(error)) {
        return this.fail(
          `Spotify couldn't reach ${target.name ? `“${target.name}”` : 'your device'}: ${describeError(error)}. ` +
            'Open the Spotify app on it, play and pause any song, then tap Try again.',
        );
      }
      const fatal = error instanceof SpotifyError && (error.status === 401 || error.reason === 'PREMIUM_REQUIRED');
      if (!fatal && ++this.failures < MAX_CONSECUTIVE_FAILURES) {
        this.set({ round: this.view.round - 1, skipped: this.view.skipped + 1 });
        return this.next(run);
      }
      return this.fail(`Couldn't start “${track.name}”: ${describeError(error)}`);
    }
    if (!this.alive(run)) return;
    this.failures = 0;

    await this.deps.confirmPlaying(track.uri, target);
    if (!this.alive(run)) return;
    this.lastControlAt = this.deps.now();
    this.countdown(run, segment.playMs);
  }

  /** Start a track, retrying with a wake-up nudge while the device doesn't answer. Null if cancelled. */
  private async startTrack(run: number, uri: string, positionMs: number, target: Target): Promise<StartResult> {
    for (let attempt = 1; ; attempt++) {
      try {
        this.lastControlAt = this.deps.now();
        await this.deps.playTrack(uri, positionMs, target.deviceId);
        return this.alive(run) ? { ok: true } : null;
      } catch (error) {
        if (!this.alive(run)) return null;
        if (!isDeviceProblem(error) || attempt >= DEVICE_ATTEMPTS) return { ok: false, error };
        this.set({ message: `Waiting for ${target.name ?? 'the device'} to respond… (try ${attempt + 1} of ${DEVICE_ATTEMPTS})` });
        await this.deps.wakeDevice(target).catch(() => {});
        await this.deps.sleep(DEVICE_BACKOFF_MS * attempt);
        if (!this.alive(run)) return null;
      }
    }
  }

  private fail(message: string): void {
    this.retryIndex = this.index - 1;
    this.set({ status: 'error', message });
  }

  private countdown(run: number, ms: number): void {
    this.clearTicker();
    this.deadline = this.deps.now() + ms;
    this.set({ status: 'playing', remainingMs: ms, message: null });
    this.stopTicker = this.deps.ticker(100, () => {
      if (!this.alive(run)) return;
      const now = this.deps.now();
      if (now - this.deadline > OVERRUN_MS) {
        this.clearTicker();
        this.remaining = 0;
        this.set({
          status: 'paused',
          remainingMs: 0,
          message: 'The timer stopped while this page was in the background. Tap Resume for the next song.',
        });
        this.control(() => this.deps.pausePlayback(this.target!.deviceId));
        return;
      }
      const left = Math.max(0, this.deadline - now);
      this.set({ remainingMs: left });
      if (left === 0) {
        this.clearTicker();
        void this.expire(run);
      }
    });
  }

  private async expire(run: number): Promise<void> {
    const sound = this.settings!.sound;
    if (sound.enabled) {
      this.set({ status: 'cue' });
      this.lastControlAt = this.deps.now();
      await this.deps.pausePlayback(this.target!.deviceId).catch(() => {});
      if (!this.alive(run)) return;
      await this.deps.playCue(sound).catch(() => {});
      if (!this.alive(run)) return;
    }
    return this.next(run);
  }

  private finish(run: number): void {
    if (!this.alive(run)) return;
    this.clearTicker();
    this.set({ status: 'done', remainingMs: 0, message: null });
    this.control(() => this.deps.pausePlayback(this.target!.deviceId));
  }
}
