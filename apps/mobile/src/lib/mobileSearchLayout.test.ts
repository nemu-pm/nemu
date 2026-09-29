import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { mobileAdaptiveLayout, mobileFoldSplitForContainer } from "@/lib/mobileAdaptiveLayout";
import { getMobileSplitPaneLayout } from "@/lib/mobileSplitPaneLayout";
import {
  MOBILE_SEARCH_SPLIT_OPTIONS,
  mobileSearchShowsKindHeaders,
  mobileSearchFieldHeight,
  mobileSearchResultsTopInset,
  MOBILE_SEARCH_KIND_HEADER_HEIGHT,
  MOBILE_SEARCH_SOURCE_HEADER_HEIGHT,
  formatMobileSearchSidebarCount,
  isMobileSearchSidebarRowSelected,
  resolveMobileSearchSidebarCheckState,
  resolveMobileSearchSidebarPress,
  resolveMobileSearchSidebarStatuses,
  summarizeMobileSearchSidebarStatuses,
} from "./mobileSearchLayout";

const IDS = ["mangadex", "jump", "plus"];

function duoInnerLandscape(active: boolean) {
  return mobileAdaptiveLayout({
    width: 951,
    height: 669,
    supported: true,
    divisions: [{ x: 455.5, y: 0, width: 40, height: 669, active }],
    occlusions: [],
  } as never);
}

function duoLayout(active: boolean) {
  return {
    width: 951,
    height: 669,
    supported: true,
    divisions: [{ id: "fold", x: 455.5, y: 0, width: 40, height: 669, active }],
    occlusions: [],
  };
}

describe("search split layout", () => {
  test("wide flat window without a fold region (tablet): a narrow sidebar beside the results", () => {
    const adaptive = mobileAdaptiveLayout({ width: 951, height: 669, supported: true, divisions: [], occlusions: [] });
    const layout = getMobileSplitPaneLayout({
      // The container stops at the trailing system bar column.
      containerWidth: 867,
      regularWidth: adaptive.regularWidth,
      posture: adaptive.posture,
      foldSplit: null,
      options: MOBILE_SEARCH_SPLIT_OPTIONS,
    });
    expect(layout).toMatchObject({ mode: "split", alignment: "flat", gutter: 0 });
    if (layout.mode !== "split") throw new Error("expected split");
    expect(layout.leading.width).toBeGreaterThanOrEqual(300);
    expect(layout.leading.width).toBeLessThanOrEqual(340);
    expect(layout.trailing.width).toBeGreaterThanOrEqual(MOBILE_SEARCH_SPLIT_OPTIONS.minTrailing);
  });

  test("Duo book posture: the sidebar is exactly the leading half", () => {
    const adaptive = duoInnerLandscape(true);
    expect(adaptive.posture).toBe("book");
    const foldSplit = mobileFoldSplitForContainer(adaptive, { x: 0, y: 0, width: 867, height: 669 });
    const layout = getMobileSplitPaneLayout({
      containerWidth: 867,
      regularWidth: adaptive.regularWidth,
      posture: adaptive.posture,
      foldSplit,
      options: MOBILE_SEARCH_SPLIT_OPTIONS,
    });
    expect(layout).toMatchObject({ mode: "split", alignment: "fold" });
    if (layout.mode !== "split") throw new Error("expected split");
    expect(layout.leading.width).toBeCloseTo(455.5, 1);
    expect(layout.trailing.x).toBeCloseTo(495.5, 1);
  });

  test("Duo inner landscape: unfolding restores the narrower search sidebar", () => {
    const container = { x: 0, y: 0, width: 867, height: 669 };
    const sidebarFor = (layout: ReturnType<typeof duoLayout>) => {
      const adaptive = mobileAdaptiveLayout(layout);
      return getMobileSplitPaneLayout({
        containerWidth: 867,
        regularWidth: adaptive.regularWidth,
        posture: adaptive.posture,
        foldSplit: mobileFoldSplitForContainer(adaptive, container),
        options: MOBILE_SEARCH_SPLIT_OPTIONS,
      });
    };
    const flat = sidebarFor(duoLayout(false));
    expect(flat).not.toEqual(sidebarFor(duoLayout(true)));
    expect(flat).toMatchObject({ mode: "split", alignment: "flat", gutter: 0 });
  });

  test("taller-than-wide regular widths keep one column (Duo inner portrait)", () => {
    expect(
      getMobileSplitPaneLayout({
        containerWidth: 669,
        regularWidth: true,
        posture: "flat",
        foldSplit: null,
        options: MOBILE_SEARCH_SPLIT_OPTIONS,
      }),
    ).toEqual({ mode: "single" });
  });

  test("compact widths never split", () => {
    expect(
      getMobileSplitPaneLayout({
        containerWidth: 466,
        regularWidth: false,
        posture: "flat",
        foldSplit: null,
        options: MOBILE_SEARCH_SPLIT_OPTIONS,
      }),
    ).toEqual({ mode: "single" });
  });
});

