import { useState } from 'react';
import { beginLogin } from '../auth/pkce';
import { CLIENT_ID } from '../config';

export function Login({ error }: { error?: string | null }) {
  const [busy, setBusy] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  return (
    <main className="login">
      <h1>
        Power <em>Hour</em>
      </h1>
      <p className="lede">
        Pick a Spotify playlist. Each song starts partway in, plays for as long as you set, then the next one
        comes on.
      </p>
      {!CLIENT_ID ? (
        <p className="error">
          Missing <code>VITE_SPOTIFY_CLIENT_ID</code>. Copy <code>.env.example</code> to <code>.env.local</code> and set it.
        </p>
      ) : (
        <button
          type="button"
          className="primary big"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setStartError(null);
            beginLogin().catch((e: Error) => {
              console.error('Sign-in failed to start', e);
              setStartError(e.message);
              setBusy(false);
            });
          }}
        >
          {busy ? 'Opening Spotify…' : 'Sign in with Spotify'}
        </button>
      )}
      {(startError ?? error) && <p className="error">{startError ?? error}</p>}
      <p className="fine">Requires Spotify Premium.</p>
    </main>
  );
}
