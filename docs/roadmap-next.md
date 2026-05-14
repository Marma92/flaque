# Roadmap — Next

Drafted 2026-05-14. Tracks the next batch of app-wide improvements after the MusicBrainz Phase 1–7 work and the listening-stats display fix (PR #177).

## Prioritization rationale

Four themes are in flight. They differ in scope, risk, and how much design is locked in:

| Priority | Theme | Why this slot |
|----------|-------|---------------|
| **P0** | Account view UX cleanup | Smallest, lowest-risk, immediately visible. Ships momentum. |
| **P1** | Albums view sorting | Well-scoped feature, existing artist-letter pattern to reuse. Clear acceptance criteria. |
| **P2** | Home view UX/UI study | Open-ended; needs a discovery pass before any code. Output is a follow-up plan, not features. |
| **P3** | AI-assisted automatic playlists | Highest impact, highest unknown. Needs design spike (model choice, latency, cost, prompt strategy). Run as a parallel longer-track once P0/P1 ship. |

Recommended order of execution: **P0 → P1 → P2 (study) → P3 (design spike during P1 if capacity allows, otherwise after P2)**.

---

## P0 — Account view UX cleanup

**Goal:** make the account page feel finished — fewer dead controls, clearer password change flow, listening-stats panel that visually matches the rest of the surface.

**Scope (single PR):**
1. Remove the "Edit profile" button at `frontend/src/components/AccountView.tsx:268` — it has no current handler / target screen.
2. Merge the *Account* and *Password* sections into a single panel so identity + credentials live together.
3. Restructure password change form:
   - Row 1: current password (full width).
   - Row 2: new password + confirm new password (side by side on ≥ md, stacked on mobile).
   - Submit button disabled until: current is filled, new ≥ min length, confirm matches new.
   - Show inline mismatch / length hints rather than only on submit.
4. Polish the *Listening Stats* panel:
   - Hero stat tiles: bigger numerals, soft gradient backgrounds, subtle icon per tile (plays / unique tracks / artists).
   - Top Tracks / Top Artists rows: rounder rank chip, hover state, consistent vertical rhythm.
   - Empty state illustration or icon (currently bare text).

**Out of scope:** new endpoints, avatar redesign, session table changes.

**Acceptance:**
- No regressions in `AccountView.test.tsx`.
- Manual: walk through password change happy path + 3 invalid states.
- Manual: listening stats panel visually consistent with the rest of the app on mobile and desktop.

**Estimated effort:** ~½ day.

---

## P1 — Albums view sorting

**Goal:** let users browse the albums library by multiple orderings, with section separators matching the artist view pattern.

**Sort modes:**
1. Album name — A→Z (default), Z→A
2. Artist name — A→Z, Z→A
3. Year — newest → oldest, oldest → newest

**Separator behavior (reusing artist-view letter-grouping pattern at `LibraryArtistsSection.tsx:198–217`):**
- Album / Artist alphabetical → letter header (`A`, `B`, …, `#` for non-alpha) followed by the matching albums.
- Year → year header (e.g. `2024`, `2023`, …) followed by that year's albums. Albums with unknown year grouped under `Unknown`.

**Implementation sketch:**
- New `SortControl` dropdown component in the albums view toolbar (header of `LibraryAlbumsSection.tsx`).
- Sort state lives in `LibraryAlbumsSection` (local) or hoisted to `LibraryWorkspace.tsx` if persistence between tab switches is desired — pick local first, hoist only if needed.
- Persist last-used sort to `localStorage` (key `flaque.albums.sort`) so it survives reloads.
- Extract a shared `GroupedList` / `SectionHeader` helper if the same pattern can replace the inline grouping in `LibraryArtistsSection` — only do this if the refactor is mechanical; otherwise keep them independent for now.

**Acceptance:**
- All 6 sort modes render correct order with correct separators.
- Empty state and single-letter / single-year edge cases render without empty headers.
- Sort preference persists across reload.
- Unit tests for the grouping function (alphabetical with `#` bucket, year with `Unknown` bucket).

**Estimated effort:** ~1 day, including tests.

---

## P2 — Home view UX/UI study (discovery, not code)

**Goal:** decide what the Home view should *be* before changing it.

**Deliverable:** a follow-up doc `docs/home-view-redesign.md` containing:
1. Inventory: every panel currently rendered on Home with screenshots + current data source.
2. Heuristic review: what works, what feels redundant or low-density, what's missing for a first-time visitor vs. a returning user.
3. Two or three concrete redesign options with annotated mockups (or ASCII / Figma links).
4. Recommendation + rationale, plus the next-step PR breakdown.

**Process:**
- Walk through the app screen-by-screen with screenshots (use `docs/screenshots/`).
- Inspect `frontend/src/components/HomePanels.tsx` and friends to map what's wired vs. what's static.
- Talk to / observe at least one non-author user if possible (note: optional but high signal).
- Time-box the study to ~1 day; resist scope creep into implementation.

**Acceptance:** the study doc exists, is reviewed, and produces a P-level task for the actual redesign.

---

## P3 — AI-assisted automatic playlists

**Problem statement:** existing for-you / personal-mix output is too narrow — likely because the rank-based generator (#165) optimizes too aggressively for embedding-near-neighbors of the seed.

**Hypothesis:** layering an LLM as a *curator* on top of the existing candidate set (rather than as a *generator from scratch*) would broaden results without throwing away the embedding work.

**Design spike (before any production code):**
1. Read `backend/src/services/playlists/forYou/generate.ts` and `personalPlaylistService.ts` end-to-end; document the current pipeline: seed → candidates → ranking → trim.
2. Identify the narrowest stage (probably the candidate set or the ranker).
3. Pick an intervention strategy — options to evaluate:
   - **Diversity re-ranker:** LLM receives the top-N candidates with tags/features and re-orders for breadth (genre / era / mood spread) while preserving relevance.
   - **Candidate expander:** LLM receives the seed context + library summary and proposes adjacent-but-different artists/tracks to inject before ranking.
   - **Theme / mood generator:** user types a free-text mood ("Sunday morning, jazzy, mellow") and LLM picks a coherent set.
4. Build a small offline eval harness: pick 5–10 seeds, generate playlists with each strategy, score on (a) relevance to seed, (b) intra-playlist diversity, (c) author-judged "would I listen to this."
5. Decide on model: Claude Haiku 4.5 for cost/latency, or Sonnet 4.6 if Haiku quality is insufficient. (Avoid Opus — too expensive per request for a feature called repeatedly.)
6. Caching strategy: prompt cache the library digest (slow-changing) and the user's taste profile; only the seed varies per request.

**Hard constraints to honor up-front:**
- Latency budget: < 3 s end-to-end for an on-demand request, async generation acceptable for scheduled mixes.
- Cost cap: dollars/month ceiling to define before implementation.
- Offline / degraded path: if the LLM call fails or rate-limits, fall back to the current algorithm transparently.
- Privacy: send only IDs / minimal tag data, never raw user identifiers.

**Spike deliverable:** `docs/ai-playlist-spike.md` with the chosen strategy, eval results, model & cost decision, and a phased implementation plan.

**Estimated effort:** 2–3 days for the spike. Implementation is a separate, larger track scoped from the spike's output.

---

## Cross-cutting

- **Naming convention:** keep follow-up docs in `docs/` with the `roadmap-` or topic prefix used by `roadmap-playlist-remake.md`.
- **PR cadence:** keep each P0/P1 as a single PR. The Home and AI tracks land their docs as PRs of their own before any code.
- **Memory hygiene:** once an item ships, remove or update any planning memory referencing it (this is how `project_misc_improvements.md` got deleted on 2026-05-14).
