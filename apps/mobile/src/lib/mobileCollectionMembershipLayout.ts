export type MobileCollectionMembershipSheetLayout = {
  snapPoints: [string] | undefined;
  scroll: boolean;
};

/**
 * Small collection sets fit comfortably at their intrinsic height. Larger or
 * constrained layouts get a bounded, scrollable sheet so rows and actions stay
 * reachable without leaving a large empty region in the common empty state.
 */
export function getMobileCollectionMembershipSheetLayout({
  collectionCount,
  fontScale,
  height,
  width,
}: {
  collectionCount: number;
  fontScale: number;
  height: number;
  width: number;
}): MobileCollectionMembershipSheetLayout {
  const effectiveFontScale = Math.max(1, Math.min(fontScale, 2));
  const estimatedContentHeight =
    250 + collectionCount * 72 * effectiveFontScale;
  const safeDynamicHeight = Math.max(300, height * 0.78);
  const constrained =
    estimatedContentHeight > safeDynamicHeight ||
    (width > height && collectionCount > 1);

  return constrained
    ? { snapPoints: ["82%"], scroll: true }
    : { snapPoints: undefined, scroll: false };
}
