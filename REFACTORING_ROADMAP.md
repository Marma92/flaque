# Flaque Refactoring Roadmap

> Generated 2026-04-19 — Codebase snapshot: ~18.2k LOC backend, ~19k LOC frontend

---

## Phase 1: Critical — Large File Decomposition & Prop Drilling

These are the highest-impact refactors that directly affect maintainability and developer velocity.

### 1.1 Split `AuthenticatedApp.tsx` (1,453 lines)

**Problem:** This is the largest file in the codebase and acts as a god component. It contains all top-level state management, 40+ state variables, data fetching logic, event handlers, and wires everything together via massive prop drilling through `AppShell` → `LibraryWorkspace` → individual views.

**Plan:**
- Extract data-fetching and state into dedicated custom hooks:
  - `useLibraryData()` — albums, artists, tracks, filters
  - `usePlaylistManager()` — playlist CRUD, hearts, listens
  - `usePlayerState()` — playback, queue, current track
  - `useUploadManager()` — upload queue, progress, processing
  - `useRadioState()` — radio station, tracks, playback
- Consider React Context for deeply-shared state (current track, user, playlists) to reduce prop drilling through 3-4 component layers
- Target: break into ~5 focused hook files + a slim orchestrator component under 200 lines

**Severity:** High  
**Effort:** Large  
**Files:** `frontend/src/AuthenticatedApp.tsx`

### 1.2 Split `AppShell.tsx` (600+ lines)

**Problem:** Pure prop-forwarding component with 40+ props. Exists mainly to pass state from `AuthenticatedApp` to child views. The type definition alone is ~70 lines.

**Plan:**
- Once `AuthenticatedApp` state is moved to hooks/context, `AppShell` can consume context directly instead of receiving props
- Extract the player bar, sidebar, and content area into self-contained components that read their own context
- Target: under 150 lines

**Severity:** High  
**Effort:** Medium (depends on 1.1)  
**Files:** `frontend/src/components/AppShell.tsx`

### 1.3 Split `scannerService.ts` (1,600+ lines)

**Problem:** Largest backend file. Contains probe logic, metadata extraction, override merging, diffing, full scan orchestration, and index building — all in one file. Functions like `performScan` are 200+ lines with deep nesting.

**Plan:**
- Extract into focused modules:
  - `scanner/probe.ts` — ffprobe execution, metadata parsing
  - `scanner/diff.ts` — file change detection, added/removed/changed
  - `scanner/overrides.ts` — metadata override merging (already partially exists)
  - `scanner/indexBuilder.ts` — building the final library index
  - `scanner/orchestrator.ts` — top-level scan flow, ~100 lines
- Add unit tests for probe parsing and diff logic (currently untested)

**Severity:** High  
**Effort:** Large  
**Files:** `backend/src/services/scanner/scannerService.ts`

---

## Phase 2: High Priority — Duplication & Consistency

### 2.1 Consolidate Album Cover Resolution Logic

**Problem:** The `getAlbumCoverSrc()` function is duplicated in 3 components: `LibraryAlbumsSection.tsx`, `LibraryArtistsSection.tsx`, and implicitly in `Coverflow.tsx`. Each copy follows the same pattern: check `album.cover` → `coverPathUrl()`, else `album.previewTrackId` → `coverUrl()`, else `defaultCoverImage`.

**Plan:**
- Extract to a shared utility: `utils/covers.ts` → `getAlbumCoverSrc(album: AlbumEntry): string`
- Similarly consolidate artist photo resolution into `getArtistPhotoSrc()`

**Severity:** Medium  
**Effort:** Small  
**Files:** `LibraryAlbumsSection.tsx`, `LibraryArtistsSection.tsx`, `Coverflow.tsx`

### 2.2 Standardize Backend Error Handling

**Problem:** Route handlers use inconsistent error handling patterns. Some use try/catch with `res.status(500).json({ error })`, some use `res.sendStatus()`, some let errors propagate. No centralized error middleware.

