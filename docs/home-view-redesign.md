# Home View — UX/UI Study

Drafted 2026-05-14. P2 of `docs/roadmap-next.md`. This doc is the discovery deliverable — it inventories the current Home view, lists what works and what doesn't, proposes redesign options, and ends with a recommended next-step PR breakdown. No code lands in this doc.

---

## 1. Current state — inventory

Source: `frontend/src/components/HomePanels.tsx`. The Home tab is one of five library sections (`home`, `music`, `albums`, `artists`, `playlists`), switched in `LibraryWorkspace.tsx`. Vertical stack, always single-column.

| # | Element | Component | When shown | Data source |
|---|---------|-----------|------------|-------------|
| 1 | Radio widget — "FLAQUE FM" LCD | inline in `HomePanels.tsx` (~lines 56–99) | Always (top of page) | `radioCurrentTrack`, `radioStationId`, etc. from `AuthenticatedApp` |
| 2 | Played Recently panel — grid of up to 12 track cards | `RecentTracksPanel.tsx` | When `recentTracks.length > 0` | `recentTracks` |
| 3 | Recently Uploaded panel — vinyl-styled album cards + track cards, period filter (7d / 30d) | `RecentlyUploadedPanel.tsx` | When `items.length > 0` OR `loading` | `recentlyUploadedItems` via `useRecentlyUploaded` |
| 4 | Empty state — "Oh flaque !" + Browse library CTA | inline (lines 121–137) | When **neither** Played Recently **nor** Recently Uploaded has anything | — |

