import { describe, expect, test } from "bun:test";
import {
  formatMobileSearchSectionCount,
  groupMobileSearchFailures,
  partitionMobileLiveSearchGroups,
  resolveMobileLiveSearchRetrySourceIds,
  summarizeMobileSearchSourceNames,
  type MobileLiveSearchGroupLike,
} from "./mobileSearchResults";

const source = (id: string) => ({ id, name: id.toUpperCase() });

describe("partitionMobileLiveSearchGroups", () => {
  test("splits groups into sections, loading, failed and empty, keeping order", () => {
    const groups: MobileLiveSearchGroupLike[] = [
      { status: "ready", source: source("mdx"), items: [1, 2], hasMore: false },
      { status: "ready", source: source("plus"), items: [], hasMore: false },
      { status: "blocked", source: source("raw"), title: "Cloudflare", detail: "verify" },
      { status: "ready", source: source("days"), items: [1], hasMore: true },
      { status: "loading", source: source("komga") },
      { status: "ready", source: source("jump"), items: [], hasMore: false },
    ];
    const partition = partitionMobileLiveSearchGroups(groups);
    expect(partition.sections.map((group) => group.source.id)).toEqual(["mdx", "days"]);
    expect(partition.loading.map((item) => item.id)).toEqual(["komga"]);
    expect(partition.failed.map((group) => group.source.id)).toEqual(["raw"]);
    expect(partition.empty.map((item) => item.id)).toEqual(["plus", "jump"]);
  });

  test("an empty list partitions into empty buckets", () => {
    expect(partitionMobileLiveSearchGroups([])).toEqual({ sections: [], loading: [], failed: [], empty: [] });
  });
});

describe("formatMobileSearchSectionCount", () => {
  test("adds a plus when the source has more", () => {
    expect(formatMobileSearchSectionCount(8)).toBe("8");
    expect(formatMobileSearchSectionCount(20, true)).toBe("20+");
  });
});

describe("summarizeMobileSearchSourceNames", () => {
  test("names every source up to the limit", () => {
    expect(summarizeMobileSearchSourceNames(["A", "B", "C"], 5)).toEqual({ names: ["A", "B", "C"], overflow: 0 });
  });

  test("collapses two or more extra names into a count", () => {
    expect(summarizeMobileSearchSourceNames(["A", "B", "C", "D", "E", "F", "G"], 5)).toEqual({
      names: ["A", "B", "C", "D", "E"],
      overflow: 2,
    });
  });

  test("names a single extra source instead of writing '1 more'", () => {
    expect(summarizeMobileSearchSourceNames(["A", "B", "C"], 2)).toEqual({ names: ["A", "B", "C"], overflow: 0 });
  });
});

describe("resolveMobileLiveSearchRetrySourceIds", () => {
  test("re-searches failed and unanswered sources, never the ones that answered", () => {
    const answered = new Map<string, "ready" | "blocked">([
      ["mdx", "ready"],
      ["raw", "blocked"],
    ]);
    expect(resolveMobileLiveSearchRetrySourceIds({ sourceIds: ["mdx", "raw", "new"], answered })).toEqual([
      "raw",
      "new",
    ]);
  });
});

describe("groupMobileSearchFailures", () => {
  test("merges sources that failed for the same reason, keeping first-failure order", () => {
    const groups = groupMobileSearchFailures([
      { source: source("a"), title: "Source error", detail: "not cached" },
      { source: source("raw"), title: "Cloudflare", detail: "verify" },
      { source: source("b"), title: "Source error", detail: "not cached" },
    ]);
    expect(groups.map((group) => [group.reason, group.sources.map((item) => item.id)])).toEqual([
      ["Source error", ["a", "b"]],
      ["Cloudflare", ["raw"]],
    ]);
    expect(groups[0]?.detail).toBe("not cached");
  });

  test("a failure without a title uses its detail as the reason", () => {
    expect(groupMobileSearchFailures([{ source: source("a"), detail: "boom" }])).toEqual([
      { reason: "boom", detail: undefined, sources: [source("a")] },
    ]);
  });
});
