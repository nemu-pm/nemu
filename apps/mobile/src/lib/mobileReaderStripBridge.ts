import type { MobileReaderScrollPageAnchor } from "@/lib/mobileReaderScrollLayout";

/**
 * Seamless scroll: the scroll list holds the open chapter between its
 * neighbours (and their dividers), while the reader works in the open
 * chapter's own page indexes and layout offsets. The bridge is where the
 * open chapter starts in the list: its first row and its content offset.
 *
 * Outside seamless scroll (or with the open chapter alone at the list's
 * head) the bridge is the identity.
 */
export type MobileReaderStripBridge = Readonly<{
  /** The list row of the open chapter's first page. */
  indexBase: number;
  /** The list content offset where the open chapter's first page starts. */
  offsetBase: number;
  /** The open chapter's page count (local indexes run 0..localCount-1). */
  localCount: number;
}>;

export const MOBILE_READER_STRIP_IDENTITY_BRIDGE: MobileReaderStripBridge = Object.freeze({
  indexBase: 0,
  offsetBase: 0,
  localCount: Number.POSITIVE_INFINITY,
});

/** A list row as an open-chapter page index, or null when it is not one. */
export function mobileReaderStripBridgeLocalIndex(
  bridge: MobileReaderStripBridge,
  globalIndex: number,
): number | null {
  if (!Number.isFinite(globalIndex)) return null;
  const local = Math.floor(globalIndex) - bridge.indexBase;
  return local >= 0 && local < bridge.localCount ? local : null;
}

/** An open-chapter page index as a list row. */
export function mobileReaderStripBridgeGlobalIndex(
  bridge: MobileReaderStripBridge,
  localIndex: number,
): number {
  return localIndex + bridge.indexBase;
}

/**
 * The list's reading-line anchor in the open chapter's terms. An anchor in
 * another chapter (or on a divider) clamps to the open chapter's nearest
 * edge: its top above it, its bottom below it.
 */
export function mobileReaderStripBridgeLocalAnchor(
  bridge: MobileReaderStripBridge,
  anchor: MobileReaderScrollPageAnchor | null,
): MobileReaderScrollPageAnchor | null {
  if (!anchor) return null;
  const local = anchor.pageIndex - bridge.indexBase;
  if (local < 0) return { pageIndex: 0, fraction: 0 };
  if (local >= bridge.localCount) {
    return Number.isFinite(bridge.localCount) && bridge.localCount > 0
      ? { pageIndex: bridge.localCount - 1, fraction: 1 }
      : null;
  }
  return { pageIndex: local, fraction: anchor.fraction };
}

/** A list row index as the open chapter's nearest page (clamped). */
export function mobileReaderStripBridgeClampedLocalIndex(
  bridge: MobileReaderStripBridge,
  globalIndex: number | null,
): number | null {
  if (globalIndex == null || !Number.isFinite(globalIndex)) return null;
  const local = Math.floor(globalIndex) - bridge.indexBase;
  if (!Number.isFinite(bridge.localCount)) return Math.max(0, local);
  if (bridge.localCount <= 0) return null;
  return Math.max(0, Math.min(bridge.localCount - 1, local));
}

/**
 * The list's reading-line anchor in the open chapter's terms, or null when
 * it lies outside the open chapter (another chapter, a divider). Unlike
 * `mobileReaderStripBridgeLocalAnchor` it never clamps: what is saved as
 * the reader's spot must be a spot in the chapter it is saved for.
 */
export function mobileReaderStripBridgeOpenAnchor(
  bridge: MobileReaderStripBridge,
  anchor: MobileReaderScrollPageAnchor | null,
): MobileReaderScrollPageAnchor | null {
  if (!anchor || !Number.isFinite(anchor.pageIndex)) return null;
  const local = Math.floor(anchor.pageIndex) - bridge.indexBase;
  if (local < 0 || local >= bridge.localCount) return null;
  return { pageIndex: local, fraction: anchor.fraction };
}

/**
 * How many rows were inserted at (positive) or removed from (negative) the
 * head of the list between two renders of its row keys: 0 when the head is
 * unchanged, null when the lists are unrelated (a new list).
 */
export function mobileReaderStripHeadRowShift(
  previousKeys: readonly string[],
  nextKeys: readonly string[],
): number | null {
  if (previousKeys.length === 0 || nextKeys.length === 0) return null;
  if (previousKeys[0] === nextKeys[0]) return 0;
  const inserted = nextKeys.indexOf(previousKeys[0]!);
  if (inserted > 0) return inserted;
  const removed = previousKeys.indexOf(nextKeys[0]!);
  if (removed > 0) return -removed;
  return null;
}

/** A row anchor carried over a head shift; null when its row was removed. */
export function shiftMobileReaderScrollAnchorRows(
  anchor: MobileReaderScrollPageAnchor | null,
  rows: number,
): MobileReaderScrollPageAnchor | null {
  if (!anchor) return null;
  const pageIndex = anchor.pageIndex + rows;
  return pageIndex >= 0 ? { pageIndex, fraction: anchor.fraction } : null;
}

/** A row index carried over a head shift; null when its row was removed. */
export function shiftMobileReaderRowIndex(index: number | null, rows: number): number | null {
  if (index == null) return null;
  const shifted = index + rows;
  return shifted >= 0 ? shifted : null;
}

/**
 * How far (content offset) the rows that stayed moved with a head shift:
 * the old first kept row's start in the new layout minus its start in the
 * old one.
 */
