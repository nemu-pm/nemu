# Dual Reader v1 (Dual Read): Implementation Plan

## Summary
Dual Reader (“**Dual Read**”) is implemented as a **Reader plugin** (same architecture as `japanese-learning`). It lets users read the **same manga** from **two linked sources** and **switch between them instantly** inside the reader. v1 is intentionally **not split / not overlay**: it’s an **A/B sticky switch** plus a **hold-to-peek FAB** and **quick page-offset nudging**, backed by a lightweight **chapter pairing** model and optional **dHash-based drift correction**.

## Goals (v1)
- **Enable Dual Read from inside the reader** (plugin UX), when the current manga is linked in library and has ≥2 linked sources.
- In reader, **sticky switch** between Primary/Secondary (no split/overlay).
- **Hold-to-peek FAB** that is always visible; supports **drag** + **snap-to-edge**; hold temporarily flips view.
- **Page offset** is **persistent for the current reader session** (and can be adjusted quickly).
- **Chapter pairing**: user enables Dual Read on the **current primary chapter** and selects an (auto-suggested) **secondary chapter**; reading advances “together”.
- **Auto chapter progression prefers `chapterNumber`** when available; falls back to list index pairing.
- **All number/offset logic lives in pure functions** (UI calls them; UI never does math).
- **No user-facing toasts for auto-alignment**; only console logs for debugging.

## Core constraint (plugin-first)
- `src/pages/reader.tsx` and `src/pages/library-manga.tsx` should remain **feature-agnostic**.
- Dual Read behavior/UI is delivered via the **plugin registry** and **plugin contribution points** (`navbarActions`, `pageOverlays`, dialogs).
- If plugin API expansion is required, it must be **generic** and useful for other plugins (no “dual read special cases” in reader).

## Non-goals (v1)
- No split view, no overlay blending.
- No explicit anchor points UI.
- No “preset chips” like “skip credit page”.
- No cross-device sync for Dual Read configuration (future).
- No attempt to reconcile reading progress across sources (progress stays per-source).

## UX / UI Spec (v1)

### Feature naming
- **Feature name**: **Dual Read**
- “Peek” is a **gesture/interaction**, not the feature name.

### Entry points (v1)
- **Reader only** (no library integration in v1 to keep pages unaware):
  - Dual Read plugin provides a **navbar action** (popover) to configure/enable Dual Read.
  - Setup happens inside the reader via `ctx.showDialog(...)`.

### Dual Read Setup (in-reader dialog)
**Flow**: configure the secondary source + starting chapter pair from within the reader.

- **Step A: choose Secondary source**
  - Show a list of candidate sources that the user has linked for this manga (or a “not linked yet” explanation + exit early).
  - Secondary defaults to the “best other” source (e.g. different `lang` if detectable; else second in `sourceOrder`).

- **Step B: choose starting chapter pair**
  - Primary chapter is the current reader chapter (`ctx.chapterId`).
  - Secondary chapter is auto-suggested using the matching algorithm, but user can override.

- **Enable Dual Read**
  - Activates Dual Read for this reader session.

### Reader: Dual Read navbar button (popover)
**Location**: reader bottom control row in `src/pages/reader.tsx`, styled like existing reader settings/OCR popovers:
- Use `Popover` / `PopoverContent` with class `reader-settings-popup`
- Use `Tabs` (`TabsList`, `TabsTrigger`) styled like reader tabs

**Behavior**:
- Clicking **Dual Read** opens a **popover** that auto-closes on outside click (standard Popover behavior).
- The popover is the “control center” (no hidden long-press-only settings).

**Popover contents**:
- **Source switch tabs (sticky)**:
  - `Primary` | `Secondary`
  - Selecting a tab **switches what the reader renders** (sticky).
  - Tab labels show **source icon + short name** (and optionally a language badge).
- **Match / realign**:
  - Button: **“Realign…”** opens a nested sheet/dialog for chapter pairing changes.
- **Status**:
  - Compact status row: `Chapter: X ↔ Y` (or “unpaired” warning).

### Reader: Hold-to-peek FAB (always visible)
**Always visible** even when reader chrome is hidden.

**Gestures**:
- **Press & hold**: momentary flip to the *other* tab (Primary ↔ Secondary). Release snaps back.
- **Drag**: moves the FAB. On release it **snaps to the nearest screen edge** and clamps into safe areas.
- **Tap**: opens a small **nudge bubble** anchored to the FAB.

