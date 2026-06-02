# Internationalization (i18n) — Roadmap

Drafted 2026-06-02. Feature-inauguration roadmap for multi-language support in flaque, shipping **French** as the first non-default locale. This doc is the plan of record: it inventories the current (mono-lingual, English-only) state, fixes the key architecture decisions, and lays out a phased PR breakdown. No code lands in this doc.

**Decisions locked (see §3):** library = **react-i18next**; language preference persisted **on the account (server) with a local fallback**; v1 scope = **UI + full backend** (emails, server-generated names, error messages).

---

## 1. Current state — inventory

flaque has **no i18n layer today**. Every user-facing string is a hardcoded English literal, inline in JSX or in TS. Stack: React 18 + Vite + TypeScript + Tailwind (`frontend/package.json` — no i18n dependency present).

### 1.1 Frontend surface to translate

| Category | Approx. count | Where | Notes |
|---|---|---|---|
| JSX text literals | ~174 sites | across ~94 `.tsx` files (~17k LOC) | The bulk of the work |
| `aria-label` / `title` attributes | ~70 sites | controls, icon buttons (e.g. `AudioPlayer.tsx`) | Accessibility — must be translated too |
| Hand-rolled pluralization | ~27 sites | e.g. `` `${total} track${total === 1 ? "" : "s"}` `` in `PaginatedLibrary.tsx` | Replace with ICU plurals |
| Date/number formatting | ~10 sites | `utils/format.ts:35`, `AccountView.tsx:39`, the `*DetailView.tsx` "Generated …" rows, `AdminServerView.tsx` | Mostly `toLocaleString()` with **no explicit locale**; `AdminServerView.tsx:23` hardcodes `"en-CA"` |
| `<html lang>` | 1 | `frontend/index.html:2` → `lang="en"` | Must track active locale |
| Document title | 1 builder | `hooks/useDocumentTitle.ts` (`"Unknown artist"`, `"… | Flaque"`) | |

### 1.2 Backend / server-generated user-facing strings

These never pass through the browser as data we can translate client-side from raw text, so they need their own treatment:

| Source | File | Strategy implication |
|---|---|---|
| Personal playlist names + descriptions | `backend/src/services/playlists/personalPlaylistService.ts:105` (`VARIANT_LABELS`: "Discovered this year", "Forgotten favorites", "Album deep cuts") | Already keyed by `PersonalVariantId` — translate client-side from the stable variant id |
| Auto playlist names | `backend/src/services/playlists/*` (genre × decade × tempo, data-driven) | Translate the *template* client-side; keep genre/decade as data |
| For-You playlist names | `forYouRanker.ts`, `playlistTrace.ts` | Seed-artist driven (data); minimal fixed text |
| Transactional emails | `auth/passwordResetEmail.ts`, `utils/email.ts`, `services/storage/storageWarningService.ts` | **No client** to translate — must render server-side in the recipient's stored language |
| API error messages | `AppError(...)` throughout (often shown raw via `setLibraryError(message)`) | Introduce stable error codes; translate client-side |

### 1.3 Identity model — no language anywhere

- `User` type = `{ id, username, email, role }` (`frontend/src/types.ts:11`). No `language`.
- Auth store is SQLite (`backend/src/auth/dbConnection.ts`); the `users` table has no language column. There **is** a clean additive-migration pattern already in use: `ensureUserSchemaMigrations()` + `hasTableColumn()` guard + `ALTER TABLE users ADD COLUMN …` (`dbConnection.ts:122–129`). We follow that exact shape.
- Account reads/writes: `backend/src/auth/db.ts` (`createUser`, `findUserBy*`, `UserRow`); the current-user payload flows to the frontend via `getCurrentUser()`.

---

## 2. Target architecture

### 2.1 Frontend (react-i18next)

**Dependencies:** `i18next`, `react-i18next`, `i18next-browser-languagedetector`.

**Layout:**
```
frontend/src/i18n/
  index.ts                # init + config (namespaces, fallback, detection order)
  locales/
    en/  common.json player.json library.json playlists.json account.json admin.json auth.json errors.json
    fr/  …same namespaces…
```

