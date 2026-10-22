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
