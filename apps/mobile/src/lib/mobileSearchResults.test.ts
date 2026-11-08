import { describe, expect, test } from "bun:test";
import {
  formatMobileSearchSidebarCount,
  mobileSearchShowsKindHeaders,
  resolveMobileSearchSidebarStatuses,
  summarizeMobileSearchSidebarStatuses,
} from "./mobileSearchLayout";
import {
  formatMobileSearchSectionCount,
  groupMobileSearchFailures,
  mobileLiveSearchPartitionHasContent,
  omitLibraryTitlesFromLiveSearchGroups,
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
    expect(partitionMobileLiveSearchGroups([])).toEqual({ sections: [], loading: [], failed: [], empty: [], inLibrary: [] });
  });
});

describe("omitLibraryTitlesFromLiveSearchGroups", () => {
  const liveSource = (sourceId: string, sourceKeys?: string[]) => ({
    id: `reg:${sourceId}`,
    name: sourceId.toUpperCase(),
    registryId: "reg",
    rawSourceId: sourceId,
    sourceKeys,
  });
  const ready = (sourceId: string, ids: string[], hasMore = false, sourceKeys?: string[]) => ({
    status: "ready" as const,
    source: liveSource(sourceId, sourceKeys),
    items: ids.map((id) => ({ id, title: "Same Title" })),
    hasMore,
  });
  const saved = (...links: [sourceId: string, sourceMangaId: string, registryId?: string][]) => ({
    sources: links.map(([sourceId, sourceMangaId, registryId = "reg"]) => ({
      id: `${registryId}:${sourceId}:${sourceMangaId}`,
      libraryItemId: "item",
      registryId,
      sourceId,
      sourceMangaId,
      createdAt: 0,
      updatedAt: 0,
    })),
  });
  const itemIds = (group: { status: string; items?: readonly { id: string }[] } | undefined) =>
    group?.items?.map((item) => item.id);

  test("removes the shown title and keeps the others in order", () => {
    const [group] = omitLibraryTitlesFromLiveSearchGroups(
      [ready("ndl", ["a", "saved", "b"], true)],
      [saved(["ndl", "saved"])],
    );
    expect(itemIds(group)).toEqual(["a", "b"]);
    expect(group?.status === "ready" && group.hasMore).toBe(true);
  });

  test("matches on source and manga key, never on the title", () => {
    const groups = [ready("ndl", ["other-key"]), ready("mdx", ["saved"])];
    expect(omitLibraryTitlesFromLiveSearchGroups(groups, [saved(["ndl", "saved"])])).toBe(groups);
  });

  test("a registry mismatch is a different source", () => {
    const groups = [ready("ndl", ["saved"])];
    expect(omitLibraryTitlesFromLiveSearchGroups(groups, [saved(["ndl", "saved", "elsewhere"])])).toBe(groups);
  });

  test("covers every source a library item links", () => {
    const groups = omitLibraryTitlesFromLiveSearchGroups(
      [ready("ndl", ["n1", "n2"]), ready("mdx", ["m1", "m2"]), ready("raw", ["n1"])],
      [saved(["ndl", "n1"], ["mdx", "m2"])],
    );
    expect(groups.map(itemIds)).toEqual([["n2"], ["m1"], ["n1"]]);
  });

  test("recognises a source link through the source's alias keys", () => {
    const [group] = omitLibraryTitlesFromLiveSearchGroups(
      [ready("manifest.id", ["saved", "new"], false, ["reg:manifest.id", "reg:registry-id"])],
      [saved(["registry-id", "saved"])],
    );
    expect(itemIds(group)).toEqual(["new"]);
  });

  test("leaves loading and failed sources alone, and their order", () => {
    const loading = { status: "loading" as const, source: liveSource("late") };
    const blocked = { status: "blocked" as const, source: liveSource("raw"), detail: "verify" };
    const groups = omitLibraryTitlesFromLiveSearchGroups(
      [ready("mdx", ["saved", "new"]), blocked, loading],
      [saved(["mdx", "saved"], ["raw", "saved"], ["late", "saved"])],
    );
    expect(groups.map((group) => group.source.rawSourceId)).toEqual(["mdx", "raw", "late"]);
    expect(groups[1]).toBe(blocked);
    expect(groups[2]).toBe(loading);
  });

  test("keeps the same array when nothing is shown or nothing matches, so nothing redraws", () => {
    const groups = [ready("ndl", ["a"])];
    expect(omitLibraryTitlesFromLiveSearchGroups(groups, [])).toBe(groups);
    expect(omitLibraryTitlesFromLiveSearchGroups(groups, [saved(["ndl", "b"])])).toBe(groups);
  });

  test("does not change the answers it was given", () => {
    const groups = [ready("ndl", ["saved", "new"])];
    omitLibraryTitlesFromLiveSearchGroups(groups, [saved(["ndl", "saved"])]);
    expect(itemIds(groups[0])).toEqual(["saved", "new"]);
  });

  test("a source left empty is in the Library line, not the no-results line", () => {
    const partition = partitionMobileLiveSearchGroups(
      omitLibraryTitlesFromLiveSearchGroups(
        [ready("ndl", ["saved"]), ready("mdx", ["new"]), ready("none", [])],
        [saved(["ndl", "saved"])],
      ),
    );
    expect(partition.sections.map((group) => group.source.rawSourceId)).toEqual(["mdx"]);
    expect(partition.inLibrary.map((source) => source.rawSourceId)).toEqual(["ndl"]);
    expect(partition.empty.map((source) => source.rawSourceId)).toEqual(["none"]);
  });

  test("a source left empty with more pages keeps its section for See All", () => {
    const partition = partitionMobileLiveSearchGroups(
      omitLibraryTitlesFromLiveSearchGroups([ready("ndl", ["saved"], true)], [saved(["ndl", "saved"])]),
    );
    expect(partition.sections.map((group) => group.source.rawSourceId)).toEqual(["ndl"]);
    expect(partition.sections[0]?.hasMore).toBe(true);
    expect(partition.inLibrary).toEqual([]);
    expect(partition.empty).toEqual([]);
  });

  test("a source that found nothing but reports more pages still has no results", () => {
    const partition = partitionMobileLiveSearchGroups([ready("ndl", [], true)]);
    expect(partition.sections).toEqual([]);
    expect(partition.empty.map((source) => source.rawSourceId)).toEqual(["ndl"]);
  });

  test("a source keeping some results is not marked as all in the Library", () => {
    const [group] = omitLibraryTitlesFromLiveSearchGroups<MobileLiveSearchGroupLike<ReturnType<typeof liveSource>> & { status: "ready"; items: readonly { id: string }[] }>(
      [ready("ndl", ["saved", "new"])],
      [saved(["ndl", "saved"])],
    );
    expect(group?.allInLibrary).toBe(false);
  });

  test("the sidebar counts 0+ only for a source that truly has more", () => {
    const groups = omitLibraryTitlesFromLiveSearchGroups(
      [ready("more", ["saved"], true), ready("done", ["saved"])],
      [saved(["more", "saved"], ["done", "saved"])],
    );
    const { statuses } = resolveMobileSearchSidebarStatuses({
      query: "q",
      groups: groups.map((group) => ({
        sourceId: group.source.id,
        status: "ready",
        count: group.items.length,
        hasMore: group.hasMore,
      })),
      memory: null,
    });
    const more = statuses["reg:more"];
    const done = statuses["reg:done"];
    expect(more?.kind === "count" && formatMobileSearchSidebarCount(more)).toBe("0+");
    expect(done?.kind === "count" && formatMobileSearchSidebarCount(done)).toBe("0");
    expect(summarizeMobileSearchSidebarStatuses({ "reg:done": done! }, ["reg:done"])).toEqual({
      kind: "count",
      count: 0,
      more: false,
    });
  });

  test("section and sidebar counts follow the filtered results", () => {
    const groups = omitLibraryTitlesFromLiveSearchGroups(
      [ready("ndl", ["saved"]), ready("mdx", ["saved", "new"], true)],
      [saved(["ndl", "saved"], ["mdx", "saved"])],
    );
    const [ndl, mdx] = groups;
    expect(formatMobileSearchSectionCount(mdx?.items.length ?? -1, mdx?.hasMore)).toBe("1+");
    const { statuses } = resolveMobileSearchSidebarStatuses({
      query: "q",
      groups: groups.map((group) => ({
        sourceId: group.source.id,
        status: "ready",
        count: group.items.length,
        hasMore: group.hasMore,
      })),
      memory: null,
    });
    expect(statuses[ndl?.source.id ?? ""]).toEqual({ kind: "count", count: 0, more: false });
    expect(statuses[mdx?.source.id ?? ""]).toEqual({ kind: "count", count: 1, more: true });
  });
});

