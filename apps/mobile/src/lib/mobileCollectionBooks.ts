import { getEntryTitle, type LibraryEntry } from "@/data/schema";
import {
  canStartMobileCollectionAction,
  type MobileCollectionActionState,
} from "@/lib/mobileCollections";

/**
 * The collection book picker (Add Books / Edit Collection): which books a
 * search matches, what one Save commits, and how tall the sheet starts.
 */

/** A library longer than this gets a search field above the book list. */
export const MOBILE_COLLECTION_BOOKS_SEARCH_THRESHOLD = 8;

export function shouldShowMobileCollectionBooksSearch(entryCount: number): boolean {
  return entryCount > MOBILE_COLLECTION_BOOKS_SEARCH_THRESHOLD;
}

/** Case-, width- and surrounding-space-insensitive (NFKC: ｂｌｕｅ = blue). */
export function normalizeMobileCollectionBooksQuery(query: string): string {
  return query.normalize("NFKC").trim().toLocaleLowerCase();
}

function entrySearchText(entry: LibraryEntry): string {
  const titles = [getEntryTitle(entry), entry.item.metadata.title];
  const authors = [
    ...(entry.item.overrides?.metadata?.authors ?? []),
    ...(entry.item.metadata.authors ?? []),
  ];
  return normalizeMobileCollectionBooksQuery([...titles, ...authors].join("\n"));
}

/** Books whose title (shown or original) or author contains the query. */
export function filterMobileCollectionBookEntries(
  entries: LibraryEntry[],
  query: string,
): LibraryEntry[] {
  const needle = normalizeMobileCollectionBooksQuery(query);
  if (!needle) return entries;
  return entries.filter((entry) => entrySearchText(entry).includes(needle));
}

export type MobileCollectionBooksSavePlan = {
  /** The trailing ✓ is enabled. */
  canSave: boolean;
  /** New collection name to commit first, or null when the name is unchanged. */
  renameTo: string | null;
  /** Membership changes to commit. */
  saveMembership: boolean;
  /** An empty name blocks Save (Edit Collection only). */
  nameInvalid: boolean;
  /** Anything to lose on Cancel: blocks swipe-to-dismiss. */
  dirty: boolean;
};

/**
 * One Save commits everything the sheet staged: a rename (Edit Collection
 * only) and the membership diff. Nothing staged, an empty name or another
 * collection action in flight keeps Save disabled.
 */
export function planMobileCollectionBooksSave({
  actionState,
  allowRename,
  initialName,
  draftName,
  membershipChangeCount,
}: {
  actionState: MobileCollectionActionState;
  allowRename: boolean;
  initialName: string;
  draftName: string;
  membershipChangeCount: number;
}): MobileCollectionBooksSavePlan {
  const trimmed = draftName.trim();
  const nameInvalid = allowRename && trimmed.length === 0;
  const renameTo =
    allowRename && !nameInvalid && trimmed !== initialName.trim() ? trimmed : null;
  const saveMembership = membershipChangeCount > 0;
  const staged = renameTo !== null || saveMembership;
  return {
    canSave: canStartMobileCollectionAction(actionState) && !nameInvalid && staged,
    renameTo,
    saveMembership,
    nameInvalid,
    dirty: staged || (allowRename && draftName !== initialName),
  };
}

export type MobileCollectionBooksSheetLayout = {
  snapPoints: string[];
};

/** Row and chrome heights the starting detent is estimated from (pt). */
export const MOBILE_COLLECTION_BOOKS_SHEET_METRICS = {
  /** Grabber + header bar + the live-count line under it. */
  chrome: 96,
  /** Edit Collection's name field with its caption. */
  nameField: 84,
  /** The search field and its gap. */
  search: 56,
  /** A book row: 48pt cover plus vertical padding. */
  row: 64,
  /** Edit Collection's Delete row with its gap. */
  deleteRow: 68,
  bottom: 24,
} as const;

/**
 * Short libraries open at their content's height; long ones at a bit over
 * half the window (Edit Collection, whose name and search fields come first,
 * a little taller so several books still show) with a full-height detent to
 * pull up to. A phone on its side always gets the full height (a partial
 * detent there leaves one or two rows between the bar and the keyboard).
 */
export function getMobileCollectionBooksSheetLayout({
  entryCount,
  allowRename,
  fontScale,
  height,
  width,
}: {
  entryCount: number;
  allowRename: boolean;
  fontScale: number;
  height: number;
  width: number;
}): MobileCollectionBooksSheetLayout {
  if (width > height) return { snapPoints: ["100%"] };
  const m = MOBILE_COLLECTION_BOOKS_SHEET_METRICS;
  const scale = Math.max(1, Math.min(fontScale, 2));
  const estimated =
    m.chrome +
    (allowRename ? m.nameField + m.deleteRow : 0) +
    (shouldShowMobileCollectionBooksSearch(entryCount) ? m.search : 0) +
    Math.max(1, entryCount) * m.row * scale +
    m.bottom;
  const percent = Math.ceil((estimated / Math.max(1, height)) * 100);
  const longStart = allowRename ? 72 : 62;
  if (percent <= longStart) return { snapPoints: [`${Math.max(36, percent)}%`, "100%"] };
  return { snapPoints: [`${longStart}%`, "100%"] };
}
