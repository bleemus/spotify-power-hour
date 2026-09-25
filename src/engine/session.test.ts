import { describe, expect, it, vi } from 'vitest';
import { SpotifyError, type Track } from '../spotify/api';
import { SessionController, type SessionDeps, type SessionView } from './session';
import { DEFAULT_SETTINGS, type Settings } from './settings';

const track = (n: number, durationMs = 200_000): Track => ({
  id: `t${n}`,
  uri: `spotify:track:t${n}`,
  name: `Song ${n}`,
  artists: 'Artist',
  album: 'Album',
  durationMs,
});

const settings = (patch: Partial<Settings> = {}): Settings => ({
  ...DEFAULT_SETTINGS,
  start: { random: false, fixed: 30, min: 0, max: 0 },
  length: { random: false, fixed: 10, min: 0, max: 0 },
  shuffle: false,
  roundLimit: 0,
  ...patch,
});

const flush = () => new Promise((r) => setTimeout(r, 0));

function harness(overrides: Partial<SessionDeps> = {}) {
  let clock = 0;
  let tick: (() => void) | null = null;
  const views: SessionView[] = [];
  const deps: SessionDeps = {
    playTrack: vi.fn(async () => {}),
    pausePlayback: vi.fn(async () => {}),
    resumePlayback: vi.fn(async () => {}),
    confirmPlaying: vi.fn(async () => {}),
    playCue: vi.fn(async () => {}),
    ticker: (_ms, onTick) => {
      tick = onTick;
      return () => {
        if (tick === onTick) tick = null;
      };
    },
    now: () => clock,
    rng: () => 0,
    onChange: (v) => views.push(v),
    ...overrides,
  };
  const session = new SessionController(deps);
  return {
    deps,
    session,
    views,
    /** Advance the fake clock and fire the ticker once. */
    async advance(ms: number) {
      clock += ms;
      tick?.();
      await flush();
    },
  };
}

const target = { deviceId: 'dev1', isBrowser: false };