describe("sources with titles in the Library section", () => {
  const ready = (id: string, items: unknown[] = [], extra: { hasMore?: boolean; allInLibrary?: boolean } = {}) => ({
    status: "ready" as const,
    source: source(id),
    items,
    hasMore: false,
    ...extra,
  });
  const inLibrary = (...ids: string[]) => new Set(ids);
  const emptyIds = (partition: ReturnType<typeof partitionMobileLiveSearchGroups>) =>
    partition.empty.map((item) => item.id);

  test("a source the Library lists is not named as having no results", () => {
    const partition = partitionMobileLiveSearchGroups([ready("pepper"), ready("other")], inLibrary("pepper"));
    expect(emptyIds(partition)).toEqual(["other"]);
    expect(partition.inLibrary).toEqual([]);
  });

  test("a full Library with no live matches ends with no live part at all", () => {
    const partition = partitionMobileLiveSearchGroups(
      [ready("pepper"), ready("theater"), ready("ndl")],
      inLibrary("pepper", "theater", "ndl"),
    );
    expect(emptyIds(partition)).toEqual([]);
    expect(partition.inLibrary).toEqual([]);
    expect(mobileLiveSearchPartitionHasContent(partition)).toBe(false);
    expect(
      mobileSearchShowsKindHeaders({
        libraryRows: 7,
        liveActive: mobileLiveSearchPartitionHasContent(partition),
      }),
    ).toBe(false);
  });

  test("the already-in-library line is only for results that were filtered out", () => {
    const partition = partitionMobileLiveSearchGroups(
      [ready("filtered", [], { allInLibrary: true }), ready("missed")],
      inLibrary("filtered", "missed"),
    );
    expect(partition.inLibrary.map((item) => item.id)).toEqual(["filtered"]);
    expect(emptyIds(partition)).toEqual([]);
    expect(mobileLiveSearchPartitionHasContent(partition)).toBe(true);
  });

  test("still reports its other live states", () => {
    const partition = partitionMobileLiveSearchGroups(
      [
        ready("found", [1]),
        ready("more", [], { hasMore: true, allInLibrary: true }),
        { status: "loading", source: source("late") },
        { status: "blocked", source: source("raw"), detail: "verify" },
      ],
      inLibrary("found", "more", "late", "raw"),
    );
    expect(partition.sections.map((group) => group.source.id)).toEqual(["found", "more"]);
    expect(partition.loading.map((item) => item.id)).toEqual(["late"]);
    expect(partition.failed.map((group) => group.source.id)).toEqual(["raw"]);
  });

  test("a source without Library titles still has no results, and the page says so", () => {
    const partition = partitionMobileLiveSearchGroups([ready("other")], inLibrary());
    expect(emptyIds(partition)).toEqual(["other"]);
    expect(mobileLiveSearchPartitionHasContent(partition)).toBe(true);
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
