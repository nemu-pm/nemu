# Dual Read v1.5 — Productization Plan

Goal: turn v1 into a “ship it” feature: simpler UX, fewer confusing controls, better polish, and persistent config across reader sessions.

Non-goals: new matching algorithms beyond existing dHash drift correction; split-screen layout; cross-device sync (for now).

---

## 1) UX changes (what user experiences)

### 1.1 Remove manual page offset (nudge)
- **Remove**: page offset +/- bubble and all “manual offset” concepts.
- **Rationale**: if drift correction (±window) can’t fix it, offset likely won’t either; it’s confusing and adds knobs.
- **Replacement**: “Realign…” (chapter-level) and automatic drift correction (page-level).

### 1.2 FAB interactions (polish + semantics)
- **Only visible when Dual Read is enabled**.
- **Tap**: toggle Primary ↔ Secondary (sticky).
- **Press-and-hold**: peek (temporary) to the other side; release reverts.
- **Drag**: move; snap to left/right edge.
- **Visual polish**:
  - Add press/hold affordance (subtle ring fill / scale).
  - Add snap animation (ease-out to edge).
  - Improve contrast (avoid pure white; match reader glass UI).

### 1.3 Setup/Realign UX
- **One “Dual Read…” dialog** (single entry point) that can:
  - choose secondary source
  - choose seed chapter pair (primary chapter = current; secondary chapter selectable, with sane default)
  - (optionally) disable Dual Read
- **Realign** becomes “Dual Read…” (reuses same dialog).
- Dialog should use `src/components/ui/responsive-dialog.tsx` for mobile drawer behavior.

### 1.4 Secondary source selection UI
- Replace dropdown with `src/components/source-selector.tsx` (horizontal, glass, scrollable).
- Show icon + name; optional badge for language.

---

## 2) Functional bugfixes

### 2.1 Secondary chapter auto-select when switching secondary source
Current bug: switching secondary source can leave an invalid `selectedSecondaryChapterId` (from previous source).

v1.5 behavior:
- When secondary source changes:
  - clear selected secondary chapter immediately
  - after chapters load, auto-pick:
    1) suggested mapping (`mapSecondaryChapterForPrimary` using current primary chapter + seed if present)
    2) else “latest” secondary chapter (read order heuristic; fallback to last item)
    3) else first available
- Prevent “Enable” unless selected secondary chapter is valid for the currently selected secondary source.

---

## 3) Persistence (what do we save?)

We want Dual Read config to survive reader sessions (closing reader / reopening later).

### 3.1 Persisted config (per primary manga)
Keyed by: **primary** `(registryId, sourceId, mangaId)`

Persist:
- `enabled: boolean`
- `secondarySource: { registryId, sourceId, sourceMangaId, id }`
- `seedPair: { primaryId: string; secondaryId: string }` (chapter IDs in their respective sources)
- `activeSide: 'primary' | 'secondary'` (**persist**; sticky toggle is part of UX)
- `fabPosition: { x, y, side }` (**persist**; device-local)

Do NOT persist:
- secondary image blob URLs
- drift deltas (`driftDeltaByChapter`) (runtime quality; can be recomputed)
- render plans (runtime)

### 3.2 Storage mechanism
Use existing plugin storage utilities:
- `createPluginStorage('dual-reader')` for small JSON config (localStorage)
- (optional later) `createPluginAsyncStorage('dual-reader')` for larger caches (we already use IndexedDB for dhash)

### 3.3 Load/apply points
- On reader “session start” (`startSession`): load config for this `(registryId, sourceId, mangaId)` and hydrate store.
- On any change (enable/disable, secondary source change, seedPair change, activeSide, fabPosition): persist.

### 3.4 Invalid-config handling (must be explicit)
On hydration, validate config against current reality:
- If **primary source/manga** is unavailable (should be rare because we’re in the reader already): treat as **disabled** (no crash).
- If **secondary source link** no longer exists in the library entry (removed/unlinked) OR the source can’t be loaded:
  - automatically set `enabled: false`
  - keep the stored config as “last used” (so user can re-select/fix quickly), but do not render Dual Read UI until re-enabled