describe('SessionController', () => {
  it('plays each track at the start offset for the configured length', async () => {
    const h = harness();
    h.session.start([track(1), track(2)], settings(), target);
    await flush();

    expect(h.deps.playTrack).toHaveBeenCalledWith('spotify:track:t1', 30_000, 'dev1');
    expect(h.session.state).toMatchObject({ status: 'playing', round: 1, total: 2, remainingMs: 10_000 });

    await h.advance(9_000);
    expect(h.session.state.remainingMs).toBe(1_000);
    expect(h.deps.playTrack).toHaveBeenCalledTimes(1);

    await h.advance(1_000);
    expect(h.deps.playTrack).toHaveBeenLastCalledWith('spotify:track:t2', 30_000, 'dev1');
    expect(h.session.state.round).toBe(2);

    await h.advance(10_000);
    expect(h.session.state.status).toBe('done');
    expect(h.deps.pausePlayback).toHaveBeenCalled();
  });

  it('respects the round limit', async () => {
    const h = harness();
    h.session.start([track(1), track(2), track(3)], settings({ roundLimit: 1 }), target);
    await flush();
    expect(h.session.state.total).toBe(1);
    await h.advance(10_000);
    expect(h.session.state.status).toBe('done');
    expect(h.deps.playTrack).toHaveBeenCalledTimes(1);
  });

  it('pauses Spotify and plays the cue before the next song', async () => {
    const order: string[] = [];
    let finishCue!: () => void;
    const h = harness({
      pausePlayback: vi.fn(async () => void order.push('pause')),
      playCue: vi.fn(() => {
        order.push('cue');
        return new Promise<void>((r) => (finishCue = r));
      }),
      playTrack: vi.fn(async (uri: string) => void order.push(uri)),
    });
    h.session.start([track(1), track(2)], settings({ sound: { enabled: true, kind: 'beep', volume: 1 } }), target);
    await flush();
    await h.advance(10_000);

    expect(h.session.state.status).toBe('cue');
    expect(order).toEqual(['spotify:track:t1', 'pause', 'cue']);

    finishCue();
    await flush();
    expect(order).toEqual(['spotify:track:t1', 'pause', 'cue', 'spotify:track:t2']);
    expect(h.session.state).toMatchObject({ status: 'playing', round: 2 });
  });

  it('does not play a cue when the sound is off', async () => {
    const h = harness();
    h.session.start([track(1), track(2)], settings(), target);
    await flush();
    await h.advance(10_000);
    expect(h.deps.playCue).not.toHaveBeenCalled();
    expect(h.deps.pausePlayback).not.toHaveBeenCalled();
  });

  it('freezes the countdown while paused', async () => {
    const h = harness();
    h.session.start([track(1), track(2)], settings(), target);
    await flush();
    await h.advance(4_000);
    h.session.pause();
    expect(h.session.state).toMatchObject({ status: 'paused', remainingMs: 6_000 });

    await h.advance(60_000); // no ticker while paused
    h.session.resume();
    expect(h.deps.resumePlayback).toHaveBeenCalledWith('dev1');
    expect(h.session.state).toMatchObject({ status: 'playing', remainingMs: 6_000 });

    await h.advance(5_999);
    expect(h.session.state.round).toBe(1);
    await h.advance(1);
    expect(h.session.state.round).toBe(2);
  });

  it('skips immediately and without a cue', async () => {
    const h = harness();
    h.session.start([track(1), track(2)], settings({ sound: { enabled: true, kind: 'beep', volume: 1 } }), target);
    await flush();
    h.session.skip();
    await flush();
    expect(h.deps.playCue).not.toHaveBeenCalled();
    expect(h.deps.playTrack).toHaveBeenLastCalledWith('spotify:track:t2', 30_000, 'dev1');
  });

  it('skips unplayable tracks, then gives up after repeated failures', async () => {
    const fail = () => Promise.reject(new SpotifyError(403, 'Restriction violated'));
    const playTrack = vi.fn(async (uri: string) => (uri.endsWith('t1') ? fail() : undefined));
    const h = harness({ playTrack });
    h.session.start([track(1), track(2)], settings(), target);
    await flush();
    expect(h.session.state).toMatchObject({ status: 'playing', round: 1, skipped: 1 });
    expect(h.session.state.track?.id).toBe('t2');

    const h2 = harness({ playTrack: vi.fn(fail) });
    h2.session.start([track(1), track(2), track(3), track(4)], settings(), target);
    await flush();
    expect(h2.session.state.status).toBe('error');
    expect(h2.deps.playTrack).toHaveBeenCalledTimes(3);
  });

  it('stop cancels an in-flight start', async () => {
    let release!: () => void;
    const h = harness({ confirmPlaying: vi.fn(() => new Promise<void>((r) => (release = r))) });
    h.session.start([track(1)], settings(), target);
    await flush();
    h.session.stop();
    release();
    await flush();
    expect(h.session.state.status).toBe('idle');
  });

  it('mirrors pauses made from Spotify but ignores echoes of its own calls', async () => {
    const h = harness();
    h.session.start([track(1), track(2)], settings(), target);
    await flush();

    h.session.externalPlayState('spotify:track:t1', true); // right after play: echo window
    expect(h.session.state.status).toBe('playing');

    await h.advance(3_000);
    h.session.externalPlayState('spotify:track:t1', true);
    expect(h.session.state).toMatchObject({ status: 'paused', remainingMs: 7_000 });
    expect(h.deps.pausePlayback).not.toHaveBeenCalled();

    h.session.externalPlayState('spotify:track:t1', false);
    expect(h.session.state.status).toBe('playing');
  });

  it('stops instead of jumping ahead when timers were frozen in the background', async () => {
    const h = harness();
    h.session.start([track(1), track(2)], settings(), target);
    await flush();
    await h.advance(2_000);

    await h.advance(60_000); // page suspended: the next tick arrives long after the deadline
    expect(h.session.state).toMatchObject({ status: 'paused', round: 1, remainingMs: 0 });
    expect(h.session.state.message).toMatch(/background/);
    expect(h.deps.pausePlayback).toHaveBeenCalledWith('dev1');
    expect(h.deps.playTrack).toHaveBeenCalledTimes(1);

    h.session.resume();
    await flush();
    expect(h.deps.playTrack).toHaveBeenLastCalledWith('spotify:track:t2', 30_000, 'dev1');
    expect(h.session.state).toMatchObject({ status: 'playing', round: 2 });
  });

  it('treats a tick just past the deadline as a normal expiry', async () => {
    const h = harness();
    h.session.start([track(1), track(2)], settings(), target);
    await flush();
    await h.advance(11_000); // 1s late: within the grace period
    expect(h.session.state).toMatchObject({ status: 'playing', round: 2 });
  });
});
