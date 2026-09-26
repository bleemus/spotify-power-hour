import { useEffect, useMemo, useRef, useState } from 'react';
import * as api from '../spotify/api';
import type { WebPlayer } from '../spotify/useWebPlayer';
import { IDLE_VIEW, SessionController, type SessionView, type Target } from './session';
import { playCue } from './sounds';
import { createTicker } from './ticker';

const CONFIRM_TIMEOUT_MS = 5000;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function matches(state: Spotify.PlaybackState | null, uri: string): boolean {
  const t = state?.track_window.current_track;
  return !!t && (t.uri === uri || t.linked_from?.uri === uri);
}

export function useSession(web: WebPlayer) {
  const [view, setView] = useState<SessionView>(IDLE_VIEW);
  const webRef = useRef(web);
  webRef.current = web;
  const targetRef = useRef<Target | null>(null);

  const controller = useMemo(
    () =>
      new SessionController({
        playTrack: api.playTrack,
        pausePlayback: api.pausePlayback,
        resumePlayback: api.resumePlayback,
        playCue,
        wakeDevice: (target) => api.transferPlayback(target.deviceId),
        sleep,
        ticker: createTicker,
        now: () => performance.now(),
        rng: Math.random,
        onChange: setView,
        async confirmPlaying(uri, target) {
          const deadline = performance.now() + CONFIRM_TIMEOUT_MS;
          if (target.isBrowser) {
            const { player, subscribe } = webRef.current;
            if (!player) return;
            await new Promise<void>((resolve) => {
              const done = () => {
                unsubscribe();
                clearTimeout(timer);
                resolve();
              };
              const check = (s: Spotify.PlaybackState | null) => {
                if (s && !s.paused && matches(s, uri)) done();
              };
              const unsubscribe = subscribe(check);
              const timer = setTimeout(done, CONFIRM_TIMEOUT_MS);
              player.getCurrentState().then(check, () => {});
            });
            return;
          }
          while (performance.now() < deadline) {
            const s = await api.getPlaybackState().catch(() => null);
            if (s?.is_playing && s.item?.uri === uri) return;
            await sleep(400);
          }
        },
      }),
    [],
  );

  // Mirror pauses/resumes made from Spotify itself when playing in this browser.
  useEffect(
    () =>
      web.subscribe((state) => {
        if (!targetRef.current?.isBrowser) return;
        if (!state) controller.externalLoss();
        else {
          const uri = state.track_window.current_track?.uri;
          if (uri) controller.externalPlayState(uri, state.paused);
        }
      }),
    [web.player, controller],
  );

  // Keep the screen awake while a session is running. Browsers drop the lock whenever
  // the page is hidden, so take it again each time the page comes back.
  const active = ['starting', 'playing', 'paused', 'cue'].includes(view.status);
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let done = false;
    const acquire = () => {
      if (done || document.visibilityState !== 'visible' || (lock && !lock.released)) return;
      navigator.wakeLock.request('screen').then(
        (l) => (done ? void l.release() : (lock = l)),
        () => {},
      );
    };
    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      done = true;
      document.removeEventListener('visibilitychange', acquire);
      void lock?.release();
    };
  }, [active]);

  useEffect(() => () => controller.stop(), [controller]);

  return {
    view,
    active,
    start(tracks: api.Track[], settings: Parameters<SessionController['start']>[1], target: Target) {
      targetRef.current = target;
      controller.start(tracks, settings, target);
    },
    pause: () => controller.pause(),
    resume: () => controller.resume(),
    skip: () => controller.skip(),
    retry: () => controller.retry(),
    stop: () => controller.stop(),
  };
}
