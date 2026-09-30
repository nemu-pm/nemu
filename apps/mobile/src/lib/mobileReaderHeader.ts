import { getEntryTitle, type LibraryEntry } from "@/data/schema";
import { usableMobileReaderMangaTitle } from "./mobileReaderMangaTitle";

/**
 * The manga title the reader shows, or `null` while it is unknown.
 *
 * Order: the library entry (with overrides), the source's own title (live
 * details or the persisted detail cache), then the title the navigation
 * carried in the route. Blank titles, the opaque manga id and URL/path-like
 * strings never count — the chrome shows the chapter line instead of a fake
 * title such as the id or the generic word "Manga".
 */
export function getMobileReaderTitle(
  entry: LibraryEntry | null | undefined,
  mangaId: string,
  sourceTitle?: string | null,
  routeTitle?: string | null,
): string | null {
  return (
    usableMobileReaderMangaTitle(entry ? getEntryTitle(entry) : null, mangaId) ??
    usableMobileReaderMangaTitle(sourceTitle, mangaId) ??
    usableMobileReaderMangaTitle(routeTitle, mangaId)
  );
}

/**
 * The capsule's two lines. With a known manga title: title over
 * "chapter · position". While the title is unknown the chapter line moves up
 * and the second line keeps only the position (or the fetching state).
 */
export function readerCapsuleTitleLabels({
  mangaTitle,
  chapterTitle,
  pageCountLabel,
  pagesPending,
  fetchingPagesLabel,
}: {
  mangaTitle: string | null;
  chapterTitle: string;
  pageCountLabel: string | null;
  pagesPending: boolean;
  fetchingPagesLabel: string;
}): { title: string; subtitle: string } {
  const detail = pagesPending ? fetchingPagesLabel : pageCountLabel;
  if (!mangaTitle) {
    return { title: chapterTitle, subtitle: detail ?? "" };
  }
  return {
    title: mangaTitle,
    subtitle: [chapterTitle, detail].filter(Boolean).join(" · "),
  };
}

/**
 * Shared reader chrome geometry.
 *
 * The top info panel and the bottom toolbar panel are the same glass surface,
 * so they must share one height, one horizontal inset and one corner radius.
 * The height is driven by the taller of the two content requirements:
 *
 * - top: a two-line title block (14/18 + 2 + 11/14 = 34pt),
 * - bottom: the scrubber row, whose slider owns a 48pt Android touch target.
 *
 * 48pt of content plus 6pt of vertical padding on each side lands both panels
 * on a single 60pt height without squashing the two-line title.
 */
export const READER_CHROME_PANEL_CONTENT_MIN_HEIGHT = 48;
export const READER_CHROME_PANEL_VERTICAL_PADDING = 6;
export const READER_CHROME_PANEL_HORIZONTAL_PADDING = 12;
export const READER_CHROME_PANEL_HORIZONTAL_INSET = 12;
export const READER_CHROME_PANEL_CORNER_RADIUS = 22;
export const READER_CHROME_PANEL_MAX_WIDTH = 520;
export const READER_CHROME_PANEL_MIN_HEIGHT =
  READER_CHROME_PANEL_CONTENT_MIN_HEIGHT +
  READER_CHROME_PANEL_VERTICAL_PADDING * 2;

/** Gap between the safe-area edge and either chrome panel. */
export const READER_CHROME_PANEL_EDGE_GAP = 16;
/** Gap between the bottom chrome panel and the display-settings popover. */
export const READER_CHROME_POPOVER_GAP = 2;

/**
 * Where the display-settings popover's bottom edge sits, so it always clears
 * the bottom chrome panel by exactly one gap regardless of its height.
 */
export function readerChromeSettingsPopoverBottomOffset(
  bottomInset: number,
): number {
  const inset =
    Number.isFinite(bottomInset) && bottomInset > 0 ? bottomInset : 0;
  return (
    inset +
    READER_CHROME_PANEL_EDGE_GAP +
    READER_CHROME_PANEL_MIN_HEIGHT +
    READER_CHROME_POPOVER_GAP
  );
}

/**
 * Reader chrome loading state.
 *
 * A chapter that is still resolving its page list keeps both chrome panels on
 * screen instead of collapsing to a black screen: the top panel says what is
 * happening, and the bottom panel renders its controls greyed out so the bar
 * never appears empty or interactive-but-broken.
 */
export const READER_CHROME_LOADING_OPACITY = 0.4;

export function isReaderChromeLoading(pagesStatus: string): boolean {
  return pagesStatus !== "ready";
}

/**
 * The top panel's page counter, or `null` while the page list is unresolved.
 *
 * A counter that cannot count reads as broken chrome, so the slot renders
 * nothing until there is a real page total: the spinner beside it already
 * says the chapter is still resolving.
 */
export function readerChromePageCountLabel({
  pagesStatus,
  pageNumber,
  pageCount,
}: {
  pagesStatus: string;
  pageNumber: number;
  pageCount: number;
}): string | null {
  if (isReaderChromeLoading(pagesStatus) || pageCount <= 0) {
    return null;
  }
  return `${pageNumber} / ${pageCount}`;
}

/**
 * The page the chrome's page number (title capsule) reports. A paged scrub
 * leaves the page in place until release — only the preview bubble shows the
 * target — so the capsule keeps the displayed page. A continuous (scroll)
 * scrub moves the strip live, so there the chrome follows the scrub.
 */
export function readerChromeIndicatorPageIndex({
  currentPageIndex,
  scrubPreviewPageIndex,
  pagedMode,
  pageCount,
}: {
  currentPageIndex: number;
  scrubPreviewPageIndex: number | null;
  pagedMode: boolean;
  pageCount: number;
}): number {
  const index =
    pagedMode || scrubPreviewPageIndex == null ? currentPageIndex : scrubPreviewPageIndex;
  if (pageCount <= 0) return 0;
  return Math.max(0, Math.min(pageCount - 1, Math.trunc(index)));
}
