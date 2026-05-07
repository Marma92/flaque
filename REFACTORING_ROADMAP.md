# Flaque Refactoring Roadmap

> Generated 2026-05-06 — branch `refactor/code-cleanup-2026-05`
> Codebase snapshot: ~23.6k LOC backend, ~21.3k LOC frontend

The previous roadmap (2026-04-19) has been retired — most of its Phase 1 items
landed (`scannerService` split, `AuthenticatedApp` 1453 → 594 LOC, `AppShell`
600+ → 196, unified playlist router, shared types package, `useQuery`,
`queryParsers`, expanded test coverage). This roadmap targets the hot spots
that emerged from the playlist-algorithm overhaul and library-polish work,
plus two cross-cutting items still pending from the previous round (error
handling, data-fetching layer).

## Top targets

| # | File | LOC | Issue |
|---|------|-----|-------|
| 1 | `frontend/src/api.ts` | 1294 | One module, 60+ exports across auth/library/playlists/users/radio/admin |
| 2 | `backend/src/services/playlists/forYouPlaylistService.ts` | 998 | Generation + trace + dismissals + persistence + boot regen mixed |
| 3 | `backend/src/api/playlistRoutes.ts` | 971 | Unified but handlers are long; auth / track-resolution duplication |
| 4 | `frontend/src/components/AudioPlayer.tsx` | 895 | Element wiring, transcode, queue, media-session, repeat inline |
| 5 | `frontend/src/components/PlaylistDetailView.tsx` | 837 | Detail UI + edit + drag-reorder + cover upload mixed |
| 6 | `frontend/src/components/ConfigView.tsx` | 745 | 6 admin sections + bulk-edit logic in one file |
| 7 | `backend/src/api/libraryRoutes.ts` | 667 | Tracks + albums + artists + metadata + bulk delete in one router |
| 8 | `backend/src/services/playlists/playlistStore.ts` | 580 | I/O + hearts + listens + reordering + cover paths |

---

## Phase A — Quick wins

Pure mechanical moves; no behavioural change. Each item should ship as its own
commit so review is trivial.

- **A1. Split `frontend/src/api.ts`** into `frontend/src/api/{auth,library,uploads,playlists,radio,users,admin,tracks,covers}.ts`.
  Re-export the public surface from `frontend/src/api/index.ts` so existing
  imports of `from "../api"` keep working. Move the shared `request()`
  helper, `ApiError`, and `setUnauthorizedHandler` into `api/client.ts`.
- **A2. Coverflow CSS.** `Coverflow.css` already exists as a sibling file —
  audit `Coverflow.tsx` for any remaining inline `<style>` injection and
  remove it; keep CSS custom properties as inline `style` props.
- **A3. Memo leaf components** — `React.memo` on `AlbumList`, `TrackList`,
  `ArtistCard`. Stabilize the callback props they receive (`useCallback` in
  parents) only where a profiler shows churn.

## Phase B — Backend service decomposition

- **B1. Split `forYouPlaylistService.ts`** → `services/playlists/forYou/{generate.ts, trace.ts, dismissals.ts, store.ts, boot.ts}` with a thin barrel.
- **B2. Split `playlistStore.ts`** → store + `hearts.ts` + `listens.ts` + `coverPaths.ts`.
- **B3. Split `libraryRoutes.ts`** per resource (`tracks`, `albums`, `artists`, `metadata`).
- **B4. Tighten `uploadRoutes.ts` and `playlistRoutes.ts` handlers** — extract probe / persist phases (uploads) and per-resource sub-routers (playlists).

## Phase C — Frontend component decomposition

- **C1. `AudioPlayer.tsx`** — extract `useMediaSession`, `useTranscodeFallback`, queue helpers. UI shell stays in the component.
- **C2. `PlaylistDetailView.tsx`** — extract `PlaylistHeader`, `PlaylistTrackList`, `PlaylistEditDialog`.
- **C3. `ConfigView.tsx`** — one file per admin section under `components/config/`; the switcher stays.

## Phase D — Cross-cutting

- **D1. Centralized backend error handling** — `AppError` class with `statusCode` + `code`; Express error middleware emits `{ error, code?, details? }`; convert routes to `next(err)`.
- **D2. Frontend API error normalization** — `ApiError` already exists; ensure 401 short-circuits via `setUnauthorizedHandler` from a single place.
- **D3. (Optional) `useResource` cache** — a thin in-flight-dedupe + invalidate cache shared by domain hooks, instead of pulling in `react-query`.

## Phase E — Tests for new boundaries

Add focused unit tests at the seams introduced in B and C. No coverage chase —
just the pure functions and small hooks that are now standalone.

---

## Out of scope this round

- SQLite migration for playlist/metadata storage
- `@tanstack/react-query` adoption
- OpenAPI → frontend type codegen
- Docker image / multi-stage build optimisation

## Suggested execution order

| Order | Item | Effort | Risk |
|-------|------|--------|------|
| 1 | A1 split api.ts | S | Low |
| 2 | A2 Coverflow CSS | XS | Low |
| 3 | A3 memo leaves | S | Low |
| 4 | B1 split forYouPlaylistService | M | Medium |
| 5 | B2 split playlistStore | M | Medium |
| 6 | B3 split libraryRoutes | M | Low |
| 7 | B4 tighten upload/playlist handlers | M | Medium |
| 8 | C1 AudioPlayer extraction | M | Medium |
| 9 | C2 PlaylistDetailView extraction | M | Low |
| 10 | C3 ConfigView per-section files | S | Low |
| 11 | D1 backend error middleware | M | Medium |
| 12 | D2 frontend 401 single point | XS | Low |
| 13 | D3 useResource cache (optional) | M | Medium |
| 14 | E tests at new seams | M | Low |
