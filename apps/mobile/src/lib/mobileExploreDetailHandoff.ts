import type { LibraryEntry } from "@/data/schema";

/**
 * What a library cover already knows about its title when it is tapped. The
 * detail page reads its own record from the local database after it mounts,
 * which is after the stack has pushed it; with this it can draw its cover and
 * title in the commit that is pushed, so the cover zoom lands on a real page
 * instead of a skeleton that turns into one mid-flight.
 */
export type MobileExploreDetailHandoff = {
  entry: LibraryEntry;
  /** The cover exactly as the tapped cell painted it (URL and source headers). */
  cover: { uri: string; headers?: Record<string, string> } | null;
};

/** A handoff is for the push that follows the tap, not for a later visit. */
export const MOBILE_EXPLORE_DETAIL_HANDOFF_TTL_MS = 3000;

let pending: (MobileExploreDetailHandoff & { at: number }) | null = null;

export function primeMobileExploreDetailHandoff(
  handoff: MobileExploreDetailHandoff,
  now: number = Date.now(),
): void {
  pending = { ...handoff, at: now };
}

/**
 * The handoff for one of `ids` (the route's id candidates) if it was primed
 * within the last few seconds. Reading does not consume it: a first render can
 * run twice.
 */
export function peekMobileExploreDetailHandoff(
  ids: readonly string[],
  now: number = Date.now(),
): MobileExploreDetailHandoff | null {
  if (!pending) return null;
  const age = now - pending.at;
  if (age < 0 || age > MOBILE_EXPLORE_DETAIL_HANDOFF_TTL_MS) {
    pending = null;
    return null;
  }
  if (!ids.includes(pending.entry.item.libraryItemId)) return null;
  return { entry: pending.entry, cover: pending.cover };
}

export function clearMobileExploreDetailHandoff(): void {
  pending = null;
}
