import { japaneseLearningBubblePopoutMaxBottom } from "./mobileJapaneseLearningBubblePopout";

/**
 * Layout of the sentence sheet's footer row (web `OcrResultSheet` footer:
 * ghost Listen, primary "Ask about this sentence", ghost Copy — three
 * `flex-1`, `whitespace-nowrap`, `h-9 px-4 gap-1.5` buttons with 14pt icons).
 *
 * Web never wraps a label, but at phone widths its equal thirds overflow the
 * sheet (measured at 402pt: 93 + 214 + 88pt of buttons in 354pt). The native
 * row keeps every label on one line and inside the sheet by giving up space
 * in this order: equal thirds → natural widths sharing the leftover → tighter
 * ghost padding → icon-only ghost actions → tighter primary padding → a
 * slightly scaled-down primary label.
 */
export const JAPANESE_LEARNING_FOOTER_GAP = 8;
const ICON = 14;
const ICON_GAP = 6;
/** 0.5pt border on each side. */
const BORDER = 1;
const PRIMARY_PADDING = 16;
const GHOST_PADDINGS = [16, 12, 8, 4] as const;
/** Web `size-9` icon button; 32pt (`icon-sm`) when even that is too wide. */
const ICON_ONLY_WIDTHS = [36, 32] as const;
const PRIMARY_TIGHT_PADDING = 12;

export type JapaneseLearningFooterLayout = {
  /** Web's equal `flex-1` thirds fit: use them. */
  equalWidths: boolean;
  ghostPaddingX: number;
  /** Listen / Copy show only their icon (the label stays the accessibility label). */
  ghostIconOnly: boolean;
  /** Width of an icon-only ghost action. */
  ghostIconOnlyWidth: number;
  primaryPaddingX: number;
  /** Nothing else is left to give up: let the primary label scale down on its line. */
  primaryScalesDown: boolean;
};

function labelledWidth(padding: number, labelWidth: number) {
  return padding * 2 + ICON + ICON_GAP + labelWidth + BORDER;
}

export function resolveJapaneseLearningFooterLayout({
  availableWidth,
  listenLabelWidth,
  askLabelWidth,
  copyLabelWidth,
}: {
  availableWidth: number;
  listenLabelWidth: number;
  askLabelWidth: number;
  copyLabelWidth: number;
}): JapaneseLearningFooterLayout {
  const gaps = JAPANESE_LEARNING_FOOTER_GAP * 2;
  const primary = labelledWidth(PRIMARY_PADDING, askLabelWidth);
  const base = {
    equalWidths: false,
    ghostPaddingX: PRIMARY_PADDING,
    ghostIconOnly: false,
    ghostIconOnlyWidth: ICON_ONLY_WIDTHS[0],
    primaryPaddingX: PRIMARY_PADDING,
    primaryScalesDown: false,
  };
  if (!(availableWidth > 0)) return base;

  const third = (availableWidth - gaps) / 3;
  const widest = Math.max(
    primary,
    labelledWidth(PRIMARY_PADDING, listenLabelWidth),
    labelledWidth(PRIMARY_PADDING, copyLabelWidth),
  );
  if (widest <= third) return { ...base, equalWidths: true };

  for (const padding of GHOST_PADDINGS) {
    const total =
      primary +
      labelledWidth(padding, listenLabelWidth) +
      labelledWidth(padding, copyLabelWidth) +
      gaps;
    if (total <= availableWidth) return { ...base, ghostPaddingX: padding };
  }

  for (const iconWidth of ICON_ONLY_WIDTHS) {
    if (primary + iconWidth * 2 + gaps <= availableWidth) {
      return { ...base, ghostIconOnly: true, ghostIconOnlyWidth: iconWidth };
    }
  }

  const tightPrimary = labelledWidth(PRIMARY_TIGHT_PADDING, askLabelWidth);
  const iconWidth = ICON_ONLY_WIDTHS[ICON_ONLY_WIDTHS.length - 1];
  return {
    ...base,
    ghostIconOnly: true,
    ghostIconOnlyWidth: iconWidth,
    primaryPaddingX: PRIMARY_TIGHT_PADDING,
    primaryScalesDown: tightPrimary + iconWidth * 2 + gaps > availableWidth,
  };
}

