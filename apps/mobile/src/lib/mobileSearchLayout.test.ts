import { describe, expect, test } from "bun:test";
import { mobileAdaptiveLayout, mobileFoldSplitForContainer } from "@/lib/mobileAdaptiveLayout";
import { getMobileSplitPaneLayout } from "@/lib/mobileSplitPaneLayout";
import {
  MOBILE_SEARCH_SPLIT_OPTIONS,
  formatMobileSearchSidebarCount,
  isMobileSearchSidebarRowSelected,
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

describe("search split layout", () => {
  test("Duo inner landscape, flat: a narrow sidebar beside the results", () => {
    const adaptive = duoInnerLandscape(false);
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
  test("a tap searches only that source; All restores every source", () => {
    expect(resolveMobileSearchSidebarPress({ sourceIds: IDS, selection: null, target: "jump", gesture: "press" })).toEqual([
      "jump",
    ]);
    expect(
      resolveMobileSearchSidebarPress({ sourceIds: IDS, selection: ["jump"], target: "plus", gesture: "press" }),
    ).toEqual(["plus"]);
    expect(resolveMobileSearchSidebarPress({ sourceIds: IDS, selection: [], target: null, gesture: "press" })).toBeNull();
  });

  test("a long press adds or removes a source, in source order", () => {
    expect(
      resolveMobileSearchSidebarPress({ sourceIds: IDS, selection: ["plus"], target: "mangadex", gesture: "longPress" }),
    ).toEqual(["mangadex", "plus"]);
    expect(
      resolveMobileSearchSidebarPress({ sourceIds: IDS, selection: null, target: "jump", gesture: "longPress" }),
    ).toEqual(["mangadex", "plus"]);
    expect(
      resolveMobileSearchSidebarPress({
        sourceIds: IDS,
        selection: ["mangadex", "plus"],
        target: "jump",
        gesture: "longPress",
      }),
    ).toBeNull();
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
