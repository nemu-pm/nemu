import type { SourcePackageListing } from "@/data/schema";

export function getMobileSourceListingLabel(
  listing: Pick<SourcePackageListing, "id"> & { name?: string | null },
): string {
  return listing.name?.trim() || listing.id;
}

/**
 * Aidoku manifests and `getListings()` may omit a listing `id` (legacy sources
 * such as 漫客栈 ship `[{ "name": "人气榜" }, …]`). The web adapter falls back
 * to the name; without the same fallback here every tab compared equal
 * (`undefined === undefined`), so all of them rendered selected, React warned
 * about duplicate keys, and no listing was ever requested. Ids are trimmed,
 * fall back to the name and then to the position, and duplicates keep their
 * first occurrence so a tab row never carries two rows with one identity.
 */
export function normalizeMobileSourceListings(
  listings: ReadonlyArray<
    Partial<Pick<SourcePackageListing, "id" | "name" | "kind">> | null | undefined
  >,
): SourcePackageListing[] {
  const seen = new Set<string>();
  const normalized: SourcePackageListing[] = [];
  listings.forEach((listing, index) => {
    if (!listing) return;
    const rawId = typeof listing.id === "string" ? listing.id.trim() : "";
    const rawName = typeof listing.name === "string" ? listing.name.trim() : "";
    const id = rawId || rawName || `listing-${index}`;
    if (seen.has(id)) return;
    seen.add(id);
    const entry: SourcePackageListing = { id, name: rawName || id };
    if (listing.kind === 0 || listing.kind === 1) entry.kind = listing.kind;
    normalized.push(entry);
  });
  return normalized;
}

export function getMobileSourceListingEmptyTitle(
  status: "idle" | "ready",
  strings: {
    noMangaInListing: string;
    noMangaLoadedFromListing: string;
  },
): string {
  return status === "ready"
    ? strings.noMangaInListing
    : strings.noMangaLoadedFromListing;
}

export function mergeMobileSourceListingTabs(
  staticListings: SourcePackageListing[],
  selectedRuntimeListing: SourcePackageListing | null | undefined,
): SourcePackageListing[] {
  if (!selectedRuntimeListing) return staticListings;
  if (staticListings.some((listing) => listing.id === selectedRuntimeListing.id)) {
    return staticListings;
  }
  // Last, so the package tabs keep their places when it comes and goes.
  return [...staticListings, selectedRuntimeListing];
}

/**
 * Where a scrolling row of capsules scrolls so the selected one shows whole;
 * null when it is already whole on screen (in the gutter or not), so moving
 * the selection to a visible capsule never scrolls the row. A cut-off one
 * lands on the gutter. `start`/`end` are the capsule's edges in the row's
 * content, `inset`/`trailingInset` the row's padding (the page gutters), and
 * `barSide` the side where the row runs under the system's vertical bar: that
 * side's gutter hides a capsule, so it counts as cut off.
 */
export function getMobileTabRevealOffset({
  start,
  end,
  offset,
  viewport,
  inset,
  trailingInset = inset,
  barSide = null,
}: {
  start: number;
  end: number;
  offset: number;
  viewport: number;
  inset: number;
  trailingInset?: number;
  barSide?: "left" | "right" | null;
}): number | null {
  if (viewport <= 0) return null;
  const leadingEdge = offset + (barSide === "left" ? inset : 0);
  const trailingEdge = offset + viewport - (barSide === "right" ? trailingInset : 0);
  if (start < leadingEdge) return Math.max(0, start - inset);
  if (end > trailingEdge) return end + trailingInset - viewport;
  return null;
}
