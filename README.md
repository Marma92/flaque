# flaque

Self-hosted, hi-fi oriented web audio player built on a strict file-based architecture.

## Overview

`flaque` focuses on simple and durable music library management:

- Upload FLAC/MP3/WAV tracks.
- Browse by owner, artist, album, and text search.
- Stream original files with full HTTP range support for smooth seeking.
- Display metadata and embedded covers.

## Project structure

- `backend/` - Node.js + Express + TypeScript API.
- `frontend/` - React SPA (Vite + Tailwind).
- `data/` - file-based storage and generated index.

No database is used for library business logic.
SQLite is used only for users and sessions.

## Data layout

```text
data/
  config/
    users.db
  storage/
    users/
      <userId>/
        uploads/
  cache/
    covers/
    transcodes/
    tmp-uploads/
  index/
    library-index.json
```

## Upload pipeline

1. Receive audio file via `POST /api/upload`.
2. Validate extension and parse metadata.
3. Compute content hash.
4. Store file in the uploader's folder.
5. Extract embedded cover if available.
6. Rebuild global index (`library-index.json`).

Upload supports one or multiple files in the same request (`files` form field).
Optional `artist` and `album` form fields allow manual override for the whole upload batch.
Overrides are persisted in `data/index/track-metadata-overrides.json`.

## API surface

### Auth

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

### Users (admin)

- `GET /api/users`
- `POST /api/users`
- `PATCH /api/users/:id`
- `POST /api/users/:id/reset-password`
- `DELETE /api/users/:id`

`POST /api/users` request body:

```json
{
  "username": "alice",
  "password": "strong-password",
  "role": "user"
}
```

Validation:

- `username`: 3-32 chars, `[a-zA-Z0-9._-]`
- `password`: 8-256 chars
- `role`: `user` or `admin` (default: `user`)

`PATCH /api/users/:id` request body (partial update):

```json
{
  "username": "alice-renamed",
  "role": "admin"
}
```

Protections:

- Self-deletion is blocked (`DELETE /api/users/:id` cannot target current session user).
- Deleting the last remaining admin account is blocked.
- Demoting the last remaining admin account is blocked (`PATCH /api/users/:id`).
- Password reset revokes existing sessions for the target user.

### Upload

- `POST /api/upload`

Multipart form fields:

- `files`: one or more audio files
- `artist` (optional): forced artist tag for uploaded tracks
- `album` (optional): forced album tag for uploaded tracks

### Library

- `GET /api/library`
- `GET /api/tracks`
- `GET /api/artists`
- `GET /api/albums`

`GET /api/tracks` supports pagination and sorting query params:

- `page` (default `1`)
- `limit` (default `100`, max `500`)
- `sortBy` (`title`, `artist`, `album`, `owner`, `duration`, `codec`, `bitrate`, `sampleRate`, `path`)
- `sortDir` (`asc` or `desc`, default `asc`)
- plus filters: `owner`, `artist`, `album`, `q`

### Streaming and covers

- `GET /api/tracks/:id/stream`
- `GET /api/tracks/:id/adjacent?direction=next|previous&wrap=true|false`
- `GET /api/covers/:id`

Optional fallback transcoding is available behind query param on stream route:

- `GET /api/tracks/:id/stream?transcode=opus`
- `GET /api/tracks/:id/stream?transcode=mp3`

Notes:

- Source streaming remains FLAC-first with byte range support.
- Transcoding fallback currently targets FLAC sources and streams progressively (no byte-range seek on transcoded stream).

### Index management

- `POST /api/index/rebuild` (admin only)

## Streaming model (hi-fi first)

- FLAC is streamed as-is by default.
- Byte ranges are fully supported (`Accept-Ranges: bytes`, `206 Partial Content`).
- No mandatory transcoding in MVP.
- Streaming uses `fs.createReadStream` (no full-file memory loading).

## Local development

### 1) Requirements

- Node.js 20+
- npm 10+
- `ffprobe` available in `PATH`

Debian/Ubuntu:

```bash
sudo apt-get update
sudo apt-get install -y ffmpeg
```

### 2) Install dependencies

```bash
npm install
```

### 3) Configure backend environment

```bash
cp backend/.env.example backend/.env
```

Set at least:

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`

On first run, this admin account is seeded into SQLite.
If no env is set, default bootstrap credentials are `admin` / `admin1234`.
Change them immediately for any non-local usage.

### 4) Start applications (two terminals)

Single command (recommended):

```bash
npm run dev
```

Separate commands:

Backend:

```bash
npm run dev --workspace backend
```

Frontend:

```bash
npm run dev --workspace frontend
```

- Frontend default URL: `http://localhost:5173`
- Backend default URL: `http://localhost:4000`
- In dev mode, Vite proxies `/api` to the backend.

## Build and test

Build all workspaces:

```bash
npm run build
```

Run backend tests:

```bash
npm run test
```

## Admin UI

In the frontend `Admin` tab (admin users only), you can:

- create users,
- patch username/role,
- reset passwords,
- delete users,
- search users by username/id,
- filter the table by role (`all`, `admin`, `user`).

## Player navigation route

`GET /api/tracks/:id/adjacent` returns the next or previous track from the current index order.

Query params:

- `direction`: `next` (default) or `previous`
- `wrap`: `true` (default) or `false`
- optional library filters: `owner`, `artist`, `album`, `q`

Example:

```bash
curl "http://localhost:4000/api/tracks/<trackId>/adjacent?direction=next&owner=<ownerId>"
```

## Player UX behavior

- The library page keeps playback controls in a sticky player at the bottom.
- Clicking a track in the library starts playback without switching to the dedicated `Player` page.
- Recently played tracks are stored in browser `localStorage` and listed in a `Played Recently` panel; clicking an entry replays it.
- Long titles are truncated in both the track list and player UI.
- After pausing playback, automatic playback on track change is disabled until a manual play/replay action occurs.

## Operational notes

- `POST /api/index/rebuild` is protected and does not require a server restart.
- Rebuild is lock-safe: readers continue using the current in-memory snapshot during rebuild.
- Symlinks are ignored during filesystem scans.

## Roadmap ideas

- Playlist support.
- Mobile-first player UX and queue management.