describe("sidebar statuses", () => {
  test("no query: nothing to report", () => {
    expect(resolveMobileSearchSidebarStatuses({ query: " ", groups: null, memory: null })).toEqual({
      statuses: {},
      memory: null,
    });
  });

  test("maps live groups to loading / count / error", () => {
    const { statuses } = resolveMobileSearchSidebarStatuses({
      query: "frieren",
      groups: [
        { sourceId: "mangadex", status: "ready", count: 7, hasMore: false },
        { sourceId: "jump", status: "loading" },
        { sourceId: "plus", status: "blocked" },
      ],
      memory: null,
    });
    expect(statuses).toEqual({
      mangadex: { kind: "count", count: 7, more: false },
      jump: { kind: "loading" },
      plus: { kind: "error" },
    });
  });

  test("out-of-scope sources keep their answer for the same query", () => {
    const first = resolveMobileSearchSidebarStatuses({
      query: "frieren",
      groups: [
        { sourceId: "mangadex", status: "ready", count: 7, hasMore: true },
        { sourceId: "jump", status: "ready", count: 2, hasMore: false },
      ],
      memory: null,
    });
    // Narrowed to MangaDex, which re-runs: its count stays until it answers.
    const narrowed = resolveMobileSearchSidebarStatuses({
      query: "frieren",
      groups: [{ sourceId: "mangadex", status: "loading" }],
      memory: first.memory,
    });
    expect(narrowed.statuses).toEqual({
      mangadex: { kind: "count", count: 7, more: true },
      jump: { kind: "count", count: 2, more: false },
    });
  });

  test("a new query starts afresh", () => {
    const first = resolveMobileSearchSidebarStatuses({
      query: "frieren",
      groups: [{ sourceId: "jump", status: "ready", count: 2, hasMore: false }],
      memory: null,
    });
    const next = resolveMobileSearchSidebarStatuses({
      query: "dandadan",
      groups: [{ sourceId: "mangadex", status: "loading" }],
      memory: first.memory,
    });
    expect(next.statuses).toEqual({ mangadex: { kind: "loading" } });
  });

  test("a failed source shows loading again when retried", () => {
    const failed = resolveMobileSearchSidebarStatuses({
      query: "frieren",
      groups: [{ sourceId: "plus", status: "blocked" }],
      memory: null,
    });
    const retry = resolveMobileSearchSidebarStatuses({
      query: "frieren",
      groups: [{ sourceId: "plus", status: "loading" }],
      memory: failed.memory,
    });
    expect(retry.statuses.plus).toEqual({ kind: "loading" });
  });

  test("the All row sums the scope and waits for loading rows", () => {
    const statuses = {
      mangadex: { kind: "count", count: 7, more: false },
      jump: { kind: "count", count: 2, more: true },
      plus: { kind: "error" },
    } as const;
    expect(summarizeMobileSearchSidebarStatuses(statuses, IDS)).toEqual({ kind: "count", count: 9, more: true });
    expect(summarizeMobileSearchSidebarStatuses(statuses, ["mangadex"])).toEqual({
      kind: "count",
      count: 7,
      more: false,
    });
    expect(
      summarizeMobileSearchSidebarStatuses({ ...statuses, jump: { kind: "loading" } }, IDS),
    ).toEqual({ kind: "loading" });
    expect(summarizeMobileSearchSidebarStatuses({}, IDS)).toEqual({ kind: "none" });
    expect(formatMobileSearchSidebarCount({ kind: "count", count: 20, more: true })).toBe("20+");
  });
});

