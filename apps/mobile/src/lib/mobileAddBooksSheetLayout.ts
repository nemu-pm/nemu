export type MobileAddBooksSheetLayout = {
  snapPoints: [string] | [string, string] | undefined;
  bounded: boolean;
};

/**
 * Keep short Add Books lists close to their content while retaining a bounded,
 * scrollable surface for long lists and constrained accessibility layouts.
 */
export function getMobileAddBooksSheetLayout({
  entryCount,
  fontScale,
  height,
  width,
}: {
  entryCount: number;
  fontScale: number;
  height: number;
  width: number;
}): MobileAddBooksSheetLayout {
  // Android uses the first detent as its fixed content budget. A 62% detent
  // in landscape leaves almost no room between the header and commit footer.
  if (width > height) return { snapPoints: ["100%"], bounded: true };
  const effectiveFontScale = Math.max(1, Math.min(fontScale, 2));
  const estimatedHeight = Math.max(
    330,
    Math.ceil(290 + entryCount * 72 * effectiveFontScale),
  );
  const maxContentSizedHeight = height * 0.84;
  const constrained =
    fontScale >= 1.6 ||
    estimatedHeight > maxContentSizedHeight;

  return constrained
    ? { snapPoints: ["62%", "88%"], bounded: true }
    : { snapPoints: undefined, bounded: false };
}
