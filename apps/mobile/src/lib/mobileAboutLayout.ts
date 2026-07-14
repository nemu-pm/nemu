const DEFAULT_ABOUT_SHEET_HEIGHT = 392;
const LARGE_TEXT_EXTRA_HEIGHT = 120;

export type MobileAboutSheetLayout = {
  scroll: boolean;
  snapPointHeight: number | undefined;
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
  const needsBoundedScrollableSheet =
    platform === "ios" || largeText || landscape || availableHeight < DEFAULT_ABOUT_SHEET_HEIGHT;

  if (!needsBoundedScrollableSheet) {
    return { scroll: false, snapPointHeight: undefined };
  }

  const desiredHeight =
    DEFAULT_ABOUT_SHEET_HEIGHT +
    Math.min(
      LARGE_TEXT_EXTRA_HEIGHT,
      Math.max(0, fontScale - 1) * LARGE_TEXT_EXTRA_HEIGHT,
    );

  return {
    scroll: true,
    snapPointHeight: Math.round(Math.min(desiredHeight, availableHeight)),
  };
}
