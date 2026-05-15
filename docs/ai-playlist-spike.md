# Specialized music embeddings — proposal

Drafted 2026-05-14. Sister doc to `docs/roadmap-next.md` (P3).

P3 is "AI-assisted automatic playlists". An earlier draft of this doc proposed wiring a general-purpose LLM into the ranker. **That direction is rejected.** Anthropic-style models are the wrong tool here: they're expensive per call, opaque, and they don't actually understand audio. The right tool is a *specialized, free, open-source music model* that produces real semantic embeddings.

This doc is an implementation proposal, not a research spike. The deliverable is shipped playlists, not an eval harness.

---

## 1. The actual problem

The for-you generator (`backend/src/services/playlists/forYou/generate.ts`) and personal-mix generator already use audio embeddings — `embeddingSimilarity` is one feature in the ranker. But it carries only `0.10` weight (`forYouRanker.ts:36–43`) while `genreOverlap` carries `0.40` and `yearProximity` carries `0.20`.

Why so little trust in the embeddings? Because of what they are.

`backend/src/services/embeddings/audioFeatures.ts` produces a **32-dim hand-crafted DSP vector**: 13 MFCC means + 13 MFCC stds + spectral centroid mean/std + rolloff mean + flatness mean + zero-crossing rate mean + RMS mean. L2-normalized.

This is a **timbral fingerprint**. It captures "what does this signal sound like spectrally" — roughly *instrument timbre + production texture*. It does **not** capture:

- Melody, harmony, chord progressions
- Rhythm patterns beyond gross energy
- Genre semantics
- Mood / valence / energy
- Vocal style
- Anything a human would call "musical identity"

Two tracks with similar spectral envelopes (e.g. a piano ballad and a piano-led intro of a metal song before the drop) can score high cosine. Two tracks with the same melody played on different instruments score low. This is why the ranker can't trust the feature past `0.10` — and *that* is why genre and year tags dominate, and *that* is why playlists feel narrow.

**Replacing the embedding model is the right intervention.** Cap-and-sequence, candidate gathering, signal computation all stay. Only `computeFeatureVector` changes.

---

## 2. Chosen model — CLAP (LAION)

**Model: `laion/clap-htsat-fused`** (HuggingFace).

- **License:** Apache-2.0. Permissive, no non-commercial restriction.
- **Architecture:** HTSAT (Hierarchical Token-Semantic Audio Transformer) audio encoder + RoBERTa text encoder, fused into a single 512-dim joint embedding space.
- **Training:** Contrastive (audio, text) pairs from LAION-Audio-630k, including music tagging datasets.
- **Output dim:** 512.
- **Sample rate:** 48 kHz mono.
- **Compute:** CPU-feasible (~0.5–1 s per 3-minute track, batched).

Why CLAP over the alternatives we considered:

- vs. **MERT-v1-95M**: MERT is marginally stronger on pure music benchmarks but its CC-BY-NC license blocks any future commercial path. CLAP is Apache-2 and competitive on music tasks.
- vs. **OpenL3**: CLAP is newer, trained on larger/cleaner data, and beats OpenL3 across MIR benchmarks.
- vs. **MERT-v1-330M**: needs GPU we don't assume the user has.

CLAP brings a real **bonus capability** the others don't: text and audio live in the *same* 512-dim space. A natural-language description ("jazzy mellow Sunday morning") encodes to the same kind of vector as an audio clip, so similarity becomes a free cosine query. We don't ship that feature in this proposal — it's filed as a follow-up in §9 — but the option exists because we picked CLAP.

---

## 3. Why this is "AI" in the sense that matters

The user's framing was "specialized free AI", and that's what these models are:

- They're **neural networks** with millions of parameters, trained on hundreds of thousands of hours of music with self-supervised objectives that capture musical structure.
- They produce **semantic embeddings** — two tracks that are "musically similar" in a way humans would recognize end up near each other in vector space, even if their MFCCs differ.
- They're **specialized** — trained on music, not general language or general audio.
- They're **free** — model weights are downloadable, run locally, no per-request cost, no telemetry, no rate limits.
- They're **deterministic** — same audio in → same vector out. No prompt drift, no API outages.

Calling them "AI" is technically correct in the same sense that a hosted LLM is AI — neural net, large parameter count, learned from data. The difference is *where* the intelligence sits (in the weights you ship) versus *who pays for it each time* (you, every call, to a remote provider).

---

