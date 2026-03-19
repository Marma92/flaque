# Flaque

<p align="center">
  <img src="frontend/public/favicon.png" alt="Flaque logo" width="260" />
</p>

<p align="center"><strong>F</strong>ile-based <strong>L</strong>ibrary <strong>A</strong>udio <strong>QU</strong>ery <strong>E</strong>ngine</p>

Flaque is a self-hosted web audio player focused on hi-fi streaming, durable file-based storage, and simple operations.
It is designed for people who want to keep music files under their control while still having a modern browsing and playback interface.

## Why Flaque

* File-first architecture with predictable folders
* FLAC-first streaming with HTTP range support
* Rich metadata extraction (title, artist, album, year, track/disc, cover, extras)
* Multi-user auth (admin/user) with SQLite sessions
* Playlists, playback queue/history, and modern player controls
* Built to run locally and in production with Docker

## Tech Stack

* `backend/`: Node.js + Express + TypeScript + SQLite (`better-sqlite3`)
* `frontend/`: React + TypeScript + Vite + Tailwind
* Runtime data: filesystem under `data/` (or custom `DATA_ROOT`)

## Runtime Data Layout

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

`data/` contains runtime-generated state and user content and is intentionally ignored by Git (except structure keepers).

## Local Development

### Prerequisites

* Node.js 20+
* npm 10+
* `ffprobe` / `ffmpeg` in `PATH`

Debian/Ubuntu:

```bash
sudo apt-get update
sudo apt-get install -y ffmpeg
```

### Install

```bash
npm install
cp backend/.env.example backend/.env
```

At minimum set these values in `backend/.env`:

* `ADMIN_USERNAME`
* `ADMIN_PASSWORD`

### Start

```bash
npm run dev
```

* Frontend: `http://localhost:5173`
* Backend: `http://localhost:4000`

## Production Deployment (Docker)

Flaque ships with separate production containers for backend and frontend:

* `backend/Dockerfile`
* `frontend/Dockerfile`
* `docker-compose.prod.yml`

### One-command guided setup

```bash
npm run prod:setup
```

The setup script:

1. Checks Docker/Compose availability
2. Prompts for admin username/password
3. Prompts for host mount paths (`storage` and runtime state)
4. Generates `.env.production`
5. Builds images
6. Initializes DB/directories (`initSystem`)
7. Starts the stack

### Manual lifecycle commands

```bash
npm run prod:up
npm run prod:down
```

## Core API Surface

### Auth

* `POST /api/auth/login`
* `POST /api/auth/logout`
* `GET /api/auth/me`

### Users (admin)

* `GET /api/users`
* `POST /api/users`
* `PATCH /api/users/:id`
* `POST /api/users/:id/reset-password`
* `DELETE /api/users/:id`

### Upload & Library

* `POST /api/upload/inspect`
* `POST /api/upload`
* `GET /api/library`
* `GET /api/tracks`
* `GET /api/artists`
* `GET /api/albums`
* `GET /api/album/:id`

### Playback

* `GET /api/tracks/:id/stream`
* `GET /api/tracks/:id/adjacent?direction=next|previous&wrap=true|false`
* `GET /api/covers/:id`
* `GET /api/covers/from-path?path=<relativePath>`

### Playlists

* `GET /api/playlists`
* `GET /api/playlists/:id`
* `POST /api/playlists`
* `PATCH /api/playlists/:id`
* `PUT /api/playlists/:id`
* `DELETE /api/playlists/:id`

## Player & UX Notes

* Sticky bottom player on library/upload/config views
* Dedicated expanded player view
* Repeat and shuffle controls
* Queue panel (`Played`, `Now`, `Next`)
* Recently played tracks persisted in `localStorage`
* Quality selector (`Original`, `Opus fallback`, `MP3 fallback`)
* Missing covers fallback to bundled default art

## Build & Test

```bash
npm run test
npm run build
```

## Environment Variables (Backend)

From `backend/.env.example`:

* `PORT` (default: `4000`)
* `CORS_ORIGIN` (default: `http://localhost:5173`)
* `ADMIN_USERNAME`
* `ADMIN_PASSWORD`
* `SESSION_TTL_HOURS` (default: `168`)
* `DATA_ROOT` (default: `../data`)

## Project Goals

* Keep files as the source of truth for library media
* Keep operations easy for self-hosters
* Keep architecture explicit, inspectable, and robust