**Namespaces** (split by domain to keep files reviewable and enable lazy loading): `common`, `player`, `library`, `playlists`, `account`, `admin`, `auth`, `errors`.

**Initialization:** in `frontend/src/main.tsx`, before render. `fallbackLng: "en"`, `supportedLngs: ["en", "fr"]`, `interpolation.escapeValue: false` (React already escapes).

**Locale resolution order (detection):** account preference (from the bootstrapped `user.language`) → `localStorage` (`flaque_lang_v1`) → `navigator.language` → `"en"`. The account value wins once the user is loaded; the localStorage/browser values cover the logged-out and pre-bootstrap states.

**Reactive `<html lang>`:** subscribe to i18next `languageChanged` and set `document.documentElement.lang`.

**Usage pattern:** `const { t } = useTranslation("player"); t("queue.end")`. Pluralization via i18next suffixes (`key_one` / `key_other`, `{{count}}`). Interpolation via `{{name}}`.

**Centralized formatting:** new `frontend/src/i18n/format.ts` (or extend `utils/format.ts`) exposing locale-aware `formatDate`, `formatDateTime`, `formatNumber`, `formatDuration`, keyed on the active i18next language via `Intl.*`. Replace all `toLocaleString()` / the hardcoded `"en-CA"` call. Duration formatting that already exists stays, but reads the active locale.

### 2.2 Backend

**Language on the account:**
- Migration: `ALTER TABLE users ADD COLUMN language TEXT` guarded by `hasTableColumn`, inside `ensureUserSchemaMigrations()`. Nullable; `NULL` ⇒ treat as `"en"`.
- Thread it through: `UserRow`, every `SELECT … FROM users`, `createUser`, and the current-user payload so the frontend bootstraps with the right locale on first paint.
- Write path: extend the existing account-update endpoint (alongside `updateMyEmail`) with a `PATCH` that accepts `language ∈ {"en","fr"}` and validates it.

**Server-rendered text (emails):** a small backend message catalog — reuse `i18next` (Node, no React) or a plain `Record<lang, Record<key, string>>` for the handful of email templates. `passwordResetEmail.ts` and `storageWarningService.ts` render in the recipient's stored `language` (fallback `"en"`). This is the part that genuinely cannot be deferred to the client.

**Server-generated playlist names — translate at the edge, not at generation:** keep the generator output **locale-free**. Personal playlists already carry a stable `variant` (`PersonalVariantId`); the frontend maps variant → localized name/description from `playlists.json`. Auto playlists expose their structured parts (genre, decade, tempo) so the frontend renders a localized template (e.g. `"{{decade}}s {{genre}}"`). This avoids regenerating playlists on language change and keeps one source of truth for copy in the frontend catalog. (Email is the only place we must localize server-side.)

**API errors — stable codes:** introduce an error `code` on user-facing `AppError`s (e.g. `errors.playlist.empty`) carried in the JSON body. The frontend translates `code` via the `errors` namespace and falls back to the server `message` (English) when no code is present, so the migration can be incremental rather than big-bang.

---

## 3. Decisions (resolved)

| # | Decision | Choice | Rationale |
|---|---|---|---|
| D1 | i18n library | **react-i18next** | Ecosystem standard; ICU-style plurals, interpolation, namespaces, lazy loading, browser detection out of the box. Right fit for flaque's size. |
| D2 | Preference storage | **Account (server) + local fallback** | Cross-device consistency, matching the existing server-side "resume" state. `localStorage`/`navigator.language` cover logged-out and first-paint. |
| D3 | v1 scope | **UI + full backend** | Inaugurate French everywhere a user can read it: UI, emails, generated playlist names, error messages. |
| D4 | Generated names | **Locale-free server output, translate client-side from stable keys** | No playlist regeneration on language switch; single copy source. |
| D5 | Error messages | **Stable codes + English fallback** | Incremental migration; no flag-day rewrite of every `AppError`. |

