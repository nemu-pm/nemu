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

export type MobileEmptyLibraryLayout = {
  portraitMaxWidth: number;
  rootMinHeight: number;
};

export function getMobileEmptyLibraryLayout({
  height,
  width,
}: {
  height: number;
  width: number;
}): MobileEmptyLibraryLayout {
  const safeHeight = Math.max(1, height);
  const safeWidth = Math.max(1, width);
  const roundedWidth = Math.round(safeWidth);

  // Exact Tailwind contract: w-[100vw] sm:max-w-md md:max-w-lg. The native
  // ScrollView owns safe-area padding, so this helper only resolves the image
  // width and web's min-h-[60vh] content floor.
  return {
    portraitMaxWidth: roundedWidth < WEB_SM_BREAKPOINT
      ? roundedWidth
      : roundedWidth < WEB_MD_BREAKPOINT
        ? WEB_SM_PORTRAIT_MAX_WIDTH
        : WEB_MD_PORTRAIT_MAX_WIDTH,
    rootMinHeight: Math.max(
      1,
      Math.round(
        safeHeight * NEMU_WEB_EMPTY_LIBRARY_VISUAL.rootMinHeightViewportRatio,
      ),
    ),
  };
}
