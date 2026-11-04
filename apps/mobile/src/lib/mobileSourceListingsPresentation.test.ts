import { describe, expect, test } from "bun:test";
import type { SourcePackageListing } from "@/data/schema";
import {
  getMobileSourceListingEmptyTitle,
  getMobileSourceListingLabel,
  getMobileTabRevealOffset,
  mergeMobileSourceListingTabs,
  normalizeMobileSourceListings,
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

  test("appends a runtime listing that was only exposed by source home, after the package tabs", () => {
    const seasonal: SourcePackageListing = { id: "seasonal", name: "Seasonal" };

    expect(mergeMobileSourceListingTabs([popular, latest], seasonal)).toEqual([
      popular,
      latest,
      seasonal,
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

  test("falls back to the listing name when a legacy manifest omits the id", () => {
    expect(
      normalizeMobileSourceListings([
        { name: "人气榜" },
        { name: " 收藏榜 " },
        { id: "", name: "新作榜", kind: 1 },
      ]),
    ).toEqual([
      { id: "人气榜", name: "人气榜" },
      { id: "收藏榜", name: "收藏榜" },
      { id: "新作榜", name: "新作榜", kind: 1 },
    ]);
  });

  test("gives nameless listings a positional id and drops duplicate identities", () => {
    expect(
      normalizeMobileSourceListings([
        {},
        { id: "popular", name: "Popular" },
        { id: "popular", name: "Popular again" },
        null,
        { name: "Popular" },
      ]),
    ).toEqual([
      { id: "listing-0", name: "listing-0" },
      { id: "popular", name: "Popular" },
      { id: "Popular", name: "Popular" },
    ]);
  });
});

describe("getMobileTabRevealOffset", () => {
  const row = { offset: 0, viewport: 402, inset: 16 };

  test("leaves a capsule that already shows whole", () => {
    expect(getMobileTabRevealOffset({ ...row, start: 72, end: 142 })).toBeNull();
  });

  test("scrolls a trailing capsule just far enough to clear the gutter", () => {
    expect(getMobileTabRevealOffset({ ...row, start: 279, end: 410 })).toBe(24);
  });

  test("leaves a capsule that shows whole inside the gutter (leaving See All for Home)", () => {
    expect(getMobileTabRevealOffset({ ...row, offset: 13, start: 16, end: 64 })).toBeNull();
  });

  test("scrolls back for a leading capsule cut off by the left edge", () => {
    expect(getMobileTabRevealOffset({ ...row, offset: 40, start: 16, end: 64 })).toBe(0);
  });

  test("waits for the row's width", () => {
    expect(getMobileTabRevealOffset({ ...row, viewport: 0, start: 279, end: 410 })).toBeNull();
  });
});
