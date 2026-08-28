import type { SourcePackageListing } from "@/data/schema";

export function getMobileSourceListingLabel(
  listing: Pick<SourcePackageListing, "id"> & { name?: string | null },
): string {
  return listing.name?.trim() || listing.id;
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
  return [selectedRuntimeListing, ...staticListings];
}
