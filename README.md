# Power Hour for Spotify

Sign in with Spotify and pick a playlist. Each song starts a set number of seconds in, plays for a set
length, then the next song comes on. Both values can be fixed, or randomized within a min/max range for
each song. You can also turn on a sound (built-in or your own file) that plays when time's up.

The app plays in the browser tab (Spotify Web Playback SDK) or on any of your Spotify Connect devices.
It is a static, client-only React app. Sign-in uses Authorization Code + PKCE, so there is no backend and no client secret.

**You need Spotify Premium.** Spotify requires it for playback control.

## Spotify app setup (one time)

1. Go to <https://developer.spotify.com/dashboard> and create an app. Pick **Web API** and **Web Playback SDK**.
2. Add these redirect URIs:
   - `http://127.0.0.1:5173/callback` for local dev. Spotify rejects `localhost`.
   - `https://<your-swa-host>/callback` for production.
3. Under **User Management**, add the Spotify accounts that may sign in. Development-mode apps allow up to 5.
4. Copy the **Client ID**. It is public, not a secret.

Spotify limits for development-mode apps (Feb 2026):
- Apps can only read the contents of playlists **you own or collaborate on**.
- Followed and Spotify-made playlists appear under "can't be played". To use one, copy it into a playlist of your own. Liked Songs always works.

## Run locally

```bash
cp .env.example .env.local   # set VITE_SPOTIFY_CLIENT_ID
npm install
npm run dev                  # http://127.0.0.1:5173
npm test
```

## Deploy (Azure Static Web Apps + GitHub Actions)

`.github/workflows/azure-static-web-apps.yml`:

| Event | What happens |
| --- | --- |
| PR opened / updated against `main` | test → build → deploy to that PR's **own preview environment** (URL is commented on the PR) |
| PR closed or merged | that PR's preview environment is **deleted** |
| push to `main` (i.e. merge) | test → build → deploy to **production** |

The Free tier allows 3 preview environments at once.

GitHub settings you need:
- Secret `AZURE_STATIC_WEB_APPS_API_TOKEN`: the SWA deployment token.
- Variable `VITE_SPOTIFY_CLIENT_ID`: the Spotify Client ID.
- Variable `VITE_AUTH_REDIRECT_ORIGIN`: the production origin, e.g. `https://gentle-sea-0a1b2c3d4.5.azurestaticapps.net`.
  This must be the `*.azurestaticapps.net` default host, not a custom domain, because the relay derives the allowed preview hosts from it.

### How PR previews sign in

Each preview has its own hostname, and Spotify doesn't allow wildcard redirect URIs. So every environment uses
the **production** `/callback` as its redirect URI and puts its own origin in the OAuth `state`. Production's
`/callback` forwards the code back to that origin. It only does this if the origin is this app's own preview
host pattern (`<name>-<pr>.<region>.azurestaticapps.net`) or the local dev server. The preview then finishes
the PKCE exchange with the verifier it kept. You only register one production redirect URI in Spotify.
See `src/auth/relay.ts`.
