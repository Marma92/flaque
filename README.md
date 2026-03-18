# flaque

Self-hosted web audio player oriented hi-fi with strict file-based architecture.

## Product goals

- Upload FLAC/MP3/WAV tracks.
- Share and browse music by owner, artist, album, and text search.
- Stream original audio files with HTTP range support for smooth seek.
- Show metadata and embedded covers.

## Architecture

- `backend/`: independent Node.js + Express + TypeScript API.
- `frontend/`: independent React SPA (Vite + Tailwind).
- `data/`: file-based storage and generated index.

No database is used for track/library business logic.
SQLite is used only for users and sessions.

## Backend data layout

```
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

## Main pipeline

1. Upload audio file to `POST /api/upload`.
2. Validate extension and parse metadata.
3. Compute file hash.
4. Store file under user uploads folder.
5. Extract embedded cover when available.
6. Rebuild global library index (`library-index.json`).

## API endpoints

### Auth

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

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

## Streaming behavior (hi-fi first)

- FLAC files are streamed as-is by default.
- Range requests are fully supported (`Accept-Ranges: bytes`, `206 Partial Content`).
- No mandatory transcoding in MVP.
- Streaming uses `fs.createReadStream` and never loads full files in memory.

## Local setup

## 1) Requirements

- Node.js 20+
- npm 10+
- `ffprobe` available in `PATH`

On Debian/Ubuntu:

```bash
sudo apt-get update
sudo apt-get install -y ffmpeg
```

## 2) Install dependencies

```bash
npm install
```

## 3) Configure backend env

```bash
cp backend/.env.example backend/.env
```

Set at least:

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`

On first run, this admin account is seeded into SQLite.
If no env is set, default bootstrap credentials are `admin` / `admin1234`.
Change them immediately for any non-local usage.

## 4) Start apps (separate terminals)

Backend:

```bash
npm run dev --workspace backend
```

Frontend:

```bash
npm run dev --workspace frontend
```

Frontend default URL: `http://localhost:5173`
Backend default URL: `http://localhost:4000`

Vite proxies `/api` to backend in dev mode.

## Build and tests

Build all:

```bash
npm run build
```

Run backend tests:

```bash
npm run test
```

## Notes

- `POST /api/index/rebuild` is protected and does not require server restart.
- Index rebuild is lock-safe: readers keep using current in-memory snapshot while rebuild is in progress.
- Symlinks are ignored during filesystem scan.

## Next extensions

- Optional adaptive transcoding fallback (FLAC to Opus/MP3).
- Playlist support.
- Mobile-first player UX and queue management.