**Notably absent from Home:**
- For-You playlists (live on the **Playlists** tab via `useForYouPlaylists` — but they're the main personalization signal we generate)
- Library stats (track / album / artist totals exist in admin but aren't surfaced to the user)
- Greeting / time-of-day / day-of-week framing
- Continue-where-you-left-off (last-played album resume) — Played Recently is close but undifferentiated rows, not a hero
- Quick actions (Upload, Random play, Browse)

---

## 2. Heuristic review

### What works

- **Vinyl card aesthetic** in Recently Uploaded is distinctive — keep it.
- **Single-column stack** keeps reading flow simple, especially on mobile.
- **Empty state copy** ("Oh flaque !") has charm and gives a concrete next step (Browse library).
- **Radio widget visual** (LCD-style screen) is recognizable and on-brand.

### What doesn't

1. **Radio takes the most valuable real estate but isn't necessarily the daily driver.** A returning user who never uses Radio still sees a 130-px-tall widget every time they land on Home. The cost is silent — there's no usage signal here, but the prior is "most users will play library content, not radio."
2. **For-You playlists are hidden.** The whole point of the rank-based / personal-mixes work (#165) was to surface personalized content. It currently lives only on the Playlists tab, two clicks away.
3. **No "resume" affordance.** A user who paused mid-album yesterday and opens the app today gets a grid of 12 recent track cards, none of which says "this is the one you were on." Played Recently is *history*, not *resume*.
4. **First-time empty state is good but lonely.** It's a single card on a big surface. A first-time user has no sense of what features exist (upload? friends/sharing? auto playlists?).
5. **Period filter on Recently Uploaded is on the panel** — fine, but its presence implies "Uploaded" is more important than "Played", which may not match user intent.
6. **No greeting or contextual top.** Most "home" surfaces in modern apps have *something* at the top (greeting, search prompt, weather-of-music). Going straight into Radio LCD feels abrupt.
7. **Radio widget empty state is bleak.** "No active track yet." with no explanation of what Radio *is* or how to populate it.

### Risk register (don't break these)

- The vinyl-card animation and visual identity — users likely have affection for this.
- The empty-state french-flavored copy — part of the brand voice.
- Mobile single-column stacking — must remain on small viewports.
- Existing data flow (`HomePanelsProps`) — refactor cost is non-trivial; prefer adding props over restructuring.

---

## 3. Redesign options

Three concrete directions, from least to most ambitious. Each ends with the trade-off in one sentence.

### Option A — Minimal: "Resume + For-You inline"

Smallest possible improvement that addresses the two biggest gaps (no resume, hidden For-You). Keep the visual identity and component contracts; add two new rows.

```
┌─────────────────────────────────────────────────────────────┐
│  [FLAQUE FM widget — unchanged]                             │
├─────────────────────────────────────────────────────────────┤
│  Resume                                                     │
│  ┌──────────┐                                               │
│  │  cover   │   Track Title — Artist                        │
│  │  64x64   │   from Album · paused 02:14                   │
│  │          │   [▶ Resume]  [⏭ Next album]                  │
│  └──────────┘                                               │
├─────────────────────────────────────────────────────────────┤
│  For You                                                    │
│  [horizontally scrollable row of for-you playlist cards]    │
├─────────────────────────────────────────────────────────────┤
│  Played Recently        [grid — unchanged]                  │
├─────────────────────────────────────────────────────────────┤
│  Recently Uploaded      [grid — unchanged]                  │
└─────────────────────────────────────────────────────────────┘
```

**Pros:** Ships in ~½–1 day. No breaking changes. Surfaces the For-You investment and gives returning users a resume hook.
**Cons:** Doesn't address Radio real-estate cost or first-time onboarding. Resume row needs a new "last-played-with-progress" data source — modest backend ask.

### Option B — Personalized dashboard: "Home as your music day"

Restructure into a true dashboard. Move Radio down. Add greeting + stats strip. Make Resume a real hero.

```
┌─────────────────────────────────────────────────────────────┐
│  Good evening, alice  ·  1,247 tracks · 87 albums · 12 plays today │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐                                       │
│  │                  │   Pick up where you left off          │
│  │   ALBUM COVER    │   Animals — Pink Floyd                │
│  │   240 x 240      │   ▮▮▮▮▮▮▮▮▯▯▯  02:14 / 04:32          │
│  │                  │   [▶ Resume]   [Open album]           │
│  └──────────────────┘                                       │
├─────────────────────────────────────────────────────────────┤
│  Made for you                                               │
│  [horizontal scroll of for-you playlist cards]              │
├─────────────────────────────────────────────────────────────┤
│  Played Recently      [grid — possibly tighter cards]       │
├─────────────────────────────────────────────────────────────┤
│  Recently Uploaded    [grid — vinyl style preserved]        │
├─────────────────────────────────────────────────────────────┤
│  [FLAQUE FM — compact, single line]                         │
│   📻  FLAQUE FM · Now playing: Title — Artist   [▶ Launch]  │
└─────────────────────────────────────────────────────────────┘
```

**Pros:** Best for returning users — fewest clicks to do the thing they came for. Surfaces stats (proxy of "your library is alive"). Demotes Radio without removing it.
**Cons:** Largest scope (~2–3 days). Requires new backend endpoints for greeting (timezone), stats (totals + plays-today), and resume (last-played-with-progress). Risk of "yet another Spotify clone" if not careful with the brand voice.

### Option C — Curated "today" feed

Single chronological-ish feed where each item is a card (resume, new upload, personal-mix refresh, a friend's playlist if collaboration exists). Less columnar, more "stories"-like.

```
┌─────────────────────────────────────────────────────────────┐
│  Today                                                      │
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ ▶ Resume — Animals (Pink Floyd) · 02:14 left            ││
│  └─────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────┐│
│  │ ★ Made for you · 5 new mixes refreshed this morning     ││
│  │   [horizontal row of small for-you cards]               ││
│  └─────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────┐│
│  │ + 12 tracks uploaded · in the last 7 days               ││
│  │   [horizontal row of album / track cards]               ││
│  └─────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 📻 FLAQUE FM · always on                                ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

**Pros:** Most differentiated; the layout *says* "this is a personal feed, not a music library browser." Mobile-native feel.
**Cons:** Biggest design risk. Card-stack feels generic if not visually polished. Highest implementation cost (new feed-item abstraction). Cards lose direct grid affordances (browse-by-eye gets harder).

---

## 4. Recommendation

**Ship Option A first** as one PR, then re-evaluate against real usage before committing to B or C.

Reasoning:
- Option A solves the two real complaints (no resume, hidden For-You) without rewriting the page.
- Option B is more ambitious but the design choices (stats strip, greeting, demoted Radio) are *opinionated* and benefit from seeing Option A in production first to validate whether users even open Home looking for those affordances.
- Option C is interesting but high-risk and high-cost relative to the certainty of value.

This also gives the user a forcing function to decide whether Radio should keep its prime spot. If after Option A the Radio widget is still uninteresting at the top, demoting it (Option B's compact bar) becomes a cheap follow-up.

---

## 5. Next-step PR breakdown

Three small PRs to land Option A, scoped so each is independently reviewable.

### PR 1 — `feat(home): Resume row`

**Goal:** show the user's last-played track at the top of Home with a one-click resume.

**Scope:**
- Backend: add `lastPlayed` to the per-user activity endpoint — `{ trackId, positionMs, pausedAt }`. Tiny extension of `trackActivityStore.ts`.
- Frontend: new `ResumeRow.tsx` component, rendered above `RecentTracksPanel`. Cover + title + artist + progress bar + Resume button (which calls the existing playback API at the saved position) + dismiss button.
- Persistence: client tracks position on pause via existing play-tracking hook; backend persists.
- Hide the row when no last-played exists or when the user is currently playing.

**Acceptance:** play a track, pause mid-way, refresh the page → Home shows Resume row with correct cover/title/position. Resume restarts playback at the saved offset.

**Estimated effort:** ~1 day (small backend, focused frontend).

### PR 2 — `feat(home): For-You row inline`

**Goal:** surface auto-generated For-You playlists on Home without removing them from the Playlists tab.

**Scope:**
- Frontend only — reuse `useForYouPlaylists` hook. Add a horizontally scrollable row component above `RecentTracksPanel` (below Resume).
- Each card opens the existing `ForYouPlaylistDetailView`.
- Empty state: hide the row if there are no for-you playlists generated yet.

**Acceptance:** new For-You row appears on Home, scrolls horizontally on overflow, each card opens the correct playlist detail view.

**Estimated effort:** ~½ day.

### PR 3 — `chore(home): Empty state polish`

**Goal:** first-time visitor lands somewhere that helps them get started.

**Scope:**
- Frontend only. Tweak the existing empty state when there's *nothing* (no recent, no uploads, no for-you, no resume).
- Add 2–3 quick-action chips: "Upload music", "Browse library", "Listen to Radio".
- Keep "Oh flaque !" copy — just extend.

**Acceptance:** with a fresh account, Home shows the friendlier empty state with three actions that route correctly.

**Estimated effort:** ~½ day.

---

## 6. Open questions for the user

Before kicking off PR 1, confirm:

1. **Is the Radio widget pulling its weight?** A single sentence answer ("yes, daily use" / "rarely" / "guests use it") gates whether Option B's demotion is worth planning.
2. **Should Resume include cross-device positions?** I.e., if you pause on the desktop and open mobile, should the mobile Home show the desktop's pause point? (Affects backend scope of PR 1.)
3. **For-You row order — newest mix first, or "best fit" first?** The for-you generator already has a score; we can sort by it. Default: best-fit first.
4. **Empty-state quick-actions list — is "Upload / Browse / Radio" the right three, or do you want "Upload / Browse / Invite a friend" or similar?**

---

## 7. Process note

This study was done from the codebase only — no live user observation, no screenshots of the live UI (the discovery brief flagged this as optional). If the user wants validation before committing to PR 1, the cheapest next step is a 15-minute screen-share watching one non-author user open Home cold.