**Plan:**
- Create an `AppError` class with status code and message
- Add centralized Express error-handling middleware
- Replace ad-hoc try/catch blocks in routes with `next(error)` pattern
- Standardize error response shape: `{ error: string, details?: unknown }`

**Severity:** Medium  
**Effort:** Medium  
**Files:** All files in `backend/src/api/`

### 2.3 Unify Playlist Route Architecture

**Problem:** Playlists are split across 4 separate routers — `playlistRoutes.ts`, `autoPlaylistRoutes.ts`, `forYouPlaylistRoutes.ts`, and partially in `router.ts`. Route ordering is fragile (specific routes must come before `/:id` — a bug was already caused by this). The auto and for-you routers have duplicated auth and track-resolution patterns.

**Plan:**
- Merge into a single `playlistRouter` with clear sub-path grouping:
  - `/playlists/automatic/*`
  - `/playlists/for-you/*`
  - `/playlists/:id/*`
- Extract shared middleware for track resolution and playlist authorization

**Severity:** Medium  
**Effort:** Medium  
**Files:** `backend/src/api/playlistRoutes.ts`, `autoPlaylistRoutes.ts`, `forYouPlaylistRoutes.ts`, `router.ts`

---

## Phase 3: Medium Priority — Architecture & Patterns

### 3.1 Extract Frontend Data-Fetching Layer

**Problem:** API calls are scattered across `AuthenticatedApp.tsx` as inline `fetch()` calls mixed with state updates. No centralized error handling, retry logic, or request deduplication. Some hooks (e.g., `useAutoPlaylists`) handle their own fetching while others rely on `AuthenticatedApp`.

**Plan:**
- Create a consistent hook-based data layer:
  - Each domain gets a `useXxxQuery()` hook that handles fetching, caching, loading/error state
  - Consider `react-query` / `@tanstack/react-query` or a lightweight custom solution
- Centralize API error handling (401 → redirect to login, etc.)

**Severity:** Medium  
**Effort:** Large  
**Files:** `frontend/src/AuthenticatedApp.tsx`, `frontend/src/api.ts`, `frontend/src/hooks/`

### 3.2 Split `LibraryWorkspace.tsx` Props

**Problem:** `LibraryWorkspaceProps` is ~85 lines of type definitions with 50+ props. The component is a routing switch that passes different prop subsets to different views. Type changes in any child ripple up through the full chain.

**Plan:**
- Once context is introduced (Phase 1), `LibraryWorkspace` becomes a simple view switcher
- Each section component reads its own data from hooks/context
- `LibraryWorkspace` shrinks to a ~30-line switch/case

**Severity:** Medium  
**Effort:** Medium (depends on Phase 1)  
**Files:** `frontend/src/components/LibraryWorkspace.tsx`

### 3.3 Backend Service Layer Consistency

**Problem:** Services use different patterns for data access. Some read/write JSON files directly, some go through a storage abstraction. The playlist service does its own file I/O with `readJson`/`writeJson`, while the scanner uses a different approach. No consistent transaction or locking pattern for concurrent writes.

**Plan:**
- Introduce a consistent repository pattern or at minimum standardize file-based storage helpers
- Add file locking for concurrent write safety (playlists, overrides)
- Consider moving from flat JSON files to SQLite for playlist/metadata storage as complexity grows

**Severity:** Medium  
**Effort:** Large  
**Files:** `backend/src/services/playlists/`, `backend/src/services/scanner/`, `backend/src/services/storage/`

---

## Phase 4: Quality — Testing & Type Safety

### 4.1 Increase Backend Test Coverage

**Problem:** Most backend services have zero tests. Only `validation.ts` has a test file. The scanner, playlist service, auto-playlist generation, and all route handlers are untested.

**Plan:**
- Priority test targets:
  1. Scanner probe parsing and metadata extraction (pure functions, easy to test)
  2. Auto-playlist generation logic (grouping, filtering, threshold)
  3. Playlist CRUD operations (mock file I/O)
  4. Route handlers (supertest integration tests)
- Set up test infrastructure: vitest config for backend, test fixtures for audio metadata

**Severity:** Medium  
**Effort:** Large  
**Files:** All `backend/src/services/`

