# Playlist Remake Roadmap

**Target version**: 0.3.0
**Codename**: TBD
**Status**: Planning

---

## Overview

A ground-up rethinking of how playlists work in flaque. The goal is to go from a flat list of user-created playlists to a rich, categorized experience with three distinct playlist families: personal playlists, community-curated popular playlists, and server-generated automatic playlists powered by genre and listening habits.

This roadmap is organized in 7 phases. Each phase is designed to land as a shippable increment, but later phases depend on earlier ones being complete.

---

## Dependency graph

```
Phase 1 (Genre)  ──────────────────────────┐
                                            ├──> Phase 5 (Auto playlists)
Phase 2 (Play tracking) ──┬────────────────┤
                           │                └──> Phase 6 (Smart "For You")
                           ├──> Phase 3 (Hearts & listen counts)
                           │         │
                           │         └──> Phase 4 (Playlist view overhaul)
                           │                        │
Phase 7 (Drag-and-drop) ───────────────────────────┘
```

Phases 1 and 2 have no dependency on each other and can be worked in parallel.
Phase 7 (drag-and-drop) is independent and can be done at any point.

---

## Resolved design decisions

These were discussed during planning and are final:

1. **Genre synonym mapping**: Hardcoded default shipped with a solid base mapping (usable as-is). Admin override available in settings for fine-tuning by server owners.
2. **Auto playlist configuration**: Admin-configurable via settings — both the maximum number of auto playlists generated and the minimum number of tracks per playlist.
3. **"For You" dismissal**: Users can dismiss a "For You" playlist. A dismissal is treated as a strong signal and recorded per-user. The dismissed playlist will not be suggested again for **3 months**, after which it may reappear if the user's listening habits still warrant it.
4. **Playlist descriptions**: Added to scope. An optional `description` field on `playlist.json`, shown on the detail page. Users can write a short description for their playlists.
5. **Custom playlist cover**: Added to scope. Users can upload a custom cover image for their playlist, replacing the automatic mosaic patchwork when set.
6. **Collaborative playlists**: In scope architecturally. The playlist model will include a `collaborators: string[]` field from the start. Collaborators can add/remove/reorder tracks but cannot delete the playlist or change its settings. Full collaborative playlist features are a future milestone but the data model must accommodate them now.

---

## Phase 1 — Genre infrastructure

**Goal**: Every track in the library has genre metadata, either extracted from the file, manually set, or enriched via MusicBrainz. This is the foundation for automatic playlists.

### 1a. Extend metadata overrides to support genre

**What changes**:
- Add `genre?: string[]` to `TrackMetadataOverride` in `metadataOverrideStore.ts`
- Add `genre?: string[]` to `TrackMetadataPatch` (the frontend-facing patch type)
- Update `uploadService.ts` to pass genre through the override pipeline
- Update the single-track and bulk metadata edit APIs to accept genre patches
- Update the frontend metadata edit forms (single track edit in admin, bulk edit) to show and edit genre as a comma-separated tag input

**What already exists**:
- `TrackTags.genre` is already `string[]` — the type is ready
- `audioProbe.ts` already extracts genre from file metadata via `music-metadata`
- The override system works for title/artist/album/year — genre follows the same pattern

**Considerations**:
- Genre values from files are freeform strings (e.g. "Progressive Rock", "Prog Rock", "prog-rock"). A lightweight normalization step (trim, title-case) during extraction would reduce fragmentation without losing user intent.
- No genre taxonomy is enforced — users can set any value. Normalization only applies to auto-extracted and MusicBrainz-enriched values.

### 1b. MusicBrainz genre lookup service