**Placement constraints**:
- FAB may be dragged along the screen, but must **snap to left/right edge** on release (Bilibili-style).
- Prevent placement in screen center by design: edge snap + clamping.

### Reader: FAB nudge bubble (quick page offset)
**Trigger**: tapping the FAB.

**UI**:
- Two prominent buttons: **`-`** and **`+`** to adjust page offset.
- Optional: a small label showing current `offset` (debug-friendly).
- Tap outside closes the bubble.

**Semantics**:
- Adjusting offset affects mapping immediately.
- **Offset persists for the entire reader session** (and is carried forward as the user moves chapters).

### Chapter progression model (user mental model)
- When entering Dual Read, the system knows a starting pair: **(Primary chapter X, Secondary chapter Y)**.
- While reading:
  - Primary advances normally (user reads primary source).
  - Secondary “follows along” to the corresponding chapter:
    - Prefer pairing by **`chapterNumber`** when available on both sources.
    - Fallback: pairing by **relative list index** from the starting pair.
- If secondary chapter is missing:
  - Dual Read stays enabled, but Secondary view shows a minimal “Unavailable for this chapter” state + button **Realign…**.

### Page matching model (no anchors UI)
- Base mapping: `secondaryPageIndex ≈ primaryPageIndex + sessionOffset`
- Drift correction is handled by a background similarity algorithm (dHash), not by user-defined anchors.
- If algorithm adjusts internally: no toast; only `console.debug()` (behind a debug flag).

## Implementation Architecture (v1)

### Pure-function boundary (hard requirement)
All mapping math and selection logic must be isolated in **pure functions**. UI components must:
- pass inputs (chapters lists, page indices, offsets, etc)
- receive outputs (chosen chapterId, page delta, clamp results, etc)
- never implement math/heuristics inline

**Proposed module layout** (new):
- `src/lib/dual-reader/types.ts`
  - data shapes for session state + algorithm inputs/outputs
- `src/lib/dual-reader/chapters.ts`
  - chapter matching + progression functions
- `src/lib/dual-reader/pages.ts`
  - page mapping + offset update utilities
- `src/lib/dual-reader/hash.ts`
  - dHash computation + Hamming distance helpers (pure)
- `src/lib/dual-reader/debug.ts`
  - debug gating (`isDualReadDebugEnabled()`)

### Worker (optional but planned in v1)
**Purpose**: detect drift / split/merge-page situations by finding the best matching page around the expected mapped index.

**Proposed worker** (new):
- `src/lib/dual-reader/dhash.worker.ts`
  - input: primary image + a small window of secondary candidate images (or their hashes if cached)
  - output: best candidate index + confidence + suggested delta

**Constraints**:
- Keep window small (e.g. ±4 pages) to avoid heavy network/CPU.
- Cache hashes in-memory for session; future: persist per manga.
- No UI toast; only `console.debug('[DualRead] autoAlign …')` when debug is enabled.

### State & persistence (v1)
**Session persistence only**:
- Use a dedicated store (Zustand) that lives for the reader session lifetime.
- Offset and derived drift adjustments persist until reader unmounts.

**Future hooks** (not v1):
- Persist Dual Read configuration (per manga / source pair) into IndexedDB.

## Integration Points (existing files to reference)

### Reader & UI patterns
- `src/pages/reader.tsx`
  - reader chrome, popovers, plugin actions slot, current image rendering pipeline
- `src/lib/plugins/context.tsx`, `src/lib/plugins/types.ts`
  - plugin context surface + contribution points
- `src/components/reader/*`
  - existing reading modes; Dual Read v1 must not change Reader internals
- `src/lib/plugins/components.tsx`
  - Popover styling patterns used by OCR (reference for behavior)
- `src/index.css`
  - reader UI styling tokens/classes (`reader-ui-panel`, `reader-settings-popup`, tabs styles)

### Library data (to discover linked sources)
Dual Read plugin will need to read linked sources for the current manga. Preferred approach:
- Use canonical library entry APIs/stores, not UI pages.
- Reference:
  - `src/data/view.ts` (`LibraryEntry`)
  - `src/data/indexeddb.ts` (`getLibraryEntries`, etc.)
  - existing stores (`src/stores/library.ts`) for in-memory access patterns

**Implementation note (v1)**:
- Dual Read plugin resolves the current `LibraryEntry` by scanning library entries for a `LocalSourceLink` matching `(ctx.registryId, ctx.sourceId, ctx.mangaId)`.
- If no entry is found (not in library / not loaded), Dual Read setup should show “No linked sources found”.

