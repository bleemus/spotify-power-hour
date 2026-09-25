import { forceRefresh, getAccessToken } from '../auth/tokens';

const BASE = 'https://api.spotify.com/v1';

export class SpotifyError extends Error {
  constructor(
    public status: number,
    message: string,
    public reason?: string,
  ) {
    super(message);
  }
}

interface RequestOptions {
  query?: Record<string, string | number | undefined>;
  body?: unknown;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function request<T>(method: string, pathOrUrl: string, opts: RequestOptions = {}): Promise<T> {
  const url = new URL(pathOrUrl.startsWith('http') ? pathOrUrl : BASE + pathOrUrl);
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));

  let refreshed = false;
  for (let attempt = 0; ; attempt++) {
    const token = await getAccessToken();
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });

    if (res.status === 401 && !refreshed) {
      refreshed = true;
      await forceRefresh();
      continue;
    }
    if (res.status === 429 && attempt < 3) {
      await sleep((Number(res.headers.get('Retry-After')) || 1) * 1000);
      continue;
    }
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      throw new SpotifyError(
        res.status,
        payload?.error?.message ?? `Spotify request failed (${res.status})`,
        payload?.error?.reason,
      );
    }
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }
}

async function getAllPages<T>(path: string, query: RequestOptions['query']): Promise<T[]> {
  const out: T[] = [];
  let next: string | null = path;
  let first = true;
  while (next) {
    const page: { items: T[]; next: string | null } = await request('GET', next, first ? { query } : {});
    out.push(...page.items);
    next = page.next;
    first = false;
  }
  return out;
}

// ---------- types ----------

interface ImageObject {
  url: string;
  width?: number | null;
}

export interface Me {
  id: string;
  display_name: string | null;
}

export interface Playlist {
  id: string;
  name: string;
  imageUrl?: string;
  total: number | null;
  /** False when Spotify won't return the contents (dev-mode apps: only owned/collaborative playlists). */
  readable: boolean;
}

export interface Track {
  id: string;
  uri: string;
  name: string;
  artists: string;
  album: string;
  imageUrl?: string;
  durationMs: number;
}

export interface Device {
  id: string | null;
  name: string;
  type: string;
  is_active: boolean;
  is_restricted: boolean;
}

export interface PlaybackState {
  is_playing: boolean;
  progress_ms: number | null;
  device?: Device;
  item?: { uri: string; id: string } | null;
}

// ---------- mapping ----------

function smallestImage(images: ImageObject[] | null | undefined, min = 160): string | undefined {
  if (!images?.length) return undefined;
  const sorted = [...images].sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  return (sorted.find((i) => (i.width ?? 0) >= min) ?? sorted[sorted.length - 1]).url;
}

interface RawTrack {
  type?: string;
  id: string | null;
  uri: string;
  name: string;
  duration_ms: number;
  is_local?: boolean;
  is_playable?: boolean;
  artists?: { name: string }[];
  album?: { name: string; images?: ImageObject[] };
}

function toTrack(raw: RawTrack | null | undefined): Track | null {
  if (!raw || raw.type === 'episode' || raw.is_local || !raw.id || raw.is_playable === false) return null;
  return {
    id: raw.id,
    uri: raw.uri,
    name: raw.name,
    artists: (raw.artists ?? []).map((a) => a.name).join(', '),
    album: raw.album?.name ?? '',
    imageUrl: smallestImage(raw.album?.images, 300),
    durationMs: raw.duration_ms,
  };
}

// ---------- endpoints ----------

export const getMe = () => request<Me>('GET', '/me');

export async function getMyPlaylists(me: Me): Promise<Playlist[]> {
  interface RawPlaylist {
    id: string;
    name: string;
    collaborative: boolean;
    owner: { id: string };
    images: ImageObject[] | null;
    // Feb 2026 rename: tracks -> items. Accept either.
    items?: { total: number } | null;
    tracks?: { total: number } | null;
  }
  const raw = await getAllPages<RawPlaylist | null>('/me/playlists', { limit: 50 });
  return raw
    .filter((p): p is RawPlaylist => !!p)
    .map((p) => ({
      id: p.id,
      name: p.name,
      imageUrl: smallestImage(p.images),
      total: (p.items ?? p.tracks)?.total ?? null,
      readable: p.owner?.id === me.id || p.collaborative,
    }));
}

export async function getPlaylistTracks(playlistId: string): Promise<Track[]> {
  // Feb 2026: /playlists/{id}/items, entries carry `item` (formerly `track`).
  const entries = await getAllPages<{ item?: RawTrack | null; track?: RawTrack | null }>(
    `/playlists/${encodeURIComponent(playlistId)}/items`,
    { limit: 50, market: 'from_token', additional_types: 'track' },
  );
  return entries.map((e) => toTrack(e.item ?? e.track)).filter((t): t is Track => t !== null);
}

export async function getLikedTracks(): Promise<Track[]> {
  const entries = await getAllPages<{ item?: RawTrack | null; track?: RawTrack | null }>('/me/tracks', {
    limit: 50,
    market: 'from_token',
  });
  return entries.map((e) => toTrack(e.item ?? e.track)).filter((t): t is Track => t !== null);
}

export async function getLikedCount(): Promise<number> {
  const page = await request<{ total: number }>('GET', '/me/tracks', { query: { limit: 1 } });
  return page.total;
}

export async function getDevices(): Promise<Device[]> {
  const res = await request<{ devices: Device[] }>('GET', '/me/player/devices');
  return res.devices;
}

export const getPlaybackState = () =>
  request<PlaybackState | undefined>('GET', '/me/player').then((s) => s ?? null);

export const playTrack = (uri: string, positionMs: number, deviceId: string) =>
  request<void>('PUT', '/me/player/play', {
    query: { device_id: deviceId },
    body: { uris: [uri], position_ms: Math.max(0, Math.round(positionMs)) },
  });

export const pausePlayback = (deviceId: string) =>
  request<void>('PUT', '/me/player/pause', { query: { device_id: deviceId } });

export const resumePlayback = (deviceId: string) =>
  request<void>('PUT', '/me/player/play', { query: { device_id: deviceId } });

export const transferPlayback = (deviceId: string) =>
  request<void>('PUT', '/me/player', { body: { device_ids: [deviceId], play: false } });