/** Web's learning drawers (sentence sheet, Nemu chat) are `70vh`, edge-attached at the bottom. */
export const JAPANESE_LEARNING_WEB_DRAWER_FRACTION = 0.7;

/**
 * iOS 26+ floats a sheet resting at a partial detent this far from the
 * screen's side and bottom edges. UIKit does it by drawing the full-width
 * sheet scaled by `(width - 2 · inset) / width` (386/402 on a 402pt iPhone,
 * measured on iOS 27 from the sheet container's transform).
 */
export const IOS_FLOATING_SHEET_INSET = 8;

/**
 * The detent that opens a learning drawer with its top edge where web's does
 * (`100vh - 70vh` from the top).
 *
 * A fractional iOS detent is a fraction of the height between the safe
 * areas, and the floating sheet is then drawn scaled down towards its bottom
 * inset, so `"70%"` opened ~48pt lower than web on a 402×874 iPhone (top at
 * 310 vs 262). On an iPhone-width window this returns the height detent (in
 * points, which excludes the bottom safe area, like UIKit's) that puts the
 * scaled sheet's top edge at web's. On a wide and short iPhone window
 * (landscape, an unfolded foldable) the sheet opens up to just under the
 * bubble popout instead (`resolveWideDrawerDetent`). Android lays its own
 * frame out from the percentage (`resolveMobileNativeSheetAndroidFrame`),
 * and iPad form sheets are not bottom drawers, so those keep web's
 * percentage.
 *
 * A window crossed by a horizontal fold (`horizontalFold`: the iPhone Duo
 * inner display in portrait, an Android foldable in tabletop) is split
 * half and half instead: the drawer takes exactly the bottom half, its top
 * edge on the fold's lower edge, and the page and the bubble popout keep
 * the top half (`japaneseLearningBubblePopoutFrame`'s `verticalSpan`).
 */
export function resolveJapaneseLearningDrawerDetent({
  platform,
  isPad,
  windowWidth,
  windowHeight,
  safeAreaTop,
  safeAreaBottom,
  horizontalFold = null,
}: {
  platform: string;
  isPad: boolean;
  windowWidth: number;
  windowHeight: number;
  safeAreaTop: number;
  safeAreaBottom: number;
  /** A fold across the window's width, in window y (`mobileHorizontalFoldBand`). */
  horizontalFold?: { top: number; bottom: number } | null;
}): number | `${number}%` {
  const percentage = `${Math.round(JAPANESE_LEARNING_WEB_DRAWER_FRACTION * 100)}%` as const;
  if (isJapaneseLearningDrawerFullScreen({ platform, isPad, windowWidth, windowHeight })) {
    // UIKit ignores detents here and shows the sheet full screen: lay the
    // body out for all of it instead of leaving the bottom empty.
    const largest = windowHeight - safeAreaTop - safeAreaBottom;
    return largest > 0 ? Math.round(largest) : percentage;
  }
  if (horizontalFold && !isPad) {
    return resolveFoldDrawerDetent({ platform, windowWidth, windowHeight, safeAreaTop, safeAreaBottom, foldBottom: horizontalFold.bottom }) ?? percentage;
  }
  if (
    platform === "ios" &&
    !isPad &&
    windowHeight > 0 &&
    windowWidth > windowHeight
  ) {
    return resolveWideDrawerDetent({ windowHeight, safeAreaTop, safeAreaBottom }) ?? percentage;
  }
  if (
    platform !== "ios" ||
    isPad ||
    !(windowWidth > IOS_FLOATING_SHEET_INSET * 2) ||
    windowWidth >= 600
  ) {
    return percentage;
  }
  const webTop = windowHeight * (1 - JAPANESE_LEARNING_WEB_DRAWER_FRACTION);
  const scale = (windowWidth - IOS_FLOATING_SHEET_INSET * 2) / windowWidth;
  const shownHeight = windowHeight - IOS_FLOATING_SHEET_INSET - webTop;
  const detent = shownHeight / scale - safeAreaBottom;
  const largest = windowHeight - safeAreaTop - safeAreaBottom;
  if (!(detent > 0) || !(largest > 0)) return percentage;
  return Math.round(Math.min(detent, largest));
}

