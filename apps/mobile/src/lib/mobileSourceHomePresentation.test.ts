import { describe, expect, test } from "bun:test";
import {
  canSelectMobileSourceHomeFeaturedDot,
  getMobileSourceHomeFeaturedCarouselEntry,
  getMobileSourceHomeFeaturedCarouselIndex,
  getMobileSourceHomeFeaturedEntries,
  getMobileSourceHomeFilterItems,
  getMobileSourceHomeListSkeletonCount,
} from "./mobileSourceHomePresentation";

describe("mobile source home presentation", () => {
  test("keeps every featured entry available for presentation", () => {
    const entries = Array.from({ length: 12 }, (_, index) => ({
      id: `featured-${index + 1}`,
    }));

    const visible = getMobileSourceHomeFeaturedEntries(entries);

    expect(visible).toHaveLength(12);
    expect(visible.map((entry) => entry.id)).toEqual(
      entries.map((entry) => entry.id),
    );
    expect(visible.at(-1)?.id).toBe("featured-12");
  });

  test("returns a presentation copy", () => {
    const entries = [{ id: "featured-1" }, { id: "featured-2" }];

    const visible = getMobileSourceHomeFeaturedEntries(entries);

    expect(visible).toEqual(entries);
    expect(visible).not.toBe(entries);
  });

  test("clamps featured carousel indexes to available entries", () => {
    const entries = [{ id: "featured-1" }, { id: "featured-2" }];

    expect(getMobileSourceHomeFeaturedCarouselIndex(entries, -1)).toBe(0);
    expect(getMobileSourceHomeFeaturedCarouselIndex(entries, 0.6)).toBe(1);
    expect(getMobileSourceHomeFeaturedCarouselIndex(entries, 10)).toBe(1);
    expect(getMobileSourceHomeFeaturedCarouselIndex(entries, Number.NaN)).toBe(
      0,
    );
    expect(getMobileSourceHomeFeaturedCarouselIndex([], 3)).toBe(0);
  });

  test("selects the current featured carousel entry", () => {
    const entries = [{ id: "featured-1" }, { id: "featured-2" }];

    expect(getMobileSourceHomeFeaturedCarouselEntry(entries, 1)).toBe(
      entries[1],
    );
    expect(getMobileSourceHomeFeaturedCarouselEntry(entries, 9)).toBe(
      entries[1],
    );
    expect(getMobileSourceHomeFeaturedCarouselEntry([], 0)).toBeNull();
  });

  test("gates the selected featured carousel dot as a no-op selection", () => {
    expect(canSelectMobileSourceHomeFeaturedDot({ selected: false })).toBe(
      true,
    );
    expect(canSelectMobileSourceHomeFeaturedDot({ selected: true })).toBe(
      false,
    );
  });

  test("does not cap source home filter actions", () => {
    const filters = Array.from({ length: 14 }, (_, index) => ({
      title: `Filter ${index + 1}`,
    }));

    const visible = getMobileSourceHomeFilterItems(filters);

    expect(visible).toHaveLength(14);
    expect(visible.at(-1)?.title).toBe("Filter 14");
    expect(visible).not.toBe(filters);
  });

  test("matches web list skeleton counts", () => {
    expect(getMobileSourceHomeListSkeletonCount()).toBe(5);
    expect(getMobileSourceHomeListSkeletonCount(null)).toBe(5);
    expect(getMobileSourceHomeListSkeletonCount(Number.NaN)).toBe(5);
    expect(getMobileSourceHomeListSkeletonCount(3)).toBe(3);
    expect(getMobileSourceHomeListSkeletonCount(2.6)).toBe(3);
    expect(getMobileSourceHomeListSkeletonCount(-4)).toBe(0);
  });
});
