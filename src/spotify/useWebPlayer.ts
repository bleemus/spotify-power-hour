import { useEffect, useRef, useState } from 'react';
import { getAccessToken } from '../auth/tokens';

export type StateListener = (state: Spotify.PlaybackState | null) => void;

export interface WebPlayer {
  player: Spotify.Player | null;
  deviceId: string | null;
  error: string | null;
  subscribe(fn: StateListener): () => void;
}

let sdkReady: Promise<void> | null = null;

function loadSdk(): Promise<void> {
  sdkReady ??= new Promise((resolve, reject) => {
    if (window.Spotify) return resolve();
    window.onSpotifyWebPlaybackSDKReady = () => resolve();
    const script = document.createElement('script');
    script.src = 'https://sdk.scdn.co/spotify-player.js';
    script.async = true;
    script.onerror = () => reject(new Error('Could not load the Spotify player'));
    document.head.appendChild(script);
  });
  return sdkReady;
}

/** Turns this browser tab into a Spotify Connect device via the Web Playback SDK. */
export function useWebPlayer(enabled: boolean): WebPlayer {
  const [player, setPlayer] = useState<Spotify.Player | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const listeners = useRef(new Set<StateListener>());

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let instance: Spotify.Player | null = null;

    loadSdk()
      .then(() => {
        if (cancelled) return;
        instance = new window.Spotify.Player({
          name: 'Power Hour (browser)',
          volume: 0.8,
          getOAuthToken: (cb) => {
            getAccessToken().then(cb, () => setError('Signed out'));
          },
        });
        instance.addListener('ready', ({ device_id }) => {
          setDeviceId(device_id);
          setError(null);
        });
        instance.addListener('not_ready', () => setDeviceId(null));
        instance.addListener('player_state_changed', (state) => {
          for (const fn of listeners.current) fn(state);
        });
        instance.addListener('initialization_error', ({ message }) =>
          setError(`This browser can't play Spotify here (${message}). Pick another device.`),
        );
        instance.addListener('authentication_error', ({ message }) => setError(`Spotify auth error: ${message}`));
        instance.addListener('account_error', () => setError('Spotify Premium is required for playback.'));
        instance.addListener('playback_error', ({ message }) => console.warn('Spotify playback error:', message));
        void instance.connect();
        setPlayer(instance);
      })
      .catch((e: Error) => !cancelled && setError(e.message));

    return () => {
      cancelled = true;
      instance?.disconnect();
      setPlayer(null);
      setDeviceId(null);
    };
  }, [enabled]);

  const subscribe = (fn: StateListener) => {
    listeners.current.add(fn);
    return () => void listeners.current.delete(fn);
  };

  return { player, deviceId, error, subscribe };
}