/**
 * The detent that shows a drawer's top edge at `foldBottom` (window y).
 *
 * iOS: a height detent is in points above the bottom safe area, and the
 * sheet resting at it floats `IOS_FLOATING_SHEET_INSET` above the screen's
 * bottom edge. A compact-width sheet is drawn scaled by
 * `(width - 2 · inset) / width` towards it (the portrait phone drawer); a
 * regular-width one is inset at its real size (measured on the iPhone Duo
 * 27.1 simulator, inner portrait: a 424pt detent showed 458pt from y=485 to
 * 943, footer buttons at their full 36pt). Android: the detent is the
 * visible sheet height from the window's bottom edge
 * (`resolveMobileNativeSheetAndroidFrame`). Kept to half points so the top
 * edge lands on the fold's edge, not a rounding sliver off it.
 */
function resolveFoldDrawerDetent({
  platform,
  windowWidth,
  windowHeight,
  safeAreaTop,
  safeAreaBottom,
  foldBottom,
}: {
  platform: string;
  windowWidth: number;
  windowHeight: number;
  safeAreaTop: number;
  safeAreaBottom: number;
  foldBottom: number;
}): number | null {
  const largest = windowHeight - safeAreaTop - safeAreaBottom;
  if (!(largest > 0) || !(foldBottom > 0 && foldBottom < windowHeight)) return null;
  let detent: number;
  if (platform === "ios") {
    if (!(windowWidth > IOS_FLOATING_SHEET_INSET * 2)) return null;
    const scale = windowWidth < IOS_REGULAR_WIDTH_MIN
      ? (windowWidth - IOS_FLOATING_SHEET_INSET * 2) / windowWidth
      : 1;
    detent = (windowHeight - IOS_FLOATING_SHEET_INSET - foldBottom) / scale - safeAreaBottom;
  } else {
    detent = windowHeight - foldBottom;
  }
  if (!(detent > 0)) return null;
  return Math.round(Math.min(detent, largest) * 2) / 2;
}

/** Narrowest regular-width window: its floating sheet is inset, not scaled. */
const IOS_REGULAR_WIDTH_MIN = 600;

/**
 * Tallest iPhone window with a compact vertical size class (every iPhone in
 * landscape: 320–440pt; the iPhone Duo outer display in landscape: 466pt).
 * The unfolded Duo's inner display (669pt in landscape) is regular.
 */
export const IOS_COMPACT_HEIGHT_MAX = 500;

/**
 * An iPhone sheet in a compact-height window (landscape): UIKit ignores the
 * detents and presents the sheet over the whole window, so nothing above it
 * — like the bubble popout — stays visible.
 */
export function isJapaneseLearningDrawerFullScreen({
  platform,
  isPad,
  windowWidth,
  windowHeight,
}: {
  platform: string;
  isPad: boolean;
  windowWidth: number;
  windowHeight: number;
}): boolean {
  return (
    platform === "ios" &&
    !isPad &&
    windowHeight > 0 &&
    windowWidth > windowHeight &&
    windowHeight < IOS_COMPACT_HEIGHT_MAX
  );
}

/** Space between the bubble popout and the top of the sheet under it (the design system's `spacing.md`). */
export const JAPANESE_LEARNING_POPOUT_SHEET_GAP = 12;

/**
 * A short, wide iPhone window (landscape, an unfolded foldable): web's 70vh
 * leaves the details a strip, while everything above the sheet is only
 * there to show the bubble popout. Open the sheet up to just under the
 * popout's lowest possible edge instead, so the two never overlap and the
 * sheet gets every other point of height.
 */
function resolveWideDrawerDetent({
  windowHeight,
  safeAreaTop,
  safeAreaBottom,
}: {
  windowHeight: number;
  safeAreaTop: number;
  safeAreaBottom: number;
}): number | null {
  const top =
    japaneseLearningBubblePopoutMaxBottom({ windowHeight, safeAreaTop }) +
    JAPANESE_LEARNING_POPOUT_SHEET_GAP;
  const detent = windowHeight - IOS_FLOATING_SHEET_INSET - top - safeAreaBottom;
  const largest = windowHeight - safeAreaTop - safeAreaBottom;
  if (!(detent > 0) || !(largest > 0)) return null;
  const webHeight = largest * JAPANESE_LEARNING_WEB_DRAWER_FRACTION;
  // Never shorter than web's drawer.
  return Math.round(Math.min(Math.max(detent, webHeight), largest));
}