**What to build**:
- New service: `backend/src/services/genre/musicBrainzService.ts`
- Query the [MusicBrainz API](https://musicbrainz.org/doc/MusicBrainz_API) to find genre tags for a recording, searching by artist + title
- Lookup chain: search recordings → fetch recording details → read genre/tag data
- Must respect MusicBrainz rate limit: **1 request per second** (mandatory). Use a serial queue with delay.
- Set a proper `User-Agent` header as required by MusicBrainz API policy (e.g. `flaque/<version> (https://github.com/Marma92/flaque)`)
- Return normalized genre strings or an empty array if nothing is found
- Cache results to disk (simple JSON map `artist+title → genres`) to avoid redundant lookups

**Technical notes**:
- MusicBrainz is fully open, no API key required for moderate usage — fits a self-hosted server perfectly
- The lookup is best-effort: if MusicBrainz doesn't have the recording, the track simply stays without genre
- Endpoint: `https://musicbrainz.org/ws/2/recording?query=artist:{artist}+recording:{title}&fmt=json`

### 1c. Genre synonym mapping

**What to build**:
- A hardcoded default synonym map shipped with the server (e.g. `"prog rock" → "progressive rock"`, `"synth pop" → "synthpop"`, `"hiphop" → "hip-hop"`). The default must be solid enough to use as-is.
- An admin settings UI to view, add, edit, or remove synonym entries — positioned as fine-tuning for server owners, not something regular users need to touch.
- Storage: `data/config/genre-synonyms.json`. On first boot, seeded from the hardcoded defaults. Admin edits modify this file.
- Applied during: MusicBrainz enrichment, auto playlist grouping, and genre display normalization. **Not** applied to raw file metadata or user-set overrides (those stay as-is; normalization is at read/display time).

### 1d. Auto-enrichment pipeline

**What to build**:
- **On upload**: After metadata extraction, if `tags.genre` is empty or missing, queue the track for MusicBrainz lookup. If a result is found, store it via the metadata override system.
- **Background scan**: A one-time (or on-demand) job that scans all existing tracks with missing genre and attempts MusicBrainz enrichment. This handles the existing library backlog.
- Enriched genres are stored as metadata overrides, meaning they can be manually corrected by the user at any time.

**Considerations**:
- The background scan can be slow due to rate limiting (1 req/sec). For a library of 1000 tracks missing genre, that's ~17 minutes. This should run as a non-blocking background task with progress logging.
- A "genre enrichment status" indicator in the admin panel would be useful (e.g. "342/1200 tracks have genre metadata").

### 1e. Genre display in the UI

**What to build**:
- Show genre tags on the track detail displays (track list rows, album track views)
- Show genre in upload preview (already extracted, just needs rendering)
- Genre editing in the single-track metadata edit modal and bulk edit modal
- Genre display as small pill/badge components (similar to the lyrics "L" badge pattern already in use)

---

## Phase 2 — Playback tracking

**Goal**: Know what each user listens to and how much. This powers popular playlist ranking and personalized automatic playlists.

### 2a. Per-user play counter store

**What to build**:
- New store: `backend/src/services/activity/playCountStore.ts`
- Storage: one JSON file per user at `data/users/{userId}/play-counts.json`
- Schema:
  ```json
  {
    "tracks": {
      "track-id-1": { "count": 42, "lastPlayedAt": "2026-04-12T10:30:00Z" },
      "track-id-2": { "count": 7, "lastPlayedAt": "2026-04-11T22:15:00Z" }
    }
  }
  ```
- Functions: `incrementPlayCount(userId, trackId)`, `getUserPlayCounts(userId)`, `getUserTopArtists(userId, limit)`
- `getUserTopArtists` aggregates play counts by artist name (from the track index) and returns the top N

**Why `lastPlayedAt`**: It's lightweight to store alongside the counter and enables potential "recently played" features without needing a separate system.

### 2b. Play event endpoint

**What to build**:
- New endpoint: `POST /api/tracks/:id/play`
- Called by the frontend when a track starts playing (or after a short threshold, e.g. 10 seconds, to avoid counting skips)
- Increments the per-user play counter
- Authenticated — userId comes from the session
- Returns 204 (no body) — fire-and-forget from the frontend's perspective

**Frontend integration**:
- The audio player component calls this endpoint when playback begins (with a small debounce to avoid double-counting on seek/restart)
- No UI impact — this is a background signal

### 2c. Play stats API

**What to build**:
- `GET /api/me/play-stats` — returns the current user's top tracks and top artists (derived from play counts)
- Used later by the smart playlist generator (Phase 6) and potentially by an "About you" section in the account view

---

## Phase 3 — Playlist model expansion

**Goal**: Playlists carry engagement data, rich metadata, and a collaboration-ready structure.

**Depends on**: Phase 2 (play tracking provides the listen-count signal)

### 3a. Extend playlist.json schema

**What changes**:
- Expand `playlist.json` on disk with new fields:
  ```json
  {
    "name": "My Metal Playlist",
    "visibility": "public",
    "description": "The best of thrash and prog metal from my collection.",
    "cover": "playlists/my-metal/cover.jpg",
    "hearts": ["user-id-1", "user-id-2"],
    "listenCount": 47,
    "collaborators": []
  }
  ```
- `description`: optional free-text string. Displayed on the playlist detail page.
- `cover`: optional path to a custom cover image uploaded by the playlist owner. When set, replaces the automatic mosaic patchwork.
- `hearts`: array of user IDs. One heart per user, enforced at the API level. Since flaque servers are small-scale, storing full user IDs is fine and enables reliable toggle behavior.
- `listenCount`: integer, incremented when a user plays the playlist.
- `collaborators`: array of user IDs who can add/remove/reorder tracks but cannot delete the playlist or change its settings. Initially empty for all playlists — the field exists to make the model future-proof.
- Update `PlaylistMetadata` type in `playlistStore.ts` to include these fields.
- Update `readPlaylistMetadata` to parse them (defaulting to `""`, `null`, `[]`, `0`, `[]` for existing playlists — seamless migration).
- Update `writePlaylistContents` to persist them.

### 3b. Update the Playlist type

**What changes**:
- Add to the shared `Playlist` type in `types/library.ts`:
  ```typescript
  description: string;
  cover: string | null;
  hearts: string[];
  heartCount: number;      // derived, for convenience
  listenCount: number;
  collaborators: string[];
  ```
- Update `scanFilesystemPlaylists` to populate these fields
- Update `mapPlaylistResponse` in `playlistRoutes.ts` to include them in API responses
- Update the frontend `Playlist` type to match
- Update `canManagePlaylist` to also return true if the user is in `collaborators` (for track editing only — not for settings or deletion)

### 3c. Heart/unheart API

**What to build**:
- `POST /api/playlists/:id/heart` — toggles the heart for the current user (add if absent, remove if present)
- Only works on **user-created playlists** (not automatic playlists)
- Updates `playlist.json` on disk, refreshes the playlist index
- Returns the updated heart count and whether the current user has hearted it
- Only public playlists from other users can be hearted (you can't heart your own playlist)

### 3d. Playlist listen count tracking

**What to build**:
- `POST /api/playlists/:id/listen` — increments the listen count
- Called by the frontend when a user starts playing a playlist (first track begins)
- Debounced: at most one listen per user per playlist per hour (to avoid inflation from repeated plays)
- Updates `playlist.json` on disk

### 3e. Playlist cover upload

**What to build**:
- `POST /api/playlists/:id/cover` — upload a custom cover image (multipart/form-data)
- Only the playlist owner (or admin) can upload a cover
- Store the image in the playlist directory (e.g. `playlists/{slug}/cover.jpg`)
- Resize/optimize on upload (same approach as existing profile photo upload)
- `DELETE /api/playlists/:id/cover` — remove the custom cover, reverting to auto mosaic
- Update the `cover` field in `playlist.json`
- Frontend: cover upload button in the playlist edit modal / detail view

### 3f. Playlist description editing

**What to build**:
- Add `description` to the PATCH `/api/playlists/:id` endpoint (already partially supports arbitrary fields)
- Frontend: text area in the playlist edit modal
- Display on the playlist detail page (Phase 4), below the playlist name

---

## Phase 4 — Playlist view overhaul

**Goal**: Replace the flat playlist list with a categorized layout and a dedicated detail page.

**Depends on**: Phase 3 (hearts, listen counts, descriptions, and covers must exist)

### 4a. Dedicated playlist detail route

**What to build**:
- New route: `/library/playlists/:id`
- New page component: `PlaylistDetailView.tsx`
- Content:
  - Playlist cover: custom cover if set, otherwise auto mosaic (large)
  - Playlist name, description (if set), author name, visibility badge
  - Heart button with count (if public playlist from another user)
  - Listen count display
  - Track count and total duration
  - Full track list with playback controls (play track, add to queue)
  - Play all / Shuffle buttons
  - Edit button (if owner, collaborator, or admin) — opens the edit modal
  - Collaborator list (if any)
  - Back navigation to playlist section
- Clicking a playlist card anywhere in the app navigates to this route instead of expanding inline

**Routing changes**:
- Add `"library/playlists/:id"` to the `PATH_MAP` in `appUtils.ts`
- The route parameter needs to be parsed by `getRouteFromLocation` — this may require a small refactor to support dynamic segments (currently all routes are static)
- Alternative: use a query param approach (`/library/playlists?id=...`) to avoid refactoring the router. Both work; the clean URL is nicer.

### 4b. Three-section playlist layout

**What to build**:
- Refactor `LibraryPlaylistSection.tsx` into three distinct sections:

**"My Playlists"**:
- Shows playlists where `authorId === currentUser.id` (both private and public)
- Includes the "Create playlist" form (moved here from the top of the current section)
- Playlist cards link to the detail view

**"Popular Playlists"**:
- Shows public playlists where `authorId !== currentUser.id`
- Sorted by a composite score: `heartCount * 3 + listenCount` (hearts weigh more because they're intentional; listens accumulate passively)
- Each card shows heart count and listen count badges
- If no public playlists from other users exist, this section is hidden

**"Automatic Playlists"**:
- Shows server-generated playlists (Phase 5)
- Different visual treatment (e.g. gradient or subtle background pattern to distinguish from user playlists)
- Cannot be hearted
- Placeholder until Phase 5 is implemented: "Automatic playlists will appear here once generated"

### 4c. Playlist card redesign

**What to build**:
- Redesign playlist cards to work as navigation links rather than expandable containers
- Show: cover (custom or mosaic), name, author, track count, heart count badge, listen count badge
- Click navigates to `/library/playlists/:id`
- Play button on hover/focus starts playback without navigating
- Compact grid layout (2-3 columns on desktop) instead of the current stacked list

---

## Phase 5 — Automatic genre/decade playlists

**Goal**: The server generates thematic playlists by combining genre and decade (e.g. "70s Rock", "90s Pop", "80s Disco"). Regenerated every 2 weeks, configurable by admins.

**Depends on**: Phase 1 (genre infrastructure must be in place)

### 5a. Playlist generation algorithm

**What to build**:
- New service: `backend/src/services/playlists/autoPlaylistService.ts`
- Scan all tracks in the library, group by `(genre, decade)` pairs
  - Decade derived from `tags.year`: `Math.floor(year / 10) * 10` → "70s", "80s", etc.
  - Genre taken from the first entry of `tags.genre[]` (primary genre), normalized via the synonym map (Phase 1c)
  - Tracks with no genre or no year are excluded
- For each `(genre, decade)` pair with enough tracks (minimum threshold: **admin-configurable**, default 8), generate a playlist:
  - Name: `"{Decade} {Genre}"` (e.g. "70s Rock", "90s Pop")
  - Select tracks up to a configurable max (default 30) using a diversity algorithm (spread across artists, avoid same-album clustering — reuse ideas from the radio's `pickBestCandidate`)
  - Store track IDs in order

**Genre normalization**:
- Apply the synonym map from Phase 1c before grouping
- Title-case the display name

### 5b. Admin configuration

**What to build**:
- New admin settings section or entries within the existing settings:
  - **Maximum number of auto playlists**: caps how many genre/decade playlists are generated (default: unlimited / all qualifying pairs)
  - **Minimum tracks per playlist**: the threshold below which a genre/decade pair is skipped (default: 8)
  - **Tracks per playlist**: max tracks selected per auto playlist (default: 30)
- Stored in `data/config/auto-playlist-config.json`
- Exposed via admin API: `GET/PATCH /api/config/auto-playlists`

### 5c. Storage and lifecycle

**What to build**:
- Storage directory: `data/auto-playlists/`
- Each auto-playlist stored as a JSON file:
  ```json
  {
    "id": "auto:70s-rock",
    "name": "70s Rock",
    "genre": "rock",
    "decade": 1970,
    "trackIds": ["track-1", "track-2", ...],
    "generatedAt": "2026-04-12T00:00:00Z",
    "trackCount": 25
  }
  ```
- Metadata file: `data/auto-playlists/_meta.json` storing `{ lastGeneratedAt: string }`
- **Regeneration schedule**: Every 2 weeks. On server boot, check if `lastGeneratedAt` is older than 14 days — if so, regenerate all auto playlists.
- Regeneration replaces all auto playlists (full rebuild). This naturally picks up new tracks added since the last generation.
- Admin API: `POST /api/playlists/automatic/regenerate` to force regeneration on demand

### 5d. Auto playlist API

**What to build**:
- `GET /api/playlists/automatic` — list all auto playlists (returns id, name, genre, decade, trackCount, generatedAt)
- `GET /api/playlists/automatic/:id` — get a single auto playlist with full track IDs (resolved against the index for track details)
- Auto playlists are **read-only** — no edit, no delete, no heart
- Auto playlists are visible to all authenticated users

### 5e. Frontend integration

**What to build**:
- Fetch auto playlists via the API and display in the "Automatic Playlists" section
- Auto playlist cards use a distinct visual style (genre-colored accent or icon)
- Clicking navigates to a detail view (reuse `PlaylistDetailView` with a read-only mode flag)
- Show "Generated on {date}" instead of an author name

---

## Phase 6 — Smart "For You" playlists

**Goal**: Personalized automatic playlists based on what each user listens to most. "Because you listen to {Artist}" style.

**Depends on**: Phase 1 (genre data) + Phase 2 (play tracking) + Phase 5 (auto playlist infrastructure)

### 6a. User listening analysis

**What to build**:
- Extend `playCountStore.ts` with a `getUserTopArtists(userId, limit)` function:
  - Read the user's play counts
  - Join with the track index to get artist names
  - Aggregate by artist, return top N by total play count
- Minimum threshold: only generate a "For You" playlist if the user has at least **20 total plays** across at least **3 distinct artists** (avoids noisy recommendations for new users)

### 6b. Similar-track matching

**What to build**:
- For each of the user's top 3 artists:
  - Look up the artist's genre(s) and typical decade range from the library
  - Find other tracks in the library that share the same genre and are within ±10 years
  - Exclude tracks by the seed artist (they'll be mixed back in)
- Build a playlist of ~25 tracks:
  - ~40% from the seed artist
  - ~60% from genre/era peers
  - Use the same diversity algorithm as Phase 5 to avoid clustering

### 6c. "For You" playlist generation

**What to build**:
- Generate one "For You" playlist per qualifying top artist, per user
- Naming: `"Because you listen to {Artist}"`
- Storage: alongside auto playlists in `data/auto-playlists/for-you/{userId}/`
- Regenerated on the same 2-week schedule as genre/decade playlists
- Displayed in the "Automatic Playlists" section, visually distinguished (e.g. "Made for you" label)

### 6d. Dismissal system

**What to build**:
- Per-user dismissal store: `data/users/{userId}/dismissed-playlists.json`
- Schema:
  ```json
  {
    "dismissed": [
      { "playlistId": "for-you:pink-floyd", "dismissedAt": "2026-04-12T10:00:00Z" }
    ]
  }
  ```
- When the user dismisses a "For You" playlist, record the dismissal with a timestamp
- During playlist generation and display, skip playlists that were dismissed less than **3 months** ago
- After 3 months, the dismissal expires and the playlist may reappear if listening habits still warrant it
- Frontend: a dismiss/hide button on "For You" playlist cards (e.g. "×" or "Not interested")
- Dismissals only apply to "For You" playlists, not genre/decade auto playlists

### 6e. (Optional) MusicBrainz artist relationships

**Enhancement** (can be deferred):
- Query MusicBrainz for artists related to the seed artist
- Cross-reference with the local library to find matching tracks
- This improves recommendations when the library has artists that are related but don't share exact genre tags

---

## Phase 7 — Drag-and-drop track reordering

**Goal**: Replace the move-up/move-down buttons in the playlist edit modal with drag-and-drop.

**No dependencies** — can be done at any point.

### 7a. Library selection

**Recommended**: [`@dnd-kit`](https://dndkit.com/)
- Modern, accessible, well-maintained
- Built specifically for React
- ~12 KB gzipped (core + sortable)
- Supports keyboard reordering (accessibility)
- Touch-friendly for mobile

Alternative: `@atlaskit/pragmatic-drag-and-drop` (Atlassian's library). Heavier but very polished.

### 7b. Implementation

**What to build**:
- Replace the move-up/move-down buttons in `EditModal` (inside `LibraryPlaylistSection.tsx`) with a `@dnd-kit` `SortableContext`
- Each track row gets a drag handle (grip icon on the left)
- Visual feedback: dragged item has a shadow/elevation, drop target shows an insertion indicator
- On drop: update `trackIds` array in state
- Keep the remove button per track
- Mobile: touch-drag works out of the box with `@dnd-kit`
- Keyboard: arrow keys to move items when focused on the drag handle (built into `@dnd-kit`)

---

## Summary table

| Phase | Name | Depends on | Estimated scope |
|-------|------|-----------|----------------|
| 1 | Genre infrastructure | — | Medium |
| 2 | Playback tracking | — | Small |
| 3 | Playlist model expansion | Phase 2 | Medium |
| 4 | Playlist view overhaul | Phase 3 | Large |
| 5 | Automatic playlists | Phase 1 | Medium–Large |
| 6 | Smart "For You" playlists | Phases 1, 2, 5 | Medium |
| 7 | Drag-and-drop reordering | — | Small |
