const DEFAULT_ABOUT_SHEET_HEIGHT = 392;
const LARGE_TEXT_EXTRA_HEIGHT = 120;

export type MobileAboutSheetLayout = {
  scroll: boolean;
  snapPoint: number | "82%" | undefined;
};

export function getMobileAboutSheetLayout({
  bottomInset,
  fontScale,
  height,
  platform,
  topInset,
  width,
}: {
  bottomInset: number;
  fontScale: number;
  height: number;
  platform: string;
  topInset: number;
  width: number;
}): MobileAboutSheetLayout {
  const availableHeight = Math.max(1, height - topInset - bottomInset);
  const largeText = fontScale > 1.15;
  const landscape = width > height;
  const compactViewport = landscape || availableHeight < DEFAULT_ABOUT_SHEET_HEIGHT;

  // Expo's Android sheet already content-sizes large text correctly. Supplying
  // a numeric detent there expands the Material sheet to the full window,
  // leaving a large blank region below the content. Keep portrait Android
  // dynamic, and only bound genuinely compact viewports with a percentage.
  if (platform === "android") {
    return compactViewport
      ? { scroll: true, snapPoint: "82%" }
      : { scroll: false, snapPoint: undefined };
  }

  const needsBoundedScrollableSheet = largeText || compactViewport;

  if (!needsBoundedScrollableSheet) {
    return { scroll: false, snapPoint: undefined };
  }

  const desiredHeight =
    DEFAULT_ABOUT_SHEET_HEIGHT +
    Math.min(
      LARGE_TEXT_EXTRA_HEIGHT,
      Math.max(0, fontScale - 1) * LARGE_TEXT_EXTRA_HEIGHT,
    );

  return {
    scroll: true,
    snapPoint: Math.round(Math.min(desiredHeight, availableHeight)),
  };
}
