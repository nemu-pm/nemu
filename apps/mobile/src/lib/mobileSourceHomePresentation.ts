export function getMobileSourceHomeFeaturedEntries<T>(
  entries: readonly T[],
): T[] {
  return [...entries];
}

export function getMobileSourceHomeFilterItems<T>(items: readonly T[]): T[] {
  return [...items];
}

export function getMobileSourceHomeListSkeletonCount(
  pageSize?: number | null,
): number {
  if (typeof pageSize !== "number" || !Number.isFinite(pageSize)) return 5;
  return Math.max(0, Math.round(pageSize));
}

export function getMobileSourceHomeFeaturedCarouselIndex(
  entries: readonly unknown[],
  index: number,
): number {
  if (!entries.length) return 0;
  if (!Number.isFinite(index)) return 0;
  return Math.min(Math.max(Math.round(index), 0), entries.length - 1);
}

export function getMobileSourceHomeFeaturedCarouselEntry<T>(
  entries: readonly T[],
  index: number,
): T | null {
  if (!entries.length) return null;
  return entries[getMobileSourceHomeFeaturedCarouselIndex(entries, index)];
}

export function canSelectMobileSourceHomeFeaturedDot({
  selected,
}: {
  selected: boolean;
}): boolean {
  return !selected;
}
