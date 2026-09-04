// Change detection for the installed-sources snapshot apply.
//
// `MobileDataStore.applyInstalledSourcesSnapshot` returns void in every
// implementation (nativeStore, webStore, and the MobileSyncDataStore wrapper),
// so the sync bridge cannot ask the store whether the apply wrote anything.
// It used to emit `sources` (and `settings`) unconditionally on every settings
// snapshot, waking every source-list consumer on snapshots that changed
// nothing — the library/collections apply has emitted only on real changes
// since the atomic-apply work.
//
// These helpers reproduce the store's write rule against the pre-apply local
// rows, which the bridge already has in hand:
//   skip when an existing row is strictly newer (`updatedAt` guard),
//   otherwise write — and that write is a real change only when the row
//   content actually differs.

/** The row shape both store implementations persist verbatim. */
export type MobileInstalledSourceRow = {
  id: string;
  updatedAt?: number;
  [field: string]: unknown;
};

/** Key-order-independent structural identity for one persisted row. */
function isSameInstalledSourceRow(
  a: MobileInstalledSourceRow,
  b: MobileInstalledSourceRow,
): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    const left = a[key];
    const right = b[key];
    if (left === right) continue;
    // Arrays (e.g. `languages`) and the nullable package-metadata blobs are
    // the only structured fields; compare them by value.
    if (
      left !== null &&
      right !== null &&
      typeof left === "object" &&
      typeof right === "object"
    ) {
      if (JSON.stringify(left) === JSON.stringify(right)) continue;
    }
    return false;
  }
  return true;
}

/**
 * Whether applying `appliedSources` over `localSources` changed any row.
 *
 * @param localSources rows read from the store *before* the apply.
 * @param appliedSources rows handed to `applyInstalledSourcesSnapshot`.
 */
export function didMobileInstalledSourcesApplyChange(
  localSources: readonly MobileInstalledSourceRow[],
  appliedSources: readonly MobileInstalledSourceRow[],
): boolean {
  if (appliedSources.length === 0) return false;
  const localById = new Map(localSources.map((source) => [source.id, source]));
  for (const source of appliedSources) {
    const existing = localById.get(source.id);
    if (!existing) return true;
    // The store skips rows whose local copy is strictly newer.
    if ((existing.updatedAt ?? 0) > (source.updatedAt ?? 0)) continue;
    if (!isSameInstalledSourceRow(existing, source)) return true;
  }
  return false;
}