### 4.2 Increase Frontend Test Coverage

**Problem:** Only 4 component test files exist (`LibraryAlbumsSection`, `LibraryArtistsSection`, `TrackList`, `PaginatedLibrary`). Core components like `AppShell`, `AuthenticatedApp`, player controls, upload flow, and playlist views have no tests.

**Plan:**
- Priority test targets:
  1. Player controls and queue logic
  2. Playlist detail view (CRUD operations, drag-reorder)
  3. Upload flow (file validation, progress)
  4. Hook tests for extracted data hooks (from Phase 1)

**Severity:** Medium  
**Effort:** Large  
**Files:** `frontend/src/components/`, `frontend/src/hooks/`

### 4.3 Shared Type Definitions

**Problem:** Types are manually maintained in both `backend/src/types/` and `frontend/src/types.ts`. Types like `Track`, `Playlist`, `AlbumEntry`, `ArtistEntry` exist in both codebases and can drift out of sync. API response shapes are implicitly defined.

**Plan:**
- Option A: Create a `shared/` package with common types, imported by both
- Option B: Generate frontend types from backend (e.g., via OpenAPI schema or a simple export script)
- At minimum, add a CI check that compares type shapes between the two

**Severity:** Low  
**Effort:** Medium  
**Files:** `backend/src/types/`, `frontend/src/types.ts`

---

## Phase 5: Low Priority — Polish & Performance

### 5.1 Coverflow CSS → CSS Modules or Tailwind

**Problem:** `Coverflow.tsx` injects ~170 lines of raw CSS via a `<style>` tag. This is the only component using this pattern; everything else uses Tailwind. The CSS is re-injected on every render.

**Plan:**
- Move to a CSS module (`Coverflow.module.css`) or convert to Tailwind where feasible
- CSS custom properties (`--cover-size`) can stay as inline styles

**Severity:** Low  
**Effort:** Small  
**Files:** `frontend/src/components/Coverflow.tsx`

### 5.2 Component Memoization

**Problem:** Large lists (track list, album grid, artist grid) re-render entirely when parent state changes. `AlbumList`, `TrackList`, and `ArtistEntry` cards would benefit from `React.memo` to skip re-renders when their props haven't changed.

**Plan:**
- Wrap leaf components in `React.memo`
- Stabilize callback props with `useCallback` in parent components
- Profile with React DevTools first to identify actual bottlenecks

**Severity:** Low  
**Effort:** Small  
**Files:** `frontend/src/components/AlbumList.tsx`, `TrackList.tsx`, `LibraryArtistsSection.tsx`

### 5.3 Docker Image Optimization

**Problem:** Docker images could be smaller. Frontend build could use multi-stage builds more efficiently. Backend Dockerfile could benefit from better layer caching.

**Plan:**
- Review and optimize Dockerfiles for layer caching
- Ensure production images don't include dev dependencies
- Consider Alpine-based images if not already used

**Severity:** Low  
**Effort:** Small  
**Files:** `backend/Dockerfile`, `frontend/Dockerfile`, `docker-compose.yml`

---

## Suggested Execution Order

| Order | Item | Effort | Impact |
|-------|------|--------|--------|
| 1 | 2.1 Consolidate cover resolution | Small | Quick win |
| 2 | 2.2 Standardize error handling | Medium | Consistency |
| 3 | 1.3 Split scannerService | Large | Backend maintainability |
| 4 | 1.1 Split AuthenticatedApp + hooks | Large | Frontend maintainability |
| 5 | 1.2 Slim down AppShell | Medium | Follows from 1.1 |
| 6 | 2.3 Unify playlist routes | Medium | Backend consistency |
| 7 | 3.1 Data-fetching layer | Large | Frontend architecture |
| 8 | 4.1 Backend tests | Large | Quality/confidence |
| 9 | 4.2 Frontend tests | Large | Quality/confidence |
| 10 | 3.3 Service layer consistency | Large | Backend architecture |
| 11 | 4.3 Shared types | Medium | Type safety |
| 12 | 5.x Polish items | Small | Nice-to-haves |
