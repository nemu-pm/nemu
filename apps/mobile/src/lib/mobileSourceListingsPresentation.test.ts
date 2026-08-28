import { describe, expect, test } from "bun:test";
import type { SourcePackageListing } from "@/data/schema";
import {
  getMobileSourceListingEmptyTitle,
  getMobileSourceListingLabel,
  mergeMobileSourceListingTabs,
} from "./mobileSourceListingsPresentation";

const popular: SourcePackageListing = { id: "popular", name: "Popular" };
const latest: SourcePackageListing = { id: "latest", name: "Latest" };

describe("mobile source listing presentation", () => {
  test("distinguishes a completed empty listing from one not loaded yet", () => {
    const strings = {
      noMangaInListing: "No manga found in this listing.",
      noMangaLoadedFromListing: "No manga loaded from this listing yet.",
    };

    expect(getMobileSourceListingEmptyTitle("ready", strings)).toBe(
      strings.noMangaInListing,
    );
    expect(getMobileSourceListingEmptyTitle("idle", strings)).toBe(
      strings.noMangaLoadedFromListing,
    );
  });

  test("falls back to the manifest id when Aidoku omits a listing name", () => {
    expect(getMobileSourceListingLabel({ id: "Updates" })).toBe("Updates");
    expect(getMobileSourceListingLabel({ id: "Ranking", name: " " })).toBe(
      "Ranking",
    );
    expect(getMobileSourceListingLabel({ id: "popular", name: "Popular" })).toBe(
      "Popular",
    );
  });

  test("keeps static manifest listing order when no runtime listing is selected", () => {
    expect(mergeMobileSourceListingTabs([popular, latest], null)).toEqual([
      popular,
      latest,
    ]);
  });

  test("uses static listings when the selected runtime listing already exists", () => {
    expect(
      mergeMobileSourceListingTabs([popular, latest], {
        id: "popular",
        name: "Runtime Popular",
      })
    ).toEqual([popular, latest]);
  });

  test("prepends a selected runtime listing that was only exposed by source home", () => {
    const seasonal: SourcePackageListing = { id: "seasonal", name: "Seasonal" };

    expect(mergeMobileSourceListingTabs([popular, latest], seasonal)).toEqual([
      seasonal,
      popular,
      latest,
    ]);
    expect(mergeMobileSourceListingTabs([], seasonal)).toEqual([seasonal]);
  });

  test("does not cap static source listings", () => {
    const listings = Array.from({ length: 12 }, (_, index) => ({
      id: `listing-${index + 1}`,
      name: `Listing ${index + 1}`,
    }));

    expect(mergeMobileSourceListingTabs(listings, null)).toHaveLength(12);
    expect(mergeMobileSourceListingTabs(listings, null).at(-1)?.id).toBe(
      "listing-12"
    );
  });
});
