/**
 * Manga detail on regular widths (Duo inner display, tablets, unfolded
 * foldables). The compact page (design "A": one card, one capped tag row, a
 * three-line description) is unchanged; these rules only apply when the page
 * has room.
 *
 * Split (info pane + chapter pane): the info pane is itself the second level
 * of hierarchy (HIG "show an additional level of hierarchy on the inner
 * display"), so it does not nest a card inside the pane — its content sits on
 * the page background like the web app's desktop hero, and its first row (the
 * cover and title) starts on the same line as the chapter pane's "Chapters"
 * heading. With the pane's height to spend, it shows what web shows and the
 * compact card folds away: every tag (web shows up to ten, then "+N"), and
 * the description in full unless it is very long.
 *
 * Chapter section rhythm on regular widths: one spacing step between the
 * heading, the filter chips and the grid, measured between what is visible —
 * the invisible 44/48pt touch frames around the sort action and the chips no
 * longer add their overhang to the gaps.
 */

export type MobileMangaDetailPaneRole = "single" | "leading" | "trailing";

export const MOBILE_DETAIL_PANE_METRICS = {
  /** Between the info pane's blocks (hero row, tags, description, banners). */
  blockGap: 16,
  /** Cover ↔ copy column. */
  heroRowGap: 16,
  /** Title lines the hero row may use beside the pane's larger cover. */
  maxTitleLines: 4,
  /** Tag lines before the rest folds into "+N" (web: 10 tags, then "+N"). */
  tagMaxLines: 3,
  /** Share of the pane's inner width the cover takes, within its clamp. */
  coverFraction: 0.34,
  minCoverWidth: 112,
  maxCoverWidth: 148,
} as const;

/**
 * The info pane's cover: a little larger than the compact card's 92–112pt
 * (web grows its cover to 224px from `md` up), without starving the copy
 * column of the title's width.
 */
export function getMobileDetailPaneCoverWidth(innerWidth: number): number {
  const m = MOBILE_DETAIL_PANE_METRICS;
  const width = Number.isFinite(innerWidth) && innerWidth > 0 ? innerWidth : 348;
  return Math.max(m.minCoverWidth, Math.min(m.maxCoverWidth, Math.floor(width * m.coverFraction)));
}

export type MobileDetailDescriptionPresentation = {
  /** Lines shown while collapsed. */
  collapsedLines: number;
  /** Whether the text is long enough to need Expand at all. */
  collapsible: boolean;
};

const CARD_DESCRIPTION = { lines: 3, chars: 260 } as const;
/**
 * The info pane scrolls on its own, so it shows the description in full; only
 * a synopsis long enough to push everything else a screen away collapses, and
 * then to a dozen lines rather than three.
 */
const PANE_DESCRIPTION = { lines: 12, chars: 900 } as const;

export function getMobileDetailDescriptionPresentation({
  value,
  pane,
}: {
  value: string;
  /** True in the regular-width info pane. */
  pane: boolean;
}): MobileDetailDescriptionPresentation {
  const rule = pane ? PANE_DESCRIPTION : CARD_DESCRIPTION;
  const lineCount = value.split(/\r?\n/).length;
  return {
    collapsedLines: rule.lines,
    collapsible: value.length > rule.chars || lineCount > rule.lines,
  };
}

export type MobileChapterSectionRhythm = {
  /** Gap between the heading row, source selector, filter chips and notices. */
  sectionGap: number;
  /** Visible heading row height; the sort action's touch frame overhangs it. */
  headerRowHeight: number;
  /**
   * Pulls the next block up under the heading: the heading's line box carries
   * ~7pt of air below its baseline, so without it "Chapters" → chips reads
   * wider than chips → grid.
   */
  headerRowMarginBottom: number;
  /** Negative vertical margin that folds the sort action's touch frame into the row. */
  sortActionMarginVertical: number;
  /** Negative vertical margin that folds the chips' touch frames into the chip row. */
  toolbarMarginVertical: number;
  /**
   * Negative margins that fold `MobileSourceSelector`'s shadow room (4pt above,
   * 10pt below its track) into the gaps, so the track is spaced like the rest.
   */
  sourceSelectorMarginTop: number;
  sourceSelectorMarginBottom: number;
  /** Header → first chapter row. */
  firstRowGap: number;
  /** Chapter row ↔ chapter row (the grid's own column gap). */
  rowGap: number;
};

/** Compact values are the approved design "A" rhythm, kept as they are. */
const COMPACT_RHYTHM: MobileChapterSectionRhythm = {
  sectionGap: 16,
  headerRowHeight: 28,
  headerRowMarginBottom: 0,
  sortActionMarginVertical: 0,
  toolbarMarginVertical: 0,
  sourceSelectorMarginTop: 0,
  sourceSelectorMarginBottom: 0,
  firstRowGap: 16,
  rowGap: 8,
};

const CHIP_HEIGHT = 30;
/** `MobileSourceSelector` scroll content padding (room for the track's shadow). */
const SOURCE_SELECTOR_SHADOW_ROOM = { top: 4, bottom: 10 } as const;
const REGULAR_STEP = 12;

export function getMobileChapterSectionRhythm({
  regularWidth,
  minimumTouchTarget,
}: {
  regularWidth: boolean;
  /** `getNemuButtonMinimumTargetSize(Platform.OS)`: 44 iOS, 48 Android. */
  minimumTouchTarget: number;
}): MobileChapterSectionRhythm {
  if (!regularWidth) return COMPACT_RHYTHM;
  const target = Number.isFinite(minimumTouchTarget) && minimumTouchTarget > 0 ? minimumTouchTarget : 44;
  const headerRowHeight = COMPACT_RHYTHM.headerRowHeight;
  return {
    sectionGap: REGULAR_STEP,
    headerRowHeight,
    // Heading baseline → chips ≈ 14pt, chips → grid 12pt.
    headerRowMarginBottom: -6,
    sortActionMarginVertical: -Math.max(0, (target - headerRowHeight) / 2),
    toolbarMarginVertical: -Math.max(0, (target - CHIP_HEIGHT) / 2),
    sourceSelectorMarginTop: -SOURCE_SELECTOR_SHADOW_ROOM.top,
    sourceSelectorMarginBottom: -SOURCE_SELECTOR_SHADOW_ROOM.bottom,
    firstRowGap: REGULAR_STEP,
    rowGap: COMPACT_RHYTHM.rowGap,
  };
}
