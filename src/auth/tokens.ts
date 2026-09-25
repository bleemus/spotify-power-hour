import { CLIENT_ID, REDIRECT_URI } from '../config';

const KEY = 'ph.tokens';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';

interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

function load(): Tokens | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Tokens) : null;
  } catch {
    return null;
  }
}

function save(res: TokenResponse, previousRefresh?: string): void {
  const tokens: Tokens = {
    accessToken: res.access_token,
    refreshToken: res.refresh_token ?? previousRefresh ?? '',
    expiresAt: Date.now() + res.expires_in * 1000,
  };
  localStorage.setItem(KEY, JSON.stringify(tokens));
}

export function hasTokens(): boolean {
  return load() !== null;
}

export function clearTokens(): void {
  localStorage.removeItem(KEY);
}

async function postToken(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, ...body }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Spotify token request failed (${res.status}) ${detail}`);
  }
  return res.json();
}

export async function exchangeCode(code: string, verifier: string): Promise<void> {
  save(
    await postToken({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    }),
  );
}

let refreshing: Promise<string> | null = null;

/** Refresh the access token; concurrent callers share one request. */
export function forceRefresh(): Promise<string> {
  refreshing ??= (async () => {
    try {
      const current = load();
      if (!current?.refreshToken) throw new Error('Not signed in');
      const res = await postToken({ grant_type: 'refresh_token', refresh_token: current.refreshToken });
      save(res, current.refreshToken);
      return res.access_token;
    } catch (e) {
      clearTokens();
      throw e;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export async function getAccessToken(): Promise<string> {
  const tokens = load();
  if (!tokens) throw new Error('Not signed in');
  if (tokens.expiresAt - Date.now() > 60_000) return tokens.accessToken;
  return forceRefresh();
}