## 4. Integration — Python sidecar

A long-running Python process loads CLAP into memory once, exposes a small local HTTP endpoint, and embeds tracks on request. Node calls it; the sidecar handles ffmpeg decoding (or `torchaudio` resampling), forward pass, and returns a 512-float vector.

Layout:

```
backend/python-services/audio-embedder/
├── server.py          # FastAPI app, single POST /embed { absolutePath } → { vec }
├── model.py           # CLAP loading + windowed inference + mean-pool
├── requirements.txt   # torch, transformers, librosa or torchaudio, fastapi, uvicorn
├── setup.md           # one-page operator doc: install, run, troubleshoot
└── start.sh           # launches uvicorn on a fixed local port
```

Node side: a tiny `embedderClient.ts` that POSTs to the sidecar with a short timeout + retry. Replace the body of `computeAndSaveEmbedding` to call it instead of running TS DSP. The existing `withSlot(...)` concurrency queue stays — it now throttles HTTP calls to the sidecar instead of ffmpeg processes.

Operational notes:
- **Cold start:** CLAP loads in ~10 s. Sidecar stays running, so this is paid once at server startup.
- **Memory:** ~1 GB resident with the model loaded. Comparable to a Node worker.
- **Lifecycle:** systemd unit (or process manager already in use) supervises both Node and the sidecar; if the sidecar dies, Node's HTTP call fails fast and the existing "embedding is best-effort, skip on failure" path kicks in.
- **Window strategy:** CLAP was trained on 10-second clips. For tracks > 10 s, take three overlapping windows (start, middle, end), encode each, mean-pool. Documented in `model.py`.

