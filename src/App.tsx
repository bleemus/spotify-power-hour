import { useEffect, useMemo, useState } from 'react';
import { handleCallback } from './auth/pkce';
import { clearTokens, hasTokens } from './auth/tokens';
import { BROWSER_DEVICE, DevicePicker } from './components/DevicePicker';
import { Login } from './components/Login';
import { NowPlaying } from './components/NowPlaying';
import { LIKED_SONGS, PlaylistPicker } from './components/PlaylistPicker';
import { SettingsPanel } from './components/SettingsPanel';
import { loadSettings, saveSettings, validateSettings, type Settings } from './engine/settings';
import { unlockAudio } from './engine/sounds';
import { useSession } from './engine/useSession';
import * as api from './spotify/api';
import { IS_MOBILE } from './spotify/platform';
import { useWebPlayer } from './spotify/useWebPlayer';

// StrictMode runs effects twice in dev; the code exchange must only happen once.
let callbackOnce: ReturnType<typeof handleCallback> | null = null;

export function App() {
  const [signedIn, setSignedIn] = useState(hasTokens);
  const [callbackError, setCallbackError] = useState<string | null>(null);
  const isCallback = window.location.pathname === '/callback';

  useEffect(() => {
    if (!isCallback) return;
    (callbackOnce ??= handleCallback()).then(
      (result) => {
        if (result === 'relayed') return; // navigating to the originating environment
        window.history.replaceState(null, '', '/');
        setSignedIn(true);
      },
      (e: Error) => {
        window.history.replaceState(null, '', '/');
        setCallbackError(e.message);
      },
    );
  }, [isCallback]);

  if (isCallback && !callbackError && !signedIn) return <main className="login"><p className="hint">Signing in…</p></main>;
  if (!signedIn) return <Login error={callbackError} />;
  return (
    <Main
      onSignOut={() => {
        clearTokens();
        setSignedIn(false);
      }}
    />
  );
}

function Main({ onSignOut }: { onSignOut(): void }) {
  const web = useWebPlayer(!IS_MOBILE);
  const session = useSession(web);

  const [me, setMe] = useState<api.Me | null>(null);
  const [playlists, setPlaylists] = useState<api.Playlist[] | null>(null);
  const [likedCount, setLikedCount] = useState<number | null>(null);
  const [source, setSource] = useState<string | null>(() => localStorage.getItem('ph.source'));
  const [device, setDevice] = useState<string>(IS_MOBILE ? '' : BROWSER_DEVICE);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [loadingTracks, setLoadingTracks] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const user = await api.getMe();
        if (cancelled) return;
        setMe(user);
        const [lists, liked] = await Promise.all([api.getMyPlaylists(user), api.getLikedCount().catch(() => null)]);
        if (cancelled) return;
        setPlaylists(lists);
        setLikedCount(liked);
      } catch (e) {
        if (cancelled) return;
        if ((e as Error).message === 'Not signed in') onSignOut();
        else setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const updateSettings = (s: Settings) => {
    setSettings(s);
    saveSettings(s);
  };

  const errors = useMemo(() => validateSettings(settings), [settings]);
  const deviceId = device === BROWSER_DEVICE ? web.deviceId : device || null;
  const busy = session.active || loadingTracks;
  const showNow = session.view.status !== 'idle';

  const start = async () => {
    if (!source || !deviceId || errors.length) return;
    // Both need a user gesture before audio is allowed, so do them before any await.
    unlockAudio();
    if (device === BROWSER_DEVICE) void web.player?.activateElement();

    setError(null);
    setLoadingTracks(true);
    try {
      const tracks = source === LIKED_SONGS ? await api.getLikedTracks() : await api.getPlaylistTracks(source);
      if (!tracks.length) throw new Error('That playlist has no playable songs.');
      session.start(tracks, settings, { deviceId, isBrowser: device === BROWSER_DEVICE });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingTracks(false);
    }
  };

  const startHint = !source
    ? 'Pick a playlist'
    : !deviceId
      ? device === BROWSER_DEVICE
        ? 'Waiting for the browser player…'
        : IS_MOBILE
          ? 'Open the Spotify app on this phone, then come back'
          : 'Pick a device'
      : errors.length
        ? 'Fix the rules above'
        : null;

  return (
    <div className="app">
      <header className="top">
        <h1>
          Power <em>Hour</em>
        </h1>
        <div className="who">
          {me?.display_name && <span>{me.display_name}</span>}
          <button type="button" className="ghost small" onClick={onSignOut} disabled={session.active}>
            Sign out
          </button>
        </div>
      </header>

      {showNow ? (
        <NowPlaying
          view={session.view}
          onPause={session.pause}
          onResume={session.resume}
          onSkip={session.skip}
          onStop={session.stop}
          onReset={session.stop}
        />
      ) : (
        <div className="setup">
          <PlaylistPicker
            playlists={playlists}
            likedCount={likedCount}
            value={source}
            disabled={busy}
            onChange={(id) => {
              setSource(id);
              localStorage.setItem('ph.source', id);
            }}
          />
          <div className="side">
            <SettingsPanel value={settings} errors={errors} disabled={busy} onChange={updateSettings} />
            <DevicePicker
              value={device}
              disabled={busy}
              showBrowser={!IS_MOBILE}
              browserReady={!!web.deviceId}
              browserError={web.error}
              browserDeviceId={web.deviceId}
              onChange={setDevice}
            />
            <div className="go">
              <button type="button" className="primary big" disabled={!!startHint || busy} onClick={() => void start()}>
                {loadingTracks ? 'Loading songs…' : 'Start'}
              </button>
              {startHint && <p className="hint">{startHint}</p>}
              {error && <p className="error">{error}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
