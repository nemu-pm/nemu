import { describe, expect, test } from "bun:test";
import {
  applyMobileSettingsCollapsePlan,
  getMobileSettingsPageChain,
  getMobileSettingsPrimaryPane,
  getMobileSettingsStackSections,
  isMobileSettingsRestoredPush,
  isMobileSettingsStackTop,
  planMobileSettingsSplitCollapse as plan,
  type MobileSettingsStackState,
  getMobileSettingsSplitColumnBack as columnBack,
  getMobileSettingsSplitColumnTitles as columnTitles,
  getMobileSettingsSplitHighlightedRow,
  resolveMobileSettingsSplitSelection as resolve,
} from "./mobileSettingsSplit";

describe("settings split selection", () => {
  test("defaults to the first section", () => {
    expect(resolve({ selected: null, routeSection: null, focus: undefined })).toBe("reader");
  });

  test("a deep link to settings/[section] selects that section", () => {
    expect(resolve({ selected: null, routeSection: "sources", focus: undefined })).toBe("sources");
  });

  test("the agent focus deep link implies Data", () => {
    expect(resolve({ selected: null, routeSection: null, focus: "agent" })).toBe("data");
  });

  test("an explicit selection wins over the route", () => {
    expect(resolve({ selected: "appearance", routeSection: "sources", focus: "agent" })).toBe("appearance");
  });

  test("Source Directories keeps Installed Sources selected in the section list", () => {
    expect(getMobileSettingsSplitHighlightedRow("directories")).toBe("sources");
    for (const section of ["reader", "sources", "appearance", "data", "experimental"] as const) {
      expect(getMobileSettingsSplitHighlightedRow(section)).toBe(section);
    }
  });

  test("the route's own instance keeps its pane across a resize", () => {
    expect(getMobileSettingsPrimaryPane(null)).toBe("list");
    expect(getMobileSettingsPrimaryPane("data")).toBe("detail");
    // The root keeps a split selection on screen until its re-push lands.
    expect(getMobileSettingsPrimaryPane(null, "directories")).toBe("detail");
  });

  test("each column carries its own title on the Duo; iPad and Android keep the native one", () => {
    const base = { split: true, platform: "ios", isPad: false, verticalBar: false };
    expect(columnTitles(base)).toBe("center");
    expect(columnTitles({ ...base, verticalBar: true })).toBe("leading");
    expect(columnTitles({ ...base, split: false })).toBeNull();
    expect(columnTitles({ ...base, isPad: true })).toBeNull();
    expect(columnTitles({ ...base, platform: "android" })).toBeNull();
  });
});

describe("settings split column back", () => {
  test("rides in the vertical bar, drawn under a top bar, atop the pane otherwise", () => {
    expect(columnBack({ columnTitles: "leading", pushed: true })).toBe("bar");
    expect(columnBack({ columnTitles: "center", pushed: true })).toBe("column");
    expect(columnBack({ columnTitles: null, pushed: true })).toBe("pane");
  });

  test("shows only while Source Directories is pushed", () => {
    expect(columnBack({ columnTitles: "leading", pushed: false })).toBeNull();
    expect(columnBack({ columnTitles: "center", pushed: false })).toBeNull();
    expect(columnBack({ columnTitles: null, pushed: false })).toBeNull();
  });
});