### Source / chapter types
- `src/lib/sources/types.ts`
  - `Chapter.chapterNumber`, `volumeNumber`, `lang`

## Step-by-step Implementation Plan (v1)

### Step 1: Data shapes + pure functions (start here)
- Add `src/lib/dual-reader/*` (pure modules).
- Implement + unit test:
  - **Chapter mapping (single core function; all math here)**:
    - `mapSecondaryChapterForPrimary({ primaryChapter, primaryAll, secondaryAll, seedPair }) -> secondaryChapterId | null`
    - **If `seedPair` provided**: preserve continuity by applying the seed-based delta
      - Prefer `chapterNumber` delta when available; fall back to list-index delta.
    - **If `seedPair` omitted**: behave like “best local match” for setup/realign
      - Prefer exact/nearest `chapterNumber`; fall back to title similarity + list index heuristics.
  - **Wrappers (thin; no math beyond calling the core)**:
    - `matchSecondaryChapter({ primaryChapter, secondaryAll }) -> secondaryChapterId | null` (calls core with no seedPair)
    - `pairNextChapters({ primaryNext, primaryAll, secondaryAll, seedPair }) -> secondaryChapterId | null` (calls core with seedPair)
  - **Page mapping**:
    - `mapSecondaryPageIndex({ primaryIndex, pageOffset, driftDelta }) -> number`
    - `applyNudge({ offset, delta:+1|-1 }) -> nextOffset`
    - clamp helpers.

**Tests**:
- Add `src/lib/dual-reader/chapters.test.ts` and `pages.test.ts` using `bun:test` style (see `src/stores/library.test.ts`).

### Step 1.5: dHash drift correction (algorithm + dataset-first verification)
This is important enough to validate early, before UI wiring.

- **Add dataset scripts** (see `scripts/dual-reader/prepare-dhash-dataset.ts` and `scripts/dual-reader/eval-dhash-drift.ts`):
  - Downloads **first 10 pages** for:
    - `ja.rawkuma` chapter 1 (`/manga/gal-no-jitensha-wo-naoshitara-natsukareta/` + `/chapter-1.239625/`)
    - `zh.copymanga` chapter 1 (`banglameixiuhaozixingchehouwobeitachanshangle` + `3e3604e8-d396-11f0-91a3-fa163e4baef8`)
  - Writes canonical mapping for that real-world pair (provided):
    - `1->1, 2+3->2, 4->3, 5->4, 6->5, ...`
  - Generates synthetic variants:
    - random inserted/deleted pages (extra/less pages)
    - crop/expand/resize
    - watermark overlay
    - optional merged pages (simulate “two singles become one spread”)

- **Define the v1 drift-correction contract** as pure functions:
  - `computeDhash(imageBytes) -> uint64` (or `bigint`) (pure)
  - `hammingDistance(a, b) -> number` (pure)
  - **Split/merge support** (important for cases like `2+3 -> 2`):
    - compute hashes for **full** image and also **left/right halves** (optionally top/bottom) for candidate pages
    - match uses `min(distance(primaryFull, candidateVariant))` across variants
  - `findBestSecondaryIndex({ primaryHash, secondaryHashes, expectedIndex, windowSize, threshold }) -> { bestIndex, bestDistance } | null` (pure)
  - `updateDriftDelta({ expectedIndex, bestIndex, prevDriftDelta }) -> nextDriftDelta` (pure)

- **Verification** (no UI, no worker yet):
  - **Prereqs**:
    - `bun` installed
    - `aidoku` CLI available in PATH (this repo uses `@nemu.pm/aidoku-cli`)
    - network access (scripts download real chapter images)
  - Run:
    - `cd /home/tiger/nemu`
    - `bun scripts/dual-reader/prepare-dhash-dataset.ts`
    - `bun scripts/dual-reader/eval-dhash-drift.ts testdata/dual-reader/dhash/case_rawkuma_vs_copymanga_ch1`
  - Output:
    - Dataset directory: `testdata/dual-reader/dhash/case_rawkuma_vs_copymanga_ch1/`
    - Real pages live under: `primary/` and `secondary/`
    - Synthetic variants live under: `synthetic/*/`
  - Exit criteria for Step 1.5:
    - evaluator prints the expected mapping (or reports only small local errors within the window)
    - synthetic cases do not collapse under mild crop/watermark/resize changes

