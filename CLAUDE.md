# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev                                  # Vite dev server on http://127.0.0.1:5173 (strictPort)
npm test                                     # vitest run (all tests)
npx vitest run src/engine/session.test.ts    # single file
npx vitest run -t "freezes the countdown"    # single test by name
npm run build                                # tsc --noEmit + vite build → dist/
```

No linter is configured; `tsc --noEmit` (strict, `noUnusedLocals/Parameters`) is the check.
Local dev needs `.env.local` with `VITE_SPOTIFY_CLIENT_ID` (see `.env.example`).
Always use `127.0.0.1`, never `localhost`. Spotify rejects `localhost` redirect URIs.

## What this is

This is a client-only React + TypeScript SPA hosted on Azure Static Web Apps. For each song in a Spotify playlist,
it starts playback at an offset, plays for a set length, can play a cue sound, then moves to the next song.
There is no backend. Spotify sign-in uses Authorization Code + PKCE straight from the browser, and tokens are kept in `localStorage`.

## Architecture

**Timing is owned by the app, not Spotify.** Each song is started with `PUT /me/player/play {uris:[uri], position_ms}`
(`spotify/api.ts`). Spotify's queue and shuffle are never used.

- `engine/session.ts`: `SessionController` is a framework-free state machine
  (`idle → starting → playing ⇄ paused → cue → … → done|error`). Every dependency is injected through `SessionDeps`:
  API calls, `confirmPlaying`, `playCue`, the ticker, the clock and the rng. That keeps it unit-testable with fakes
  (`session.test.ts`). Each async step checks a `run` counter, so stop and skip cancel any in-flight work. Keep this
  pattern when adding steps.
- `engine/useSession.ts` connects the controller to React, the real API and the Web Playback SDK. It implements
  `confirmPlaying`: the countdown starts only once playback is confirmed. For the browser device that comes from an SDK
  state event; for remote devices it polls `/me/player`. When the browser device is the target, it also forwards
  pauses/resumes and device loss that Spotify reports on its own. The controller ignores these for `ECHO_WINDOW_MS`
  after its own play/pause calls.
- `engine/ticker.ts`: the countdown ticks from a Blob Web Worker. Hidden tabs throttle main-thread timers heavily
  (down to once a minute in Chrome), which would break the timing when audio plays on another device.
- `engine/segment.ts`: pure functions that pick the start offset and play length. They pull the start earlier so a clip
  never runs past the end of the song, and play short songs from 0.
- `engine/settings.ts` holds the settings shape and validation, persisted to `localStorage` as `ph.settings`.
  `engine/sounds.ts` has cues synthesized with Web Audio, plus an optional uploaded file stored as a data URL (limit 1.5 MB).
- `spotify/useWebPlayer.ts` loads the Web Playback SDK once, so the tab becomes a Spotify Connect device.
  `DevicePicker` lists other devices.
- Routing: there is no router. `App.tsx` checks for `pathname === '/callback'`. SWA's `navigationFallback`
  (`public/staticwebapp.config.json`) serves `index.html` for it.

### Auth relay for PR previews (`auth/relay.ts`, `auth/pkce.ts`)
Each SWA preview environment has its own hostname, and Spotify does not allow wildcard redirect URIs. So every environment
uses `VITE_AUTH_REDIRECT_ORIGIN` (production) + `/callback` as `redirect_uri`, and puts `{o: its origin, n: nonce}` in `state`.
Production's `/callback` forwards the code to `o`, but only if `isAllowedReturnOrigin` passes. That function allows the
auth origin, `http://127.0.0.1:5173`, the SWA default host, and `<swa-subdomain>-<n>.<region>[.<partition>].azurestaticapps.net`.
The SWA host comes from `VITE_SWA_DEFAULT_HOST`, or from the auth origin's host when that is an azurestaticapps.net host.
It must be set when the auth origin is a custom domain.
The originating environment then exchanges the code with its own PKCE verifier. When `VITE_AUTH_REDIRECT_ORIGIN` is unset,
the redirect goes to the current origin (normal local dev). Changes to the allowlist need matching cases in `relay.test.ts`.

## Spotify API constraints (Feb 2026 changes)
- Playlist contents come from `GET /playlists/{id}/items`, and each entry uses `item` (formerly `track`).
  The playlist object's `tracks` field is now `items`. `api.ts` accepts both names defensively.
- Development-mode apps can read the contents only of playlists the user **owns or collaborates on**.
  `Playlist.readable` tracks this, and the others appear in the UI as unplayable. Liked Songs (`/me/tracks`) works.
- Premium is required for the SDK and player endpoints. Development mode allows up to 5 allowlisted users.

## Deployment
`.github/workflows/azure-static-web-apps.yml`:
- PR opened or updated: test, build, and deploy the prebuilt `dist/` to that PR's SWA preview environment.
- PR closed: `action: close` deletes that preview environment.
- Push to `main`: deploys to production.

The workflow needs the secret `AZURE_STATIC_WEB_APPS_API_TOKEN` and the variables `VITE_SPOTIFY_CLIENT_ID`,
`VITE_AUTH_REDIRECT_ORIGIN` and `VITE_SWA_DEFAULT_HOST`. Production is SWA `spotify-power-hour-swa` (resource group `spotify-power-hour`,
default host `gentle-sky-0b9139a10.2.azurestaticapps.net`, custom domain `powerhour.bleemus.dev`). The Free tier allows 3 preview environments at once.