export function mobileReaderStripHeadShiftOffset(
  previousStarts: readonly number[],
  nextStarts: readonly number[],
  rows: number,
): number {
  const before = previousStarts[Math.max(0, -rows)];
  const after = nextStarts[Math.max(0, rows)];
  return before != null && after != null ? after - before : 0;
}

/**
 * A head shift whose native offset correction (maintainVisibleContentPosition)
 * has not been reported yet. Scroll events still on their way carry the old
 * offset; measured against the new rows they would land in another chapter.
 */
export type MobileReaderScrollHeadShift = {
  /** Content offset the kept rows moved by. */
  offset: number;
  /** The last offset reported in the old rows' terms. */
  lastOffset: number;
  /** Wall clock after which events are taken as they come. */
  until: number;
};

/** How long scroll events may still arrive in the old rows' terms. */
export const MOBILE_READER_SCROLL_HEAD_SHIFT_WINDOW_MS = 500;

/**
 * A scroll event's offset in the current rows' terms: an event closer to
 * the old offset than to the shifted one is still in the old rows' terms
 * (and is moved by the shift); the first one in the new terms ends the
 * window (`shift` null).
 */
export function resolveMobileReaderScrollEventOffset(
  shift: MobileReaderScrollHeadShift | null,
  offset: number,
  now: number,
): { offset: number; shift: MobileReaderScrollHeadShift | null } {
  if (!shift || now > shift.until || shift.offset === 0 || !Number.isFinite(offset)) {
    return { offset, shift: null };
  }
  const stale = Math.abs(offset - shift.lastOffset) < Math.abs(offset - (shift.lastOffset + shift.offset));
  if (!stale) return { offset, shift: null };
  return { offset: offset + shift.offset, shift: { ...shift, lastOffset: offset } };
}

/**
 * After a head shift or a resize of the rows above the reading line: the
 * longest the rows count as settling when the list never reports.
 */
export const MOBILE_READER_STRIP_ROWS_SETTLE_MAX_MS = 1_000;

/**
 * After a head shift or a resize of the rows above the reading line: what
 * the native offset must have moved by. Until it is checked the list's rows
 * are settling (no crossing, no head prune).
 */
export type MobileReaderStripRowsSettle = Readonly<{
  kind: "head-shift" | "above-resize";
  /** The native offset when the rows changed (old rows' terms). */
  before: number;
  /** How far the JS layout moved the reading line's row (content offset). */
  jsDelta: number;
  /** Height of the rows inserted (negative: removed) or the size change above. */
  rowsHeight: number;
  /** Rows inserted (negative: removed); 0 for a resize. */
  rows: number;
}>;

/** A second change before the first was checked: one settle, both deltas. */
export function mergeMobileReaderStripRowsSettle(
  current: MobileReaderStripRowsSettle | null,
  next: MobileReaderStripRowsSettle,
): MobileReaderStripRowsSettle {
  if (!current) return next;
  return {
    kind: current.kind === "head-shift" || next.kind === "head-shift" ? "head-shift" : "above-resize",
    before: current.before,
    jsDelta: current.jsDelta + next.jsDelta,
    rowsHeight: current.rowsHeight + next.rowsHeight,
    rows: current.rows + next.rows,
  };
}

/**
 * The check once the list reported its new size: the offset must now be
 * `before + jsDelta` (the same picture at the reading line).
 * - At rest, when it is not, the list is put there (an absolute offset:
 *   harmless if the native correction is merely late).
 * - While the reader scrolls the finger moves the offset too, so only a
 *   correction the native list clearly skipped (it moved less than half the
 *   rows' change — r12: +30662 asked, -13 moved) is made, by the rows'
 *   change from where the list is now: what maintainVisibleContentPosition
 *   itself does mid-drag (a contentOffset step; the drag goes on from it).
 */
export function resolveMobileReaderStripRowsSettle(
  settle: MobileReaderStripRowsSettle,
  nativeOffset: number,
  userScrolling: boolean,
): { expected: number; moved: number; ok: boolean; fixTo: number | null } {
  const expected = settle.before + settle.jsDelta;
  const moved = nativeOffset - settle.before;
  const ok = Math.abs(nativeOffset - expected) <= 1;
  if (ok) return { expected, moved, ok, fixTo: null };
  if (!userScrolling) return { expected, moved, ok, fixTo: expected };
  const skipped =
    Math.abs(settle.jsDelta) >= MOBILE_READER_STRIP_ROWS_SETTLE_MIN_SCROLLING_FIX &&
    Math.abs(moved) < Math.abs(settle.jsDelta) / 2;
  return { expected, moved, ok, fixTo: skipped ? nativeOffset + settle.jsDelta : null };
}

/** Below this (pt) a skipped correction mid-scroll is left alone (finger noise). */
export const MOBILE_READER_STRIP_ROWS_SETTLE_MIN_SCROLLING_FIX = 24;

/**
 * After a head shift: whether the list left the open chapter's spot (more
 * than half a screen from where it should be), so it must be put back.
 */
export function isMobileReaderStripPlacementOff(input: {
  currentOffset: number | null;
  expectedOffset: number;
  viewportHeight: number;
}): boolean {
  const { currentOffset, expectedOffset, viewportHeight } = input;
  if (currentOffset == null || !Number.isFinite(currentOffset) || !Number.isFinite(expectedOffset)) {
    return false;
  }
  const tolerance = viewportHeight > 0 ? viewportHeight / 2 : 0;
  return Math.abs(currentOffset - expectedOffset) > tolerance;
}
