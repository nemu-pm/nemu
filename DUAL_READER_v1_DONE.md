# Dual Reader v1 (Dual Read) - Final Implementation Review

## Summary
Dual Read is implemented as a built-in reader plugin that lets users link two sources for the same manga and switch between them instantly. The plugin overlays the secondary source over the primary page, supports hold-to-peek, page offset nudging, automatic chapter pairing, drift correction via image hashing, and synthetic dataset validation. The system now also detects “missing” secondary pages and renders them as blank rather than forcing a wrong match.

## Architecture

### Core logic (pure functions)
- `src/lib/dual-reader/chapters.ts`: chapter matching and progression. Uses chapterNumber deltas when available and falls back to index/title similarity.
- `src/lib/dual-reader/pages.ts`: page mapping, nudges, clamping, drift anchoring for split pages, sibling split guard, and missing-page heuristics.
- `src/lib/dual-reader/hash.ts`: dHash + MultiDhash, candidate scoring, split/merge detection, and best-match selection.
- `src/lib/dual-reader/types.ts`: shared types for chapters, mapping, and render plans.
- `src/lib/dual-reader/debug.ts`: debug flag gate for console logs.

### Worker + cache
- `src/lib/plugins/builtin/dual-reader/dhash.worker.ts`: computes MultiDhash in a Web Worker.
- `src/lib/plugins/builtin/dual-reader/dhash-worker-client.ts`: worker lifecycle + RPC.
- `src/lib/plugins/builtin/dual-reader/dhash-cache.ts`: IndexedDB-backed hash cache (versioned).

### Plugin UI + state
- `src/lib/plugins/builtin/dual-reader/store.ts`: session store (enabled state, seed pair, offsets, drift, render plans, image URLs, FAB state).
- Store lifecycle note: Dual Read state is kept stable across React remounts (idempotent `startSession` + `cleanupRuntime`), so setup won’t get wiped by StrictMode/dev remount behavior.
- `src/lib/plugins/builtin/dual-reader/components.tsx`: setup dialog, popover, FAB, nudge bubble, auto-aligner, secondary prefetch, overlays, split/merge compositing, and missing page handling.
- `src/lib/plugins/builtin/dual-reader/index.tsx`: plugin registration with navbar action, page overlay, and reader overlay hooks.

### Reader integration (generic API)
- `src/lib/plugins/types.ts` and `src/lib/plugins/context.tsx`: added generic page metadata + visible-page helpers + reader overlays (used by Dual Read).
- `src/pages/reader.tsx`: provides page meta and visible page indices to plugins; scrolling mode now reports actual visible pages.
- `src/components/reader/ScrollingGallery.tsx`: emits visible page indices for scrolling mode and feeds plugin context.

## Features (final form)
- In-reader setup dialog: choose secondary source and starting chapter.
- Popover with sticky Primary/Secondary switch and “Realign…” action.
- When Dual Read is enabled: hold-to-peek FAB (draggable, edge-snapping) with tap-to-nudge offset bubble.
- Chapter pairing using seed pair + chapterNumber delta, fallback to index/title similarity.
- Auto-align drift correction using multi-variant dHash with split/merge detection.
- Split/merge rendering support:
  - Secondary spreads split into halves when primary has two pages for one secondary.
  - Primary spreads merged with two secondary pages when appropriate.
- Missing-page detection: high-distance, ambiguous matches suppress the secondary overlay (primary remains visible underneath).
- Secondary image prefetching based on loaded primary pages.
- Debug logs gated by `localStorage.setItem('nemu:dual-read:debug', '1')` or URL `?dualReadDebug=1`.

## Auto-align + mapping (formalized behavior)
- Base map: `secondaryIndex = primaryIndex + pageOffset + driftDelta`.
- Matching uses MultiDhash for full + variant crops; scoring penalizes deviation from expected index.
- Split detection uses left/right variants when spread evidence is strong.
- Merge detection uses two adjacent secondary pages and picks best order.
- Drift updates anchor on the first half of a split to avoid shifting the other half.
- For scrolling and two-page visibility, auto-align evaluates all visible pages and applies plans for each accepted candidate.
- Missing detection marks pages as blank when match distance is high and the best/second-best gap is too small.

## Tests + datasets
- Unit tests:
  - `src/lib/dual-reader/chapters.test.ts`
  - `src/lib/dual-reader/pages.test.ts`
  - `src/lib/dual-reader/alignment.test.ts`
- Dataset integration test (runs in `bun test`):
  - `src/lib/dual-reader/dhash-dataset.test.ts`
- Offline synthetic dataset generator:
  - `scripts/dual-reader/generate-synthetic-local.ts`
- Bundled datasets in `testdata/dual-reader/dhash/…` include crop, watermark, insert/delete, merge/split, duplicates, swaps, and missing-page noise.

## Limitations
- Split detection is left/right only (no top/bottom or vertical splits).
- Merge detection only handles pairs (no 3+ page merges).
- Missing-page detection is heuristic; thresholds may need tuning per source style, and currently falls back to showing the primary page when secondary is missing.
- Auto-align window is fixed (±4); large reorderings outside the window may fail.
- Hashing relies on dHash; heavy redraws, extreme crops, or non-linear edits can still confuse matching.
- Configuration is in-memory only (survives reader remounts during the same app runtime; resets on full reload; not synced across devices).

## Future work
- Vertical split support (top/bottom halves).
- Multi-page merges beyond pairs.
- Adaptive thresholds based on per-source statistics.
- Persist Dual Read configuration per manga and source pair.
- Add a UI hint when a page is marked missing (optional).
- Investigate stronger perceptual hashes (or hybrid features) to reduce false matches.

## How to regenerate datasets
Run:
- `bun scripts/dual-reader/generate-synthetic-local.ts`

This recreates/updates local synthetic datasets in `testdata/dual-reader/dhash/...`.