- If `seedPair.secondaryId` is not present in the newly loaded secondary chapter list:
  - keep enabled, but force user back into “Dual Read…” dialog with an auto-selected secondary chapter (suggested/latest fallback)

Exit criteria for persistence:
- Enabling Dual Read, closing reader, reopening: still enabled + same secondary source and mapping.

---

## 3.5 Localization (i18n)
Goal: no hardcoded user-visible strings in the Dual Read plugin.

Approach (match Japanese Learning):
- Add `i18n.t('plugin.dualRead.*')` keys for:
  - plugin manifest name/description
  - navbar action label (“Dual Read”)
  - dialog titles/buttons/empty states/errors
  - popover strings (chapter pairing status, “Realign…”, etc.)
- Ensure settings schema (if added) uses a getter so translations evaluate at render time (same pattern as `japanese-learning`).

Exit criteria:
- Changing app language changes Dual Read strings without reload.

---

## 4) Technical implementation steps (with file pointers)

### Step 0 — Guardrails
- Add/extend unit tests to cover:
  - secondary source switch clears invalid chapter selection
  - persisted config rehydrates correctly

### Step 1 — Remove manual offset
Files:
- `src/lib/plugins/builtin/dual-reader/store.ts` (remove `pageOffset`)
- `src/lib/dual-reader/pages.ts` (remove offset from mapping API; update callers)
- `src/lib/plugins/builtin/dual-reader/components.tsx`
  - remove `DualReadNudgeBubble`
  - remove nudge state (`nudgeOpen`) and tap behavior tied to it
  - update prefetcher + auto-aligner to use only `driftDelta`

### Step 2 — FAB UX refresh
Files:
- `src/lib/plugins/builtin/dual-reader/components.tsx`
  - pointer state machine: tap toggles `activeSide`, hold sets `peekActive`
  - add CSS transitions (snap animation) + press feedback
  - restyle FAB to match reader UI (not hardcoded white)

### Step 3 — Unify Setup + Realign into one responsive dialog
Files:
- `src/lib/plugins/builtin/dual-reader/components.tsx`
  - replace `ctx.showDialog(...)` approach for setup/realign with an overlay-mounted `ResponsiveDialog`
  - consolidate `DualReadSetupDialog` + `DualReadRealignDialog` into `DualReadConfigDialog`
- `src/components/ui/responsive-dialog.tsx` is the required base.

### Step 4 — Use `SourceSelector` for secondary source selection
Files:
- `src/lib/plugins/builtin/dual-reader/components.tsx` (secondary source picker)
- `src/components/source-selector.tsx` (use as-is; provide adapters)

### Step 5 — Fix secondary chapter auto-selection on secondary source switch
Files:
- `src/lib/plugins/builtin/dual-reader/components.tsx`
  - ensure switching sources clears selection
  - after load, compute default secondary chapter (suggested or latest fallback)

### Step 6 — Persist config
Files:
- `src/lib/plugins/builtin/dual-reader/store.ts` (add persistence read/write)
- (optional) `src/lib/plugins/types.ts` storage helpers already exist

### Step 7 — Localization
Files:
- `src/lib/plugins/builtin/dual-reader/index.tsx` (manifest + navbar labels)
- `src/lib/plugins/builtin/dual-reader/components.tsx` (all UI strings)
- Add translation keys to the app i18n resources under `plugin.dualRead.*`

---

## 5) Exit criteria (v1.5 “ship”)
- No manual page offset UI remains.
- FAB only appears when Dual Read is enabled.
- Tap toggles source; hold peeks; drag snaps with smooth animation; colors/contrast match reader.
- “Dual Read…” dialog lets user change secondary source and realign seed chapter.
- Switching secondary source always selects a valid default secondary chapter.
- Dual Read config persists across closing/reopening reader (same device).


