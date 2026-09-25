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

export interface RelayConfig {
  /** Origin whose /callback is registered with Spotify (production; may be a custom domain). */
  authOrigin: string;
  /** Local dev server origin. */
  devOrigin: string;
  /**
   * The SWA default hostname (e.g. gentle-sky-0b9139a10.2.azurestaticapps.net). Preview
   * environments are named after it. Defaults to the auth origin's host when that is an
   * azurestaticapps.net host.
   */
  swaHost?: string;
}

/**
 * Whether the auth origin may forward an authorization code to `origin`.
 * Allowed: the auth origin itself, the local dev server, the SWA default host, and this
 * app's own preview environments (<name>-<pr>.<region>[.<n>].azurestaticapps.net).
 */
export function isAllowedReturnOrigin(origin: string, config: RelayConfig): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.origin !== origin) return false; // no paths, credentials, trailing junk
  if (origin === config.authOrigin || origin === config.devOrigin) return true;

  let swaHost = config.swaHost?.trim().toLowerCase();
  if (!swaHost) {
    try {
      swaHost = new URL(config.authOrigin).hostname;
    } catch {
      return false;
    }
  }
  const m = /^([a-z0-9-]+)\.(?:\d+\.)?azurestaticapps\.net$/.exec(swaHost);
  if (!m || url.protocol !== 'https:' || url.port !== '') return false;
  if (url.hostname === swaHost) return true;
  const preview = new RegExp(`^${escapeRe(m[1])}-\\d+\\.[a-z0-9]+(?:\\.\\d+)?\\.azurestaticapps\\.net$`);
  return preview.test(url.hostname);
}
