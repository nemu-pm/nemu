import { getEntryTitle, type LibraryEntry } from "@/data/schema";
import { getMobileExploreNewChapters } from "./mobileContinueReadingCopy";

export const MOBILE_SEARCH_IDLE_UPDATES_LIMIT = 12;

/**
 * Library titles with chapters released since the user last looked (the
 * library's own update state, counted as everywhere else), newest update
 * first, for the Search tab's idle page.
 */
export function selectMobileSearchIdleUpdates(
  entries: readonly LibraryEntry[],
  limit = MOBILE_SEARCH_IDLE_UPDATES_LIMIT,
  /** The source being read and the chapter reached, per title (as the card counts). */
  reading?: (entry: LibraryEntry) => { sourceId: string | null; lastReadNumber?: number },
): { entry: LibraryEntry; count: number | null }[] {
  const found: { entry: LibraryEntry; count: number | null; at: number }[] = [];
  for (const entry of entries) {
    if (entry.item.inLibrary === false) continue;
    const update = getMobileExploreNewChapters(entry.sources, reading?.(entry));
    if (!update) continue;
    const at = Math.max(0, ...entry.sources.map((link) => link.latestFetchedAt ?? 0));
    found.push({ entry, count: update.count, at });
  }
  return found
    .sort((a, b) => b.at - a.at || getEntryTitle(a.entry).localeCompare(getEntryTitle(b.entry)))
    .slice(0, Math.max(0, limit))
    .map(({ entry, count }) => ({ entry, count }));
}

/** Whether the Search idle page has anything to show (else the caller's empty state stays). */
export function hasMobileSearchIdleContent(recents: readonly string[], entries: readonly LibraryEntry[]): boolean {
  return recents.length > 0 || selectMobileSearchIdleUpdates(entries).length > 0;
}
