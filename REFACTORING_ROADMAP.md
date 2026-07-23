# Flaque Refactoring Roadmap

> Generated 2026-05-06 — branch `refactor/code-cleanup-2026-05`
> Last updated 2026-05-07 after Phases A–D landed.

The previous roadmap (2026-04-19) has been retired — most of its Phase 1 items
landed (`scannerService` split, `AuthenticatedApp` 1453 → 594 LOC, `AppShell`
600+ → 196, unified playlist router, shared types package, `useQuery`,
`queryParsers`, expanded test coverage). This round targets the hot spots that
emerged from the playlist-algorithm overhaul and library-polish work, plus two
cross-cutting items that were thought to still be pending (error handling, 401
single-point) — both of which turned out to be already in place.

## Phase A — Quick wins ✅

| Item | Status | Notes |
|---|---|---|
| **A1.** Split `frontend/src/api.ts` | ✅ shipped | 1294 → 14 modules under `frontend/src/api/` plus a barrel preserving the public surface. |
| **A2.** Coverflow CSS | ✅ already done | `Coverflow.tsx` already imports `Coverflow.css`; no inline `<style>` injection. |
| **A3.** Memo leaf components | ✅ already done | `AlbumList`, `TrackList`, `ArtistCard` all wrapped in `React.memo` with stable callbacks. |

## Phase B — Backend service decomposition ✅

| Item | Before | After | Modules |
|---|---|---|---|
| **B1.** `forYouPlaylistService.ts` | 998 | 15 | `forYou/{paths,dismissals,store,trace,generate,regenerate}.ts` |
| **B2.** `playlistStore.ts` | 580 | 19 | `playlistStore/{paths,permissions,metadata,migration,scan,mutations,engagement}.ts` |
| **B3.** `libraryRoutes.ts` | 667 | 20 | `library/{overview,tracks,trackAdmin,artists,albums,helpers}.ts` |
| **B4.** `uploadRoutes.ts` | 597 | 128 | `upload/{multer,parsers,ingest,chunked}.ts` |
| **B4.** `playlistRoutes.ts` | 971 | 31 | `playlist/{automatic,forYou,personal,userPlaylists,engagement,helpers}.ts` |

Sub-router mount order is documented in `playlistRoutes.ts` because
prefix-specific groups (`/automatic`, `/for-you`, `/personal`) must precede
the user-CRUD catch-all `/:id`.

## Phase C — Frontend component decomposition ✅

| Item | Before | After | Modules |
|---|---|---|---|
| **C1.** `AudioPlayer.tsx` | 895 | 511 | `audioPlayer/{icons,PlayerArtwork,PlayerTrackInfo,PlayerMobileOptionsPanel,PlayerEmpty}.tsx`. The hook-level pieces the prior plan mentioned (`useMediaSession`, `useTranscodeFallback`) already live in `useAudioPlayback`. |
| **C2.** `PlaylistDetailView.tsx` | 837 | 457 | `playlistDetail/{PlaylistCover,SortableTrackItem,PlaylistEditableTrackList,PlaylistActions,CollaboratorsField}.tsx`. The "edit dialog" is inline rather than a modal so the extraction is per-region. |
| **C3.** `ConfigView.tsx` | 745 | 71 | `config/{IndexOpsSection,FilesSection,BulkDeleteConfirmModal,BulkEditModal}.tsx`. ConfigView is now a thin switcher; the other admin sections (users/server/backup/library) already live in their own files. |

## Phase D — Cross-cutting ✅ (already in place)

The audit found that both pieces of Phase D had already shipped between the
2026-04-19 snapshot and the start of this round:

- **D1. Backend error handling.** `backend/src/utils/AppError.ts` defines
  `AppError(message, statusCode, code?, details?)`. `backend/src/middleware/errorHandler.ts`
  is mounted in both `app.ts` and `api/router.ts`, emits
  `{ error, code?, details? }`, and special-cases `multer.MulterError`. Routes
  consistently use `next(err)`. The two remaining ad-hoc 4xx responses are
  intentional: `radioRoutes.ts` returns a domain-specific envelope and
  `authRoutes.ts` needs a `Retry-After` header alongside the JSON.
  The stable `code` field is consumed by the frontend
  (`frontend/src/api/client.ts`) to localise errors through the `errors` i18n
  namespace.
- **D2. Frontend 401 entry point.** `useSessionRoutingState.ts:95-103`
  registers exactly one `setUnauthorizedHandler` callback that clears the user
  and broadcasts a logout event. The bypass list for normal-login-flow paths
  lives in `frontend/src/api/client.ts`.
- **D3. `useResource` cache (optional).** Skipped — no concrete demand,
  and avoiding speculative caching infrastructure keeps the data layer simple.

## Phase E — Tests for new boundaries (optional follow-up)

The Phase B/C splits were intentionally behaviour-preserving moves of existing
code, so the existing 406 backend + 168 frontend tests still pass and
exercise the same code through the same entry points (the barrels). New
seam-level unit tests are not required for correctness, only for reviewability
of future changes inside a sub-module — file an issue if/when a sub-module
starts evolving independently.

---

## Out of scope this round

- SQLite migration for playlist/metadata storage
- `@tanstack/react-query` adoption
- OpenAPI → frontend type codegen
- Docker image / multi-stage build optimisation

## Final entry-point sizes (all hot spots)

| File | Round start | After this branch |
|------|-------------|--------------------|
| `frontend/src/api.ts` | 1294 | barrel @ `api/index.ts` (15 files) |
| `backend/src/services/playlists/forYouPlaylistService.ts` | 998 | 15 |
| `backend/src/api/playlistRoutes.ts` | 971 | 31 |
| `frontend/src/components/AudioPlayer.tsx` | 895 | 511 |
| `frontend/src/components/PlaylistDetailView.tsx` | 837 | 457 |
| `frontend/src/components/ConfigView.tsx` | 745 | 71 |
| `backend/src/api/libraryRoutes.ts` | 667 | 20 |
| `backend/src/api/uploadRoutes.ts` | 597 | 128 |
| `backend/src/services/playlists/playlistStore.ts` | 580 | 19 |
