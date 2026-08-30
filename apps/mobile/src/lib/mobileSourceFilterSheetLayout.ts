export type MobileSourceFilterSheetLayout = {
  bounded: boolean;
  snapPoints: [string] | undefined;
};

/**
 * Filter controls already cap their intrinsic scroll area. Let that compact
 * content determine the sheet height on normal portrait phones; reserve a
 * bounded viewport only where the available height or text scale demands it.
 */
export function getMobileSourceFilterSheetLayout({
  fontScale,
  height,
  width,
}: {
  fontScale: number;
  height: number;
  width: number;
}): MobileSourceFilterSheetLayout {
  const bounded = width > height || height < 700 || fontScale >= 1.6;
  return bounded
    ? { bounded: true, snapPoints: ["88%"] }
    : { bounded: false, snapPoints: undefined };
}
