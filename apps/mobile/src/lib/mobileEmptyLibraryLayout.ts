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
export const NEMU_EMPTY_LIBRARY_PORTRAIT_REMAINING_RATIO = 0.86;

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