describe("sidebar selection", () => {
  test("a tap toggles the source (multi-select, like the phone chips); All restores every source", () => {
    expect(resolveMobileSearchSidebarPress({ sourceIds: IDS, selection: null, target: "jump", gesture: "press" })).toEqual([
      "mangadex",
      "plus",
    ]);
    expect(
      resolveMobileSearchSidebarPress({ sourceIds: IDS, selection: ["jump"], target: "plus", gesture: "press" }),
    ).toEqual(["plus", "jump"].sort((x, y) => IDS.indexOf(x) - IDS.indexOf(y)));
    expect(
      resolveMobileSearchSidebarPress({ sourceIds: IDS, selection: ["mangadex", "plus"], target: "jump", gesture: "press" }),
    ).toBeNull();
    expect(resolveMobileSearchSidebarPress({ sourceIds: IDS, selection: [], target: null, gesture: "press" })).toBeNull();
  });

  test("double tap / long press searches only that source", () => {
    expect(
      resolveMobileSearchSidebarPress({ sourceIds: IDS, selection: null, target: "jump", gesture: "only" }),
    ).toEqual(["jump"]);
  });

  test("a single installed source always searches everything", () => {
    expect(
      resolveMobileSearchSidebarPress({ sourceIds: ["mangadex"], selection: null, target: "mangadex", gesture: "press" }),
    ).toBeNull();
  });

  test("unknown sources leave the scope unchanged", () => {
    expect(
      resolveMobileSearchSidebarPress({ sourceIds: IDS, selection: ["jump"], target: "gone", gesture: "press" }),
    ).toEqual(["jump"]);
  });

  test("highlighted rows", () => {
    expect(isMobileSearchSidebarRowSelected(null, null)).toBe(true);
    expect(isMobileSearchSidebarRowSelected(null, "jump")).toBe(false);
    expect(isMobileSearchSidebarRowSelected(["jump"], "jump")).toBe(true);
    expect(isMobileSearchSidebarRowSelected(["jump"], null)).toBe(false);
  });
});

describe("resolveMobileSearchSidebarCheckState", () => {
  const sourceIds = ["a", "b", "c"];

  test("every row is checked while all sources are in scope", () => {
    expect(resolveMobileSearchSidebarCheckState({ selection: null, target: null, sourceIds })).toBe("on");
    expect(resolveMobileSearchSidebarCheckState({ selection: null, target: "b", sourceIds })).toBe("on");
  });

  test("a partial scope checks its sources and marks All as mixed", () => {
    const selection = ["a", "c"];
    expect(resolveMobileSearchSidebarCheckState({ selection, target: "a", sourceIds })).toBe("on");
    expect(resolveMobileSearchSidebarCheckState({ selection, target: "b", sourceIds })).toBe("off");
    expect(resolveMobileSearchSidebarCheckState({ selection, target: null, sourceIds })).toBe("mixed");
  });

  test("an empty scope leaves All unchecked", () => {
    expect(resolveMobileSearchSidebarCheckState({ selection: [], target: null, sourceIds })).toBe("off");
  });
});

describe("result group labels", () => {
  test("only when library matches and live results are both on screen", () => {
    expect(mobileSearchShowsKindHeaders({ libraryRows: 3, liveActive: true })).toBe(true);
    expect(mobileSearchShowsKindHeaders({ libraryRows: 0, liveActive: true })).toBe(false);
    expect(mobileSearchShowsKindHeaders({ libraryRows: 3, liveActive: false })).toBe(false);
  });
});

describe("sidebar split vertical grid", () => {
  test("adds alignment within the header without replacing the shared page padding", () => {
    const screen = readFileSync(new URL("../screens/SearchScreen.tsx", import.meta.url), "utf8");
    expect(screen).toContain("contentContainerStyle={split ? splitPadding.trailing : undefined}");
    expect(screen).toContain("ListHeaderComponentStyle={splitResultsHeaderStyle}");
  });
  test("the first results header is centred on the sidebar search field", () => {
    expect(mobileSearchResultsTopInset({ fieldHeight: mobileSearchFieldHeight("ios"), firstHeaderHeight: MOBILE_SEARCH_SOURCE_HEADER_HEIGHT })).toBe(2);
    expect(mobileSearchResultsTopInset({ fieldHeight: mobileSearchFieldHeight("android"), firstHeaderHeight: MOBILE_SEARCH_SOURCE_HEADER_HEIGHT })).toBe(8);
    expect(mobileSearchResultsTopInset({ fieldHeight: 36, firstHeaderHeight: MOBILE_SEARCH_KIND_HEADER_HEIGHT })).toBe(8);
  });
});
