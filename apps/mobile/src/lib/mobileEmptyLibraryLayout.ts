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
const PORTRAIT_ASPECT =
  456 / 390;
const ACTION_BUTTON_HEIGHT = 48;

/** Space reserved under the portrait so the baked glow does not sit on the copy. */
export const NEMU_EMPTY_LIBRARY_GLOW_BLEED = 48;

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
  const widthBound = portraitWidthForBreakpoint(contentWidth);
  const heightBudget =
    availableHeight -
    NEMU_EMPTY_LIBRARY_COPY_STACK_HEIGHT -
    NEMU_EMPTY_LIBRARY_GLOW_BLEED -
    NEMU_WEB_EMPTY_LIBRARY_VISUAL.rootPadding * 2;
  const heightBound = Math.max(
    1,
    Math.round(Math.max(1, heightBudget) / PORTRAIT_ASPECT),
  );

  return {
    glowBleed: NEMU_EMPTY_LIBRARY_GLOW_BLEED,
    portraitMaxWidth: Math.max(
      1,
      safeChrome > 0 ? Math.min(widthBound, heightBound) : widthBound,
    ),
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
