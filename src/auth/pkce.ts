import { AUTH_ORIGIN, CLIENT_ID, DEV_ORIGIN, REDIRECT_URI, SCOPES, SWA_HOST } from '../config';
import { decodeState, encodeState, isAllowedReturnOrigin } from './relay';
import { exchangeCode } from './tokens';

const PKCE_KEY = 'ph.pkce';

function base64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomString(byteLength: number): string {
  return base64url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

export async function beginLogin(): Promise<void> {
  const verifier = randomString(64);
  const nonce = randomString(16);
  localStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, nonce }));

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    code_challenge_method: 'S256',
    code_challenge: await challengeFor(verifier),
    scope: SCOPES.join(' '),
    state: encodeState({ o: window.location.origin, n: nonce }),
  });
  window.location.assign(`https://accounts.spotify.com/authorize?${params}`);
}

export type CallbackResult = 'signed-in' | 'relayed';

/** Handle /callback: either forward to the originating environment or finish the exchange here. */
export async function handleCallback(): Promise<CallbackResult> {
  const query = new URLSearchParams(window.location.search);
  const error = query.get('error');
  const state = decodeState(query.get('state'));
  if (!state) throw new Error(error ? `Spotify sign-in failed: ${error}` : 'Missing or invalid sign-in state');

  if (state.o !== window.location.origin) {
    if (!isAllowedReturnOrigin(state.o, { authOrigin: AUTH_ORIGIN, devOrigin: DEV_ORIGIN, swaHost: SWA_HOST })) {
      throw new Error(`Refusing to forward sign-in to ${state.o}`);
    }
    window.location.replace(`${state.o}/callback${window.location.search}`);
    return 'relayed';
  }

  if (error) throw new Error(`Spotify sign-in failed: ${error}`);
  const code = query.get('code');
  const stored = JSON.parse(localStorage.getItem(PKCE_KEY) ?? 'null') as { verifier: string; nonce: string } | null;
  localStorage.removeItem(PKCE_KEY);
  if (!code || !stored || stored.nonce !== state.n) throw new Error('Sign-in state mismatch; please try again');

  await exchangeCode(code, stored.verifier);
  return 'signed-in';
}