Rejected alternatives: **ONNX Runtime in Node** (CLAP's HTSAT has custom ops and a non-trivial export path; preprocessing in TS is painful), **one-shot Python CLI per track** (pays the 10 s model load on every call — unusable for backfill).

---

## 5. Ranker reweighting

Once embeddings actually carry musical meaning, the linear weights in `forYouRanker.ts` should rebalance:

| Feature | Current | Proposed |
|---|---:|---:|
| `genreOverlap` | 0.40 | 0.25 |
| `yearProximity` | 0.20 | 0.10 |
| `libraryPopularity` | 0.15 | 0.15 |
| `novelty` | 0.15 | 0.15 |
| `albumOverlapWithSeed` | -0.30 | -0.30 |
| `skipPenalty` | -0.20 | -0.20 |
| **`embeddingSimilarity`** | **0.10** | **0.40** |

Rationale: shift relevance signal from *tag-overlap* (which is brittle and arbitrary) to *learned audio similarity* (which is robust and continuous). The narrowness levers from the rejected spike (`GENRE_JACCARD_FLOOR = 0.2`, `YEAR_FALLBACK_WINDOW = 7`) can also relax — likely to `0.1` and `12` respectively — because the embedding is now the safety net that catches "is this actually similar".

These numbers are starting points, not commitments. The new weights ship behind the same trace mechanism (`finalOrder` records each feature's contribution), so we can post-hoc inspect which tracks moved up/down and why.

---

## 6. Migration

The existing pipeline already has the lever we need: `EMBEDDING_VERSION` in `audioFeatures.ts:28`. `loadEmbedding` returns null on version mismatch, and `backfillMissingEmbeddings` regenerates anything missing. Bumping the version invalidates all old sidecars; the next backfill recomputes everything with the new model.

Concrete plan:
- New `EMBEDDING_VERSION = 3`.
- New file layout: `data/embeddings/<trackId>.json` keeps the same path so dismissals/dedup code untouched.
- Vector dimension changes (32 → 512 for CLAP). `EMBEDDING_DIM` becomes a config constant; ranker code is already dimension-agnostic (cosine works on any dim).
- Backfill triggered manually for first pass (`npm run embed:backfill`), then automatic for new uploads via the existing hook.
- During the backfill window, for-you regeneration sees a mix of v2 and v3 sidecars. Mixing is unsafe (different geometries). Guard: ranker skips embedding similarity entirely until *both* the seed track set and the candidate set are fully v3. Trace records the skip reason.

CPU cost estimate: CLAP on CPU ≈ 0.5–1 s per track (three 10 s windows, batched forward pass). 30 k-track library ≈ 4–8 h one-time. Reasonable to run overnight.

Disk cost: 512 × ~8 B (float32 in JSON as numbers) ≈ ~4 kB per sidecar × 30 k tracks ≈ 120 MB. Roughly 4× current. Fine.

---

## 7. Phased PRs

| Phase | Scope | Acceptance |
|---|---|---|
| **0 — Proposal** (this doc) | Land this design doc on master. | Doc reviewed. |
| **1 — Sidecar skeleton** | `backend/python-services/audio-embedder/` with a *stub* model returning a deterministic dummy vector. Node-side `embedderClient.ts`. Unit tests on the client (mock socket). Docker-compose wiring optional but documented. | `npm run embed:probe` end-to-end returns a vector. No production behavior changes yet (still using v2 path). |
| **2 — Real model** | Swap the stub for CLAP (`laion/clap-htsat-fused`). Pin Python deps. Document `setup.md`. Sanity check: 10 hand-picked track pairs ("same artist", "same genre different artist", "totally different") have cosine ordering that a human agrees with. No production hookup yet. | Manual sanity check passes. Sidecar handles ≥ 100 tracks back-to-back without leaking memory. |
| **3 — Production hookup** | Bump `EMBEDDING_VERSION` to 3. Change `computeAndSaveEmbedding` to call the sidecar. Adjust `EMBEDDING_DIM`. Add the mixed-version guard in the ranker. Backfill script + CLI hook. | All new uploads produce v3 sidecars. Backfill on the dev library completes. for-you still works (with embedding similarity skipped while mixed). |
| **4 — Ranker rebalance** | Apply the §5 weight changes + relax `GENRE_JACCARD_FLOOR` and `YEAR_FALLBACK_WINDOW`. Regenerate playlists. | Author listens through 6 regenerated playlists and confirms they feel *broader but still coherent*. If not, weights/floors are tweaked before merge. |
| **5 — Observability** | Surface the new feature in the existing trace UI (`/api/me/for-you/trace`). Add a comparison view: "tracks that ranked high under v2 but low under v3" so we understand the change in production. | Trace page renders the new column. |

Estimated effort: phase 1 ≈ 1 day, phase 2 ≈ 1 day, phase 3 ≈ 1 day (plus overnight backfill), phase 4 ≈ ½ day plus listening, phase 5 ≈ ½ day. **Total: ~4 days of focused work**, plus the overnight backfill.

---

## 8. Risks & open questions

- **Python runtime in the deployment** — flaque is currently Node + ffmpeg. Adding Python is a deployment-shape change. Mitigations: pin Python version in `setup.md`, ship a `requirements.txt` with explicit hashes, supervise via the same process manager already in use.
- **CPU-only inference latency** — 0.5–1 s/track is fine for upload-time embedding and overnight backfill, less fine for "user uploads 200 tracks at once". The existing `MAX_CONCURRENT = 2` slot queue already handles this gracefully; backfill simply takes longer.
- **Cold start** — sidecar takes ~10 s to load CLAP into memory. Keep it always-on; lifecycle managed by the host's process manager.
- **Resident memory** — ~1 GB extra for the sidecar. Worth noting in the deployment doc; on a single-server setup this is fine, on a constrained VPS it may matter.
- **Are we replacing or augmenting?** Proposal above replaces (v2 → v3, geometries don't mix). Alternative: keep both, give each its own weight. Costs disk + complexity; gains ablation visibility. *Recommend replace; revisit only if phase 4 shows the rebalance going wrong.*

---

## 9. Out of scope (deliberately) — and follow-ups CLAP unlocks

Out of scope for this proposal:
- **Free music recommendation APIs** (ListenBrainz, Last.fm). Different lever (candidate expansion, not ranker quality). Filed separately.
- **Collaborative filtering / matrix factorization** on local play counts. Different lever still; useful for users with deep history. Filed separately.
- **Eval harness.** Deliberately not building one. The proof is in the playlists the author listens to in phase 4. If a strategy doesn't survive that, no benchmark will save it.

CLAP-specific follow-ups (cheap to add once the sidecar is live, since the text encoder is the same module):
- **Natural-language playlist generation.** User types a mood ("jazzy mellow Sunday morning"); we encode it once into the 512-dim space and rank library tracks by cosine. No LLM, no per-call cost, fully deterministic.
- **Smart radio seeding.** Encode the description of a station ("late-night driving") into the same space and use it as a seed instead of (or in addition to) an artist.
- **Tag suggestion.** For a track with sparse tags, find the closest tag-vector text labels in CLAP space and suggest them. Cheap moderation/curation aid.
