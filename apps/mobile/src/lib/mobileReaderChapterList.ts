import type { ChapterSummary } from "@/data/schema";
import { filterAndSortMobileChapters, type MobileChapterListPreference } from "./mobileChapterFilters";
import { getMobileChapterPresentation } from "./mobileChapterPresentation";
import type { MobileChapterProgressAccessory } from "./mobileChapterProgress";
import {
  getMobileChapterListCommonGroup,
  getMobileChapterVolumeHeaders,
  type MobileChapterVolumeHeader,
} from "./mobileExploreChapterList";

/**
 * The reader's chapter sheet: the detail page's list (its order, volume
 * headers and row states) as fixed-height items, so a list of 1000+ chapters
 * opens already scrolled to the open chapter without measuring what is above.
 * Pure helpers; the rows are drawn by `ReaderChapterListBody`.
 */

export type MobileReaderChapterListItem =
  | { kind: "header"; key: string; header: MobileChapterVolumeHeader }
  | { kind: "chapter"; key: string; chapter: ChapterSummary };

export type MobileReaderChapterList = {
  items: MobileReaderChapterListItem[];
  /** The open chapter's item, or null when the list does not have it. */
  currentIndex: number | null;
  /** The volume is in the headers: the rows say just the chapter. */
  dropVolume: boolean;
  /** The group every chapter shares, which the rows leave out. */
  commonGroup: string | null;
};

/**
 * `newestFirst` as the reader and the detail page hold it. In the detail
 * page's order and languages (`preference`), with two differences for a list
 * you jump around in: Unread Only does not apply, and the open chapter is
 * always listed, even in a language the page filters out.
 */
export function buildMobileReaderChapterList(
  newestFirst: readonly ChapterSummary[],
  preference: MobileChapterListPreference,
  currentChapterId: string,
): MobileReaderChapterList {
  const languages = new Set(preference.languages);
  const anyLanguageListed = newestFirst.some((chapter) => chapter.lang && languages.has(chapter.lang));
  const shown = languages.size === 0 || !anyLanguageListed
    ? [...newestFirst]
    : newestFirst.filter(
        (chapter) => chapter.id === currentChapterId || Boolean(chapter.lang && languages.has(chapter.lang)),
      );
  const chapters = filterAndSortMobileChapters(shown, {}, { ...preference, unreadOnly: false, languages: [] });
  const headers = getMobileChapterVolumeHeaders(chapters);
  const items: MobileReaderChapterListItem[] = [];
  let currentIndex: number | null = null;
  for (const chapter of chapters) {
    const header = headers.get(chapter.id);
    if (header) items.push({ kind: "header", key: `header:${chapter.id}`, header });
    if (chapter.id === currentChapterId) currentIndex = items.length;
    items.push({ kind: "chapter", key: `chapter:${chapter.id}`, chapter });
  }
  return {
    items,
    currentIndex,
    dropVolume: headers.size > 0,
    commonGroup: getMobileChapterListCommonGroup(chapters),
  };
}

/** As `MobileExploreChapterRow`: text stops growing here. */
export const MOBILE_READER_CHAPTER_LIST_TEXT_MAX_SCALE = 1.6;
/** Above the rows, inside the scroll content. */
export const MOBILE_READER_CHAPTER_LIST_PADDING = 8;
/** Below them: the list runs to the sheet's edge, and the last row clears its corners and the home indicator. */
export const MOBILE_READER_CHAPTER_LIST_BOTTOM_PADDING = 32;

export type MobileReaderChapterListMetrics = { rowHeight: number; headerHeight: number };

/** Every row fits title and subtitle (one line each) at the text size in use. */
export function mobileReaderChapterListMetrics(fontScale: number): MobileReaderChapterListMetrics {
  const scale = Math.min(
    Number.isFinite(fontScale) ? Math.max(fontScale, 1) : 1,
    MOBILE_READER_CHAPTER_LIST_TEXT_MAX_SCALE,
  );
  return {
    // Title 21 + 1 + subtitle 17, 9pt above and below, the bottom rule.
    rowHeight: Math.ceil(39 * scale + 18 + 1),
    // Title 22, 18pt above and 6pt below.
    headerHeight: Math.ceil(22 * scale + 24),
  };
}

/** Each item's top in the scroll content (top padding included), and where the items end. */
export function mobileReaderChapterListOffsets(
  items: readonly Pick<MobileReaderChapterListItem, "kind">[],
  metrics: MobileReaderChapterListMetrics,
): { offsets: number[]; end: number } {
  const offsets: number[] = [];
  let offset = MOBILE_READER_CHAPTER_LIST_PADDING;
  for (const item of items) {
    offsets.push(offset);
    offset += item.kind === "header" ? metrics.headerHeight : metrics.rowHeight;
  }
  return { offsets, end: offset };
}

/** Where the open chapter sits in the sheet when it opens: a third down, the chapters before it in view. */
const CURRENT_VIEW_POSITION = 0.3;

/**
 * Where the list opens scrolled to, so the open chapter is in view, a third of
 * the way down the sheet where the list allows: never past the list's last
 * screen (that would open on blank space below the end). `index` is the item
 * to mount the list at (`initialScrollIndex`), the last one starting at or
 * above `offset`, the exact place it then settles on. Zero: the top.
 */
export function mobileReaderChapterListInitialScroll(input: {
  offsets: readonly number[];
  end: number;
  metrics: MobileReaderChapterListMetrics;
  currentIndex: number | null;
  viewportHeight: number;
}): { index: number; offset: number } {
  const { offsets, end, metrics, currentIndex, viewportHeight } = input;
  if (currentIndex === null || currentIndex <= 0 || currentIndex >= offsets.length) return { index: 0, offset: 0 };
  const lastScreen = Math.max(0, end + MOBILE_READER_CHAPTER_LIST_BOTTOM_PADDING - viewportHeight);
  const wanted = offsets[currentIndex]! - CURRENT_VIEW_POSITION * Math.max(0, viewportHeight - metrics.rowHeight);
  const offset = Math.min(lastScreen, Math.max(0, wanted));
  let low = 0;
  let high = offsets.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (offsets[middle]! <= offset) low = middle;
    else high = middle - 1;
  }
  return { index: offset > 0 ? low : 0, offset };
}

export type MobileReaderChapterListStartAt = "start" | "saved";

export type MobileReaderChapterListTapAction =
  | { kind: "close" }
  | { kind: "locked" }
  | { kind: "open"; startAt: MobileReaderChapterListStartAt };

/**
 * A row's tap: the open chapter just closes the sheet, a locked one says why,
 * and any other opens where its row says: at its saved page when in progress
 * (a re-read spot included), else at its first page.
 */
export function mobileReaderChapterListTapAction(input: {
  chapter: ChapterSummary;
  completed: boolean;
  accessory: MobileChapterProgressAccessory;
  currentChapterId: string;
}): MobileReaderChapterListTapAction {
  if (input.chapter.id === input.currentChapterId) return { kind: "close" };
  const { isLocked } = getMobileChapterPresentation(input.chapter, { completed: input.completed, progress: 0 });
  if (isLocked) return { kind: "locked" };
  return { kind: "open", startAt: input.accessory.status === "progress" ? "saved" : "start" };
}
