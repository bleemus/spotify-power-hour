// Spotify has no wildcard redirect URIs, but every PR preview gets its own hostname.
// All environments therefore use the production /callback as redirect_uri and carry
// their own origin in `state`; production forwards the code back to that origin,
// which then completes the PKCE exchange with its own verifier.

export interface AuthState {
  /** Origin that started the login and holds the PKCE verifier. */
  o: string;
  /** Random nonce, checked against the value stored by that origin. */
  n: string;
}

export function encodeState(state: AuthState): string {
  return btoa(JSON.stringify(state)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeState(raw: string | null): AuthState | null {
  if (!raw) return null;
  try {
    const b64 = raw.replace(/-/g, '+').replace(/_/g, '/');
    const parsed = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)));
    if (typeof parsed?.o === 'string' && typeof parsed?.n === 'string') return parsed;
  } catch {
    // fall through
  }
  return null;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Whether the auth origin may forward an authorization code to `origin`.
 * Allowed: the auth origin itself, the local dev server, and this app's own
 * Azure Static Web Apps preview environments (<name>-<pr>.<region>[.<n>].azurestaticapps.net).
 */
export function isAllowedReturnOrigin(origin: string, authOrigin: string, devOrigin: string): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.origin !== origin) return false; // no paths, credentials, trailing junk
  if (origin === authOrigin || origin === devOrigin) return true;

  let auth: URL;
  try {
    auth = new URL(authOrigin);
  } catch {
    return false;
  }
  const m = /^([a-z0-9-]+)\.(?:\d+\.)?azurestaticapps\.net$/.exec(auth.hostname);
  if (!m || url.protocol !== 'https:' || url.port !== '') return false;
  const preview = new RegExp(`^${escapeRe(m[1])}-\\d+\\.[a-z0-9]+(?:\\.\\d+)?\\.azurestaticapps\\.net$`);
  return preview.test(url.hostname);
}