### Step 2: Dual Read session store
- Implement as **plugin-owned store** under `src/lib/plugins/builtin/dual-reader/`:
  - active/inactive
  - primary/secondary source ids
  - seed chapter pair
  - session page offset
  - per-chapter ephemeral drift corrections (internal)
  - FAB position (session-only; future: persist)

### Step 3: Implement Dual Read as a built-in plugin
- Add `src/lib/plugins/builtin/dual-reader/`:
  - `index.tsx` exports `dualReaderPlugin: ReaderPlugin`
  - plugin-owned zustand store for session state + UI state
  - UI components: popover content, setup dialog, FAB + nudge bubble
- Register it in `src/lib/plugins/init.ts` (like `japanese-learning`).

### Step 4: Plugin API expansion (expected)
Current `ReaderPluginContext` does not expose enough metadata for Dual Read to map pages across a multi-chapter window.

**Required generic additions** (no DualRead naming):
- `getPageMeta(pageIndex): { kind: 'page'|'spacer', chapterId?: string, localIndex?: number, key?: string }`
  - Allows any plugin to understand which chapter/page a `pageIndex` refers to.
- Optionally: `getVisiblePageMetas(): Array<{ pageIndex, ...meta }>` convenience.

**Implementation location**:
- Extend `ReaderPluginContext` in `src/lib/plugins/types.ts`
- Provide the functions from `src/pages/reader.tsx` via `ReaderPluginProvider` props in `src/lib/plugins/context.tsx`

### Step 5: Reader-side rendering hook (avoid hardcoding Dual Read)
Dual Read needs to display alternate images without the reader page knowing about Dual Read.

Preferred generic approach:
- Add an optional plugin contribution: `imageOverlays` (already possible via `pageOverlays`) and allow a plugin to render a full-cover `<img>` over the base page image.
  - Dual Read uses a page overlay to “replace” the visible page by drawing the secondary image at full opacity when Secondary is active.
  - This keeps `reader.tsx` unaware of Dual Read.

If this is insufficient (performance/edge cases), introduce a **generic** render hook:
- `renderImageLayer?: (pageIndex, ctx) => ReactNode | null`
  - Called by the reader after the base image; plugins can add layers.
  - Dual Read would provide a layer that draws the secondary image.


### Step 6: FAB + nudge bubble (plugin-owned)
- Implement as plugin `pageOverlays` + portal (copy the “render global UI once on first visible page” pattern from `japanese-learning`):
  - FAB is portal’d to `document.body` so it’s not constrained by page layout.

### Step 7: Chapter realignment UI (nested)
- In Dual Read popover add **Realign…**:
  - nested sheet/dialog to pick the current primary chapter’s paired secondary chapter
  - apply change to seed pairing baseline for subsequent progression

### Step 8: Integrate drift correction (background)
- Implement worker + integration (after Step 1.5 proves it works on dataset):
  - when viewing Secondary, on page change, attempt auto-align within ±K pages around expected index
  - if best match differs, apply internal drift delta
  - log only (`console.debug`) when debug enabled

## Exit Criteria (v1)

### Functional
- User can enable Dual Read from the reader when the current manga is linked in library with ≥2 sources.
- Setup dialog auto-suggests secondary chapter for the current primary chapter; user can override.
- Dual Read plugin provides:
  - Popover with sticky tabs to switch Primary/Secondary.
  - Always-visible FAB with drag (snap to edge) + hold-to-peek.
  - Tap FAB shows +/- bubble; offset changes persist across session.
  - Chapter progression prefers `chapterNumber` when available; gracefully handles missing secondary chapters.

### Quality / correctness
- All mapping math is in pure functions with `bun test` coverage for:
  - chapter matching
  - chapter progression
  - page mapping/clamping + nudges
- No regressions in existing reader modes (rtl/ltr/scrolling + two-page).
- Auto-align (if implemented) is silent (no toast), debuggable via console logs.

## Notes / Open Questions (tracked for v2)
- Persist Dual Read config per manga/source pair to IndexedDB (and optionally sync later).
- UX for “secondary missing pages” beyond a placeholder.
- Inter-plugin correctness: other plugins (e.g. Japanese OCR) will still receive the primary `ReaderPluginContext`. If we need them to react to “viewing secondary”, add a **generic** field like `activeContent: 'primary'|'secondary'` to plugin context and update plugins to respect it.