Open follow-ups (not blocking v1): RTL support (irrelevant for fr, but the formatting/layer choices shouldn't preclude it later); translator workflow / external TMS (v1 ships hand-authored fr JSON).

---

## 4. Phased PR breakdown

Each phase is independently shippable and reviewable. Phases 0–1 are sequential prerequisites; 2–4 can partly parallelize once the foundation lands.

### Phase 0 — Foundation + pilot (1 PR)
- Add deps; create `i18n/index.ts`, namespace scaffolding, `en`/`fr` files (en = source of truth, fr seeded).
- Wire init in `main.tsx`; reactive `<html lang>`; `localStorage` + browser detection (account wiring comes in Phase 1).
- Add `i18n/format.ts` (locale-aware date/number/duration).
- **Pilot migration end-to-end on one self-contained surface — the audio player** (`AudioPlayer.tsx` + player status messages in `usePlaybackCommands.ts`): validates plurals, interpolation, aria-labels, and formatting before scaling out.
- Add a language switcher in `AccountView.tsx` (en/fr) writing to `localStorage` for now.

### Phase 1 — Account language preference (1 PR, backend + frontend)
- DB migration (`language` column) + `db.ts`/`UserRow`/current-user payload + validated `PATCH` write path.
- Frontend: bootstrap locale from `user.language`; switcher writes to the account (and mirrors to `localStorage`).
- Tests: migration test (extend `db.migrations.test.ts`), endpoint test, resolution-order unit test.

### Phase 2 — Frontend UI string extraction (2–4 PRs, by namespace)
Sweep the remaining surface, one domain per PR to keep diffs reviewable:
- `library` + home (`HomePanels.tsx`, `PaginatedLibrary.tsx`, library sections) — includes most plural sites.
- `playlists` (detail views, including the variant-name mapping from Phase 3 keys).
- `account` + `auth` (login, account, sessions).
- `admin` (admin views — lower priority, larger volume).
- Each PR: replace literals, `aria-label`s, document title; route all date/number formatting through `i18n/format.ts`; author fr strings.

### Phase 3 — Server-generated content (1–2 PRs)
- Make generated playlist output locale-free; expose structured fields (variant id / genre / decade / tempo).
- Frontend renders localized names/descriptions from the `playlists` namespace.
- Note: stored playlists are regenerated periodically, so old English names self-heal; optionally backfill on deploy.

### Phase 4 — Backend emails + error codes (1–2 PRs)
- Backend message catalog; render password-reset and storage-warning emails in the recipient's language.
- Add `code` to user-facing `AppError`s; frontend `errors` namespace + English fallback.

### Phase 5 — Tooling, QA, hardening (1 PR)
- `i18next-parser` script to detect missing/unused keys; wire a CI check.
- Pseudolocalization mode for QA (catches untranslated literals + truncation).
- Key-naming convention + contributor notes (append to this doc or `CLAUDE.md`).
- fr e2e smoke (Playwright): switch language, assert a few key surfaces.

---

## 5. Risks & gotchas

- **Tests asserting on English text will break.** Several unit/e2e tests match visible copy (e.g. player queue messages, `ResumeRow` "Resume"). Mitigation: default the test i18n instance to `en` and assert against `t(...)`/keys or stable roles, not raw French. Budget time for this in Phases 2–4.
- **First-paint flash.** If locale resolves after render, the user sees English then French. Mitigation: resolve `localStorage`/browser synchronously before first render; the account value reconciles on user load (rare, brief).
- **Plural/format correctness.** French plural rules and number/date formats differ from English; rely on ICU plurals + `Intl`, never string concatenation. The ~27 hand-rolled plural sites are the main trap.
- **Key sprawl.** Without the Phase 5 linter, dead/missing keys accumulate. Land the tooling, don't defer it indefinitely.
- **Email locale correctness.** Password-reset emails must use the *recipient's* stored language, not the requester's session — verify in tests.
- **`@flaque/shared` boundary.** Keep translation catalogs in the frontend (and a separate small backend catalog); don't leak UI copy into `shared` types.

---

## 6. Rough effort

| Phase | Relative size |
|---|---|
| 0 — Foundation + pilot | M |
| 1 — Account preference | S |
| 2 — UI extraction | L (the bulk — ~174 text + 70 aria + 27 plural sites) |
| 3 — Generated names | S–M |
| 4 — Emails + error codes | M |
| 5 — Tooling + QA | S–M |

The long pole is Phase 2 (sheer string volume). Everything else is small-to-medium and well-bounded by the existing patterns (additive DB migration, account endpoint, format utils).