/**
 * Window y of a learning drawer's top edge once it rests at `detent`
 * (`resolveJapaneseLearningDrawerDetent`), for what floats above it (the
 * bubble popout). The inverse of the detent maths: an iOS height detent is
 * points above the bottom safe area, drawn `IOS_FLOATING_SHEET_INSET` above
 * the screen's bottom edge and, on a compact-width window, scaled towards it;
 * an iOS percentage is of the height between the safe areas; Android lays
 * its frame out from the window's bottom edge. Null where nothing shows
 * above the sheet (full screen) or it is not a bottom drawer (iPad).
 */
export function resolveJapaneseLearningDrawerTop({
  platform,
  isPad,
  windowWidth,
  windowHeight,
  safeAreaTop,
  safeAreaBottom,
  detent,
}: {
  platform: string;
  isPad: boolean;
  windowWidth: number;
  windowHeight: number;
  safeAreaTop: number;
  safeAreaBottom: number;
  detent: number | `${number}%`;
}): number | null {
  if (isPad || !(windowWidth > 0 && windowHeight > 0)) return null;
  if (isJapaneseLearningDrawerFullScreen({ platform, isPad, windowWidth, windowHeight })) return null;
  if (typeof detent === "number") {
    if (platform !== "ios") return windowHeight - detent;
    const scale = windowWidth < IOS_REGULAR_WIDTH_MIN && windowWidth > IOS_FLOATING_SHEET_INSET * 2
      ? (windowWidth - IOS_FLOATING_SHEET_INSET * 2) / windowWidth
      : 1;
    return windowHeight - IOS_FLOATING_SHEET_INSET - (detent + safeAreaBottom) * scale;
  }
  const fraction = Number.parseFloat(detent) / 100;
  if (!(fraction > 0)) return null;
  if (platform !== "ios") return windowHeight * (1 - fraction);
  return windowHeight - safeAreaBottom - (windowHeight - safeAreaTop - safeAreaBottom) * fraction;
}

/**
 * How far a learning drawer's own 16pt web gutters should bleed past the
 * hosted content's edges. At a height detent (see
 * [resolveJapaneseLearningDrawerDetent]) the iPhone sheet floats
 * `IOS_FLOATING_SHEET_INSET` in from each screen edge, and its content is laid
 * out at the width it is shown at; bleeding by that inset (the sheet clips it
 * to its own shape) puts the text column at web's `16…width-16` instead of
 * 16pt further in, so the sentence and chat wrap as they do on web.
 */
export function resolveJapaneseLearningDrawerContentBleed(
  detent: ReturnType<typeof resolveJapaneseLearningDrawerDetent>,
  window?: { width: number; height: number },
  horizontalFold?: { top: number; bottom: number } | null,
): number {
  // Only the portrait phone drawer matches web's text column; a wide
  // window's sheet is narrower than the window, and a half-window sheet on a
  // horizontal fold is laid out as its own pane: both keep their own gutters.
  if (window && window.width > window.height) return 0;
  if (horizontalFold) return 0;
  return typeof detent === "number" ? IOS_FLOATING_SHEET_INSET : 0;
}

/**
 * Web's sentence pane (`max-h-[14rem] sm:max-h-[16rem]`): content-sized, and
 * scrolls on its own only past about three token rows.
 */
export const JAPANESE_LEARNING_SENTENCE_PANE_MAX_HEIGHT = 224;
export const JAPANESE_LEARNING_SENTENCE_PANE_MAX_HEIGHT_REGULAR = 256;

/** Narrowest sentence body that splits into columns (two ~300pt columns). */
export const JAPANESE_LEARNING_COLUMNS_MIN_WIDTH = 600;
/** …and only when it is clearly wider than tall. */
export const JAPANESE_LEARNING_COLUMNS_MIN_ASPECT = 1.25;

/**
 * Share of the body the sentence column takes in the column layout (~47%):
 * the details get the longer lines, since definitions wrap sooner than a
 * sentence of token chips does.
 */
export const JAPANESE_LEARNING_SENTENCE_COLUMN_FRACTION = 9 / 19;

export type JapaneseLearningSentenceLayout = "stacked" | "columns";

