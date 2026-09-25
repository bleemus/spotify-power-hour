export const CLIENT_ID: string = import.meta.env.VITE_SPOTIFY_CLIENT_ID ?? '';

/** Origin whose /callback is registered in the Spotify dashboard. */
export const AUTH_ORIGIN: string = (
  import.meta.env.VITE_AUTH_REDIRECT_ORIGIN || globalThis.location?.origin || ""
).replace(/\/+$/, '');

export const REDIRECT_URI = `${AUTH_ORIGIN}/callback`;

export const DEV_ORIGIN = 'http://127.0.0.1:5173';

export const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read',
];
