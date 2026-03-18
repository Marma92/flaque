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

## API surface

### Auth

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

### Users (admin)

- `GET /api/users`
- `POST /api/users`

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

### Upload

- `POST /api/upload`

### Library

- `GET /api/library`
- `GET /api/tracks`
- `GET /api/artists`
- `GET /api/albums`

### Streaming and covers

- `GET /api/tracks/:id/stream`
- `GET /api/covers/:id`

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

## Operational notes

- `POST /api/index/rebuild` is protected and does not require a server restart.
- Rebuild is lock-safe: readers continue using the current in-memory snapshot during rebuild.
- Symlinks are ignored during filesystem scans.

## Roadmap ideas

- Optional adaptive fallback transcoding (FLAC -> Opus/MP3).
- Playlist support.
- Mobile-first player UX and queue management.
