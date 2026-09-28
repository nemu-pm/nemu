export type MobileLibrarySheetLayout = {
  snapPoints: string[] | undefined;
  scroll: boolean;
};

type MobileLibrarySheetLayoutInput = {
  collectionCount: number;
  fontScale: number;
  height: number;
  width: number;
  /**
   * Height a row takes including its gap. Defaults to the iOS rows; Android
   * passes its Material list-item height (`nemuSheetMetrics`).
   */
  rowHeight?: number;
};

/** Material 3 compact window height class: below 480dp. */
const MOBILE_LIBRARY_SHEET_COMPACT_HEIGHT = 480;

function mobileLibrarySheetEstimatedHeight({
  collectionCount,
  fontScale,
}: MobileLibrarySheetLayoutInput, baseHeight: number, rowHeight: number): number {
  const effectiveFontScale = Math.max(1, Math.min(fontScale, 2));
  return baseHeight + collectionCount * rowHeight * effectiveFontScale;
}

export function getMobileLibraryTitleMenuSheetLayout(
  input: MobileLibrarySheetLayoutInput,
): MobileLibrarySheetLayout {
  const estimatedHeight = mobileLibrarySheetEstimatedHeight(
    { ...input, collectionCount: input.collectionCount + 2 },
    64,
    input.rowHeight ?? 54,
  );
  // Expo's dynamically sized Android sheet can retain the portrait content
  // width after rotating, which shifts this compact row menu outside the
  // visible landscape sheet. A bounded scroll frame owns the current sheet
  // width and keeps every row inside its native container.
  // Only a compact-height landscape window (a phone on its side) needs it:
  // an unfolded foldable or tablet is wider than tall too, but has the
  // height for the content-sized menu, which a 78% sheet would leave mostly
  // empty.
  if (
    input.width > input.height &&
    input.height < MOBILE_LIBRARY_SHEET_COMPACT_HEIGHT
  ) {
    return { snapPoints: ["78%", "100%"], scroll: true };
  }
  return estimatedHeight > Math.max(280, input.height * 0.72)
    ? { snapPoints: ["48%"], scroll: true }
    : { snapPoints: undefined, scroll: false };
}

export function getMobileCollectionsManagerSheetLayout(
  input: MobileLibrarySheetLayoutInput,
): MobileLibrarySheetLayout {
  const estimatedHeight = mobileLibrarySheetEstimatedHeight(
    input,
    96,
    input.rowHeight ?? 76,
  );
  return estimatedHeight > Math.max(300, input.height * 0.78)
    ? { snapPoints: ["78%"], scroll: true }
    : { snapPoints: undefined, scroll: false };
}

export function getMobileManageCollectionSheetLayout(
  input: MobileLibrarySheetLayoutInput,
): MobileLibrarySheetLayout {
  // The panel owns its scrolling body and fixed Save/Cancel footer. Even a
  // short library needs a bounded viewport so text/keyboard growth cannot
  // push the commit action offscreen.
  return {
    snapPoints: [input.width > input.height ? "100%" : "78%"],
    scroll: false,
  };
}