describe("settings split collapse keeps the page", () => {
  test("Source Directories sits on Installed Sources; every other section on the root", () => {
    expect(getMobileSettingsPageChain("directories")).toEqual(["sources", "directories"]);
    expect(getMobileSettingsPageChain("appearance")).toEqual(["appearance"]);
  });

  test("the root's selection is pushed, the whole chain for Source Directories", () => {
    expect(plan({ routeSections: [], shown: "directories" })).toEqual({ keep: 0, push: ["sources", "directories"] });
    expect(plan({ routeSections: [], shown: "appearance" })).toEqual({ keep: 0, push: ["appearance"] });
  });

  test("no selection keeps the root list, and a stack already on the page is left alone", () => {
    expect(plan({ routeSections: [], shown: null })).toBeNull();
    expect(plan({ routeSections: ["sources"], shown: "sources" })).toBeNull();
    expect(plan({ routeSections: ["sources", "directories"], shown: "directories" })).toBeNull();
  });

  test("a pushed route keeps its place under the page it opened", () => {
    expect(plan({ routeSections: ["sources"], shown: "directories" })).toEqual({ keep: 1, push: ["directories"] });
  });

  test("mixed stacks are rebuilt, always with a new route on top (a push, never a pop)", () => {
    // Deep link to Source Directories: Installed Sources goes under it.
    expect(plan({ routeSections: ["directories"], shown: "directories" })).toEqual({ keep: 0, push: ["sources", "directories"] });
    // Back to Installed Sources in the split, over a Source Directories route.
    expect(plan({ routeSections: ["sources", "directories"], shown: "sources" })).toEqual({ keep: 0, push: ["sources"] });
    expect(plan({ routeSections: ["directories"], shown: "sources" })).toEqual({ keep: 0, push: ["sources"] });
    expect(plan({ routeSections: ["sources"], shown: "appearance" })).toEqual({ keep: 0, push: ["appearance"] });
    expect(plan({ routeSections: [null], shown: "appearance" })).toEqual({ keep: 0, push: ["appearance"] });
  });

  const stack = (sections: string[], index = sections.length): MobileSettingsStackState => ({
    key: "stack-1",
    type: "stack",
    routeNames: ["index", "[section]", "account", "server"],
    index,
    routes: [
      { key: "index-1", name: "index", params: {} },
      ...sections.map((section, i) => ({ key: `section-${i}`, name: "[section]", params: { section } })),
    ],
  });

  test("reads the stack's sections and its top", () => {
    const state = stack(["sources", "directories"]);
    expect(getMobileSettingsStackSections(state)).toEqual(["sources", "directories"]);
    expect(isMobileSettingsStackTop(state, "directories")).toBe(true);
    expect(isMobileSettingsStackTop(state, "sources")).toBe(false);
    expect(isMobileSettingsStackTop(state, null)).toBe(false);
    expect(isMobileSettingsStackTop(stack([]), null)).toBe(true);
  });

  test("the RESET keeps the root and kept routes by key and marks the pushed ones", () => {
    const next = applyMobileSettingsCollapsePlan(stack(["sources"]), { keep: 1, push: ["directories"] });
    expect(next.index).toBe(2);
    expect(next.routes).toEqual([
      { key: "index-1", name: "index", params: {} },
      { key: "section-0", name: "[section]", params: { section: "sources" } },
      { name: "[section]", params: { section: "directories", restored: "1" } },
    ]);
    expect(next.stale).toBe(false);
    expect(next.routeNames).toEqual(["index", "[section]", "account", "server"]);
    expect(isMobileSettingsRestoredPush(next.routes[2]?.params)).toBe(true);
    expect(isMobileSettingsRestoredPush(next.routes[1]?.params)).toBe(false);
  });

  test("replacing routes drops them and inserts a missing root", () => {
    const next = applyMobileSettingsCollapsePlan(stack(["sources", "directories"]), { keep: 0, push: ["sources"] });
    expect(next.routes.map((route) => route.key ?? "new")).toEqual(["index-1", "new"]);
    const rootless: MobileSettingsStackState = { index: 0, routes: [{ key: "d", name: "[section]", params: { section: "directories" } }] };
    expect(getMobileSettingsStackSections(rootless)).toEqual(["directories"]);
    const rebuilt = applyMobileSettingsCollapsePlan(rootless, { keep: 0, push: ["sources", "directories"] });
    expect(rebuilt.routes.map((route) => route.name)).toEqual(["index", "[section]", "[section]"]);
    expect(rebuilt.index).toBe(2);
  });
});
