export const NEMU_WEB_EMPTY_LIBRARY_VISUAL = {
  actionMarginTop: 24,
  copyGap: 8,
  descriptionLineHeight: 23,
  portraitMarginBottom: 16,
  rootMinHeightViewportRatio: 0.6,
  rootPadding: 16,
  titleLetterSpacing: -0.45,
  titleLineHeight: 28,
} as const;

const WEB_SM_BREAKPOINT = 640;
const WEB_MD_BREAKPOINT = 768;
const WEB_SM_PORTRAIT_MAX_WIDTH = 448;
const WEB_MD_PORTRAIT_MAX_WIDTH = 512;
const ACTION_BUTTON_HEIGHT = 48;

/** Drop-shadow offset as a fraction of the web portrait height (20/456). */
export const NEMU_EMPTY_LIBRARY_GLOW_BLEED_RATIO = 20 / 456;
const PORTRAIT_ASPECT = 456 / 390;
/** Share of the leftover column (after copy + button) given to the portrait. */
export const NEMU_EMPTY_LIBRARY_PORTRAIT_REMAINING_RATIO = 0.93;

export const NEMU_EMPTY_LIBRARY_COPY_STACK_HEIGHT =
  NEMU_WEB_EMPTY_LIBRARY_VISUAL.portraitMarginBottom +
  NEMU_WEB_EMPTY_LIBRARY_VISUAL.titleLineHeight +
  NEMU_WEB_EMPTY_LIBRARY_VISUAL.copyGap +
  NEMU_WEB_EMPTY_LIBRARY_VISUAL.descriptionLineHeight * 2 +
  NEMU_WEB_EMPTY_LIBRARY_VISUAL.actionMarginTop +
  ACTION_BUTTON_HEIGHT;

export type MobileEmptyLibraryLayout = {
  glowBleed: number;
  portraitMaxWidth: number;
  rootMinHeight: number;
};

function portraitWidthForBreakpoint(contentWidth: number): number {
  if (contentWidth < WEB_SM_BREAKPOINT) return contentWidth;
  if (contentWidth < WEB_MD_BREAKPOINT) return WEB_SM_PORTRAIT_MAX_WIDTH;
  return WEB_MD_PORTRAIT_MAX_WIDTH;
}

export function getMobileEmptyLibraryLayout({
  height,
  width,
  horizontalPadding = 0,
  verticalChrome = 0,
}: {
  height: number;
  width: number;
  horizontalPadding?: number;
  verticalChrome?: number;
}): MobileEmptyLibraryLayout {
  const safeHeight = Math.max(1, height);
  const safePadding = Math.max(0, horizontalPadding);
  const safeChrome = Math.max(0, verticalChrome);
  const contentWidth = Math.max(1, Math.round(width - safePadding * 2));
  const availableHeight = Math.max(1, Math.round(safeHeight - safeChrome));
  const copyBudget =
    NEMU_EMPTY_LIBRARY_COPY_STACK_HEIGHT +
    NEMU_WEB_EMPTY_LIBRARY_VISUAL.rootPadding * 2;

  let portraitMaxWidth = portraitWidthForBreakpoint(contentWidth);
  let glowBleed = Math.max(
    1,
    Math.round(portraitMaxWidth * PORTRAIT_ASPECT * NEMU_EMPTY_LIBRARY_GLOW_BLEED_RATIO),
  );

  if (safeChrome > 0) {
    const remainingForPortrait = Math.max(
      1,
      availableHeight - copyBudget,
    );
    const portraitHeight =
      remainingForPortrait * NEMU_EMPTY_LIBRARY_PORTRAIT_REMAINING_RATIO;
    portraitMaxWidth = Math.max(
      1,
      Math.round(Math.min(contentWidth, portraitHeight / PORTRAIT_ASPECT)),
    );
    glowBleed = Math.max(
      1,
      Math.round(portraitMaxWidth * PORTRAIT_ASPECT * NEMU_EMPTY_LIBRARY_GLOW_BLEED_RATIO),
    );
  }

  return {
    glowBleed,
    portraitMaxWidth,
    rootMinHeight:
      safeChrome > 0
        ? availableHeight
        : Math.max(
            1,
            Math.round(
              safeHeight * NEMU_WEB_EMPTY_LIBRARY_VISUAL.rootMinHeightViewportRatio,
            ),
          ),
  };
}

/** Sizes shared by the adaptive (container-measured) empty-state hero. */
const ADAPTIVE_SPLIT_MIN_WIDTH = 600;
/** A box this much wider than tall reads better as art beside copy (HIG split arrangement). */
const ADAPTIVE_SPLIT_MIN_ASPECT = 1.15;
/** Art height as a share of its pane in the side-by-side arrangements. */
const ADAPTIVE_SPLIT_ART_HEIGHT_RATIO = 0.84;
const ADAPTIVE_SPLIT_ART_WIDTH_RATIO = 0.92;
const ADAPTIVE_COPY_MAX_WIDTH = 360;
const ADAPTIVE_PANE_GAP = 24;

export type MobileEmptyLibraryPaneSplit = {
  axis: "horizontal" | "vertical";
  /** Container-local fold interval along the split axis. */
  gutter: { start: number; end: number };
};