/**
 * How the sentence body (the sheet's area between the grabber and the action
 * footer) arranges the sentence and the word details.
 *
 * Web's drawer is tall and narrow: the sentence pane on top, the details
 * filling the rest below — kept wherever the body is portrait-shaped. A wide
 * and short body (an unfolded foldable, a phone or tablet in landscape) would
 * leave the stacked details a thin strip under the sentence, so there the
 * sentence and the details sit side by side, each scrolling on its own.
 * Decided from the body's own size, never from the device or posture.
 */
export function resolveJapaneseLearningSentenceLayout({
  width,
  height,
}: {
  width: number;
  height: number;
}): JapaneseLearningSentenceLayout {
  if (!(width > 0 && height > 0)) return "stacked";
  return width >= JAPANESE_LEARNING_COLUMNS_MIN_WIDTH &&
    width >= height * JAPANESE_LEARNING_COLUMNS_MIN_ASPECT
    ? "columns"
    : "stacked";
}

/** Tallest the bubble is shown in the details column of a full-window sheet. */
export const JAPANESE_LEARNING_COLUMN_BUBBLE_MAX_HEIGHT = 200;
/** Never smaller than this: below it a bubble's lettering is no longer legible. */
export const JAPANESE_LEARNING_COLUMN_BUBBLE_MIN_HEIGHT = 120;

/**
 * Height cap for the selected bubble in a full-window sentence sheet's
 * details column (a phone in landscape, where the sheet hides the floating
 * popout). The sentence column keeps only the words; while nothing is
 * selected the details column shows the bubble at a readable size over the
 * quiet hint, both centred. `chrome` is the rest of that column: its padding,
 * the gap under the bubble and the hint lines. Unmeasured: the tallest size.
 */
export function resolveJapaneseLearningColumnBubbleMaxHeight({
  columnHeight,
  chrome,
}: {
  columnHeight: number;
  chrome: number;
}): number {
  if (!(columnHeight > 0)) return JAPANESE_LEARNING_COLUMN_BUBBLE_MAX_HEIGHT;
  return Math.min(
    JAPANESE_LEARNING_COLUMN_BUBBLE_MAX_HEIGHT,
    Math.max(JAPANESE_LEARNING_COLUMN_BUBBLE_MIN_HEIGHT, Math.floor(columnHeight - chrome)),
  );
}

/**
 * Safe-area edges a learning sheet's content extends into (iOS), so every
 * body lays itself out to the sheet's own edges and derives its bottom
 * margin itself (`resolveJapaneseLearningSheetBottomInset` plus its own
 * gutter) instead of stacking a system inset on a fixed gutter:
 *
 * - `bottom`, always. A floating sheet (every iOS 26+ drawer resting at its
 *   detent: the phone in portrait, the Duo's fold half and wide drawers)
 *   otherwise kept the home indicator's inset under its content although it
 *   never reaches the indicator: the composer / footer sat ~41pt above the
 *   sheet's edge against 12pt of padding above them on the Duo.
 * - the vertical bar's edge on the iPhone Duo outer display (not over a
 *   full-window sheet, where that column holds the status bar).
 *
 * Android: Material's sheet lays its content out above the navigation bar
 * itself; nothing to ignore.
 */
export function resolveJapaneseLearningSheetIgnoredSafeAreaEdges({
  platform,
  fullScreen,
  verticalBarEdge,
}: {
  platform: string;
  fullScreen: boolean;
  verticalBarEdge: "leading" | "trailing" | null | undefined;
}): ("leading" | "trailing" | "bottom")[] | undefined {
  if (platform !== "ios") return undefined;
  return verticalBarEdge && !fullScreen ? [verticalBarEdge, "bottom"] : ["bottom"];
}

/**
 * Space a learning sheet's body keeps under its last row (composer, footer,
 * transcript list) on top of its own gutter. A floating iOS sheet ends clear
 * of the screen's bottom edge and the home indicator: none, so the gap below
 * matches the gutter above. A sheet attached to the bottom edge (the
 * full-window iPhone sheet in landscape) keeps the real home-indicator inset.
 * Android's Material sheet already sits above the navigation bar.
 */
export function resolveJapaneseLearningSheetBottomInset({
  platform,
  fullScreen,
  safeAreaBottom,
}: {
  platform: string;
  fullScreen: boolean;
  safeAreaBottom: number;
}): number {
  return platform === "ios" && fullScreen ? Math.max(0, safeAreaBottom) : 0;
}
