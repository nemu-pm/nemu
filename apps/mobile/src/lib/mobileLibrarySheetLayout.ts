export type MobileLibrarySheetLayout = {
  snapPoints: string[] | undefined;
  scroll: boolean;
};

type MobileLibrarySheetLayoutInput = {
  collectionCount: number;
  fontScale: number;
  height: number;
  width: number;
};

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
    54,
  );
  // Expo's dynamically sized Android sheet can retain the portrait content
  // width after rotating, which shifts this compact row menu outside the
  // visible landscape sheet. A bounded scroll frame owns the current sheet
  // width and keeps every row inside its native container.
  if (input.width > input.height) {
    return { snapPoints: ["78%", "100%"], scroll: true };
  }
  return estimatedHeight > Math.max(280, input.height * 0.72)
    ? { snapPoints: ["48%"], scroll: true }
    : { snapPoints: undefined, scroll: false };
}

export function getMobileCollectionsManagerSheetLayout(
  input: MobileLibrarySheetLayoutInput,
): MobileLibrarySheetLayout {
  const estimatedHeight = mobileLibrarySheetEstimatedHeight(input, 96, 76);
  return estimatedHeight > Math.max(300, input.height * 0.78)
    ? { snapPoints: ["78%"], scroll: true }
    : { snapPoints: undefined, scroll: false };
}

export function getMobileManageCollectionSheetLayout({
  collectionCount: entryCount,
  ...input
}: MobileLibrarySheetLayoutInput): MobileLibrarySheetLayout {
  const estimatedHeight = mobileLibrarySheetEstimatedHeight(
    { ...input, collectionCount: entryCount },
    286,
    68,
  );
  const constrained =
    input.width > input.height ||
    input.fontScale >= 1.6 ||
    estimatedHeight > Math.max(360, input.height * 0.78);
  return input.width > input.height
    ? {
        snapPoints: ["100%"],
        scroll: true,
      }
    : constrained
      ? { snapPoints: ["78%"], scroll: true }
    : { snapPoints: undefined, scroll: false };
}