export type MobileEmptyLibraryAdaptiveLayout =
  | {
      arrangement: "stack";
      portraitMaxWidth: number;
      glowBleed: number;
    }
  | {
      /** Art and copy side by side (wide window or book posture). */
      arrangement: "row";
      portraitMaxWidth: number;
      glowBleed: number;
      artPane: { x: number; width: number };
      copyPane: { x: number; width: number };
      copyWidth: number;
    }
  | {
      /** Notebook posture: art in the top pane, copy in the bottom pane. */
      arrangement: "column";
      portraitMaxWidth: number;
      glowBleed: number;
      artPane: { y: number; height: number };
      copyPane: { y: number; height: number };
    };

function glowFor(portraitWidth: number) {
  return Math.max(1, Math.round(portraitWidth * PORTRAIT_ASPECT * NEMU_EMPTY_LIBRARY_GLOW_BLEED_RATIO));
}

/**
 * The nemu empty-state hero sized to the box it actually gets (the page
 * content area after headers, side/bottom bars and safe areas), so it keeps
 * the proportion it has on a regular phone on every window: Duo's outer
 * display (bars on the trailing edge), unfolded foldables, tablets.
 *
 * - Portrait-shaped boxes stack art over copy exactly like phones.
 * - Wide boxes (and book posture) put the art beside the copy, each in its
 *   own half; in book posture the halves are the fold's panes.
 * - Fully open wide boxes use an even split with the ordinary pane gap.
 * - Notebook posture puts the art in the top pane and the copy in the bottom.
 */
export function getMobileEmptyLibraryAdaptiveLayout({
  width,
  height,
  fold,
  bleedWidth,
}: {
  width: number;
  height: number;
  fold?: MobileEmptyLibraryPaneSplit | null;
  /** Stacked art may bleed past the page gutters to this width (web `w-[100vw]`). */
  bleedWidth?: number;
}): MobileEmptyLibraryAdaptiveLayout {
  const boxWidth = Math.max(1, Math.round(width));
  const boxHeight = Math.max(1, Math.round(height));
  const pad = NEMU_WEB_EMPTY_LIBRARY_VISUAL.rootPadding;

  if (fold?.axis === "vertical") {
    const topHeight = Math.max(1, fold.gutter.start);
    const bottomStart = fold.gutter.end;
    const artHeight = Math.max(1, (topHeight - pad * 2) * ADAPTIVE_SPLIT_ART_HEIGHT_RATIO);
    const portraitMaxWidth = Math.max(1, Math.round(Math.min(boxWidth - pad * 2, artHeight / PORTRAIT_ASPECT)));
    return {
      arrangement: "column",
      portraitMaxWidth,
      glowBleed: glowFor(portraitMaxWidth),
      artPane: { y: 0, height: topHeight },
      copyPane: { y: bottomStart, height: Math.max(1, boxHeight - bottomStart) },
    };
  }

  const wide = boxWidth >= ADAPTIVE_SPLIT_MIN_WIDTH && boxWidth / boxHeight >= ADAPTIVE_SPLIT_MIN_ASPECT;
  const splitLine =
    fold?.axis === "horizontal"
      ? fold.gutter
      : null;
  if (splitLine || wide) {
    const artPane = splitLine
      ? { x: 0, width: Math.max(1, splitLine.start) }
      : { x: 0, width: Math.round((boxWidth - ADAPTIVE_PANE_GAP) / 2) };
    const copyStart = splitLine ? splitLine.end : artPane.width + ADAPTIVE_PANE_GAP;
    const copyPane = { x: copyStart, width: Math.max(1, boxWidth - copyStart) };
    const artHeight = Math.max(1, (boxHeight - pad * 2) * ADAPTIVE_SPLIT_ART_HEIGHT_RATIO);
    const portraitMaxWidth = Math.max(
      1,
      Math.round(Math.min(artPane.width * ADAPTIVE_SPLIT_ART_WIDTH_RATIO, artHeight / PORTRAIT_ASPECT)),
    );
    return {
      arrangement: "row",
      portraitMaxWidth,
      glowBleed: glowFor(portraitMaxWidth),
      artPane,
      copyPane,
      copyWidth: Math.max(1, Math.min(ADAPTIVE_COPY_MAX_WIDTH, copyPane.width - pad * 2)),
    };
  }

  // Phone treatment: the art takes the column left after the copy stack.
  const remaining = Math.max(1, boxHeight - NEMU_EMPTY_LIBRARY_COPY_STACK_HEIGHT - pad * 2);
  const portraitHeight = remaining * NEMU_EMPTY_LIBRARY_PORTRAIT_REMAINING_RATIO;
  const stackWidth = Math.max(boxWidth, Math.round(bleedWidth ?? 0));
  const portraitMaxWidth = Math.max(
    1,
    Math.round(Math.min(stackWidth, portraitWidthCap(stackWidth), portraitHeight / PORTRAIT_ASPECT)),
  );
  return { arrangement: "stack", portraitMaxWidth, glowBleed: glowFor(portraitMaxWidth) };
}

/** Web never lets the portrait exceed its `sm:max-w-md md:max-w-lg` caps. */
function portraitWidthCap(contentWidth: number) {
  return portraitWidthForBreakpoint(contentWidth);
}
