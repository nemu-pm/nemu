import { nextSyncTimestamp } from "@nemu/core";
import type { InstalledSource } from "./schema";
import type { MobileDataStore } from "./storeTypes";

export type EvictMobileSourceSession = (source: InstalledSource) => void;

/**
 * Turn an installed source off (or back on) without uninstalling it.
 *
 * The install, its library links, its per-source settings and its cloud record
 * all survive; the source is only hidden from every list that runs sources and
 * refused by the executor. The write goes through `saveInstalledSource`, the
 * same path an install takes, so the sync-decorated store bumps `updatedAt` off
 * the sync clock and pushes the record to Convex — a toggle therefore wins
 * last-writer-wins exactly the way an uninstall tombstone does.
 *
 * Returns false when the source is already in the requested state, so callers
 * can skip the change notification.
 */
export async function setMobileInstalledSourceDisabled(
  store: Pick<MobileDataStore, "getInstalledSource" | "saveInstalledSource">,
  source: InstalledSource,
  disabled: boolean,
  evictSession?: EvictMobileSourceSession,
): Promise<boolean> {
  const existing = (await store.getInstalledSource(source.id)) ?? source;
  if ((existing.disabled === true) === disabled) return false;
  if (disabled) {
    // A cached executor session would keep running after the toggle: session
    // cache hits never re-read the installed record.
    evictSession?.(existing);
  }
  await store.saveInstalledSource({
    ...existing,
    disabled,
    updatedAt: nextSyncTimestamp(existing.updatedAt),
  });
  return true;
}
