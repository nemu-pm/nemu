import { describe, expect, test } from "bun:test";
import {
  applyMobileSettingsCollapsePlan,
  completeMobileSettingsRestoredStack,
  getMobileSettingsPageChain,
  getMobileSettingsPrimaryPane,
  getMobileSettingsSplitColumnBackMounts as backMounts,
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
    // Only the top page goes in first: a two-screen push shows the lower one.
    expect(rebuilt.routes).toEqual([
      { name: "index", params: {} },
      { name: "[section]", params: { section: "directories", restored: "1" } },
    ]);
    expect(rebuilt.index).toBe(1);
  });

  test("once in place, the restored top gets its chain beneath it and loses the param", () => {
    const pushed = applyMobileSettingsCollapsePlan(stack([]), { keep: 0, push: ["sources", "directories"] });
    const placed = { ...pushed, routes: pushed.routes.map((route, i) => ({ ...route, key: route.key ?? `new-${i}` })) };
    const done = completeMobileSettingsRestoredStack(placed, "directories");
    expect<unknown>(done?.routes).toEqual([
      { key: "index-1", name: "index", params: {} },
      { name: "[section]", params: { section: "sources" } },
      { key: "new-1", name: "[section]", params: { section: "directories" } },
    ]);
    expect(done?.index).toBe(2);
    // A stack already holding the chain keeps its routes; only the param goes.
    const kept = completeMobileSettingsRestoredStack(
      {
        ...stack(["sources"]),
        index: 2,
        routes: [...stack(["sources"]).routes, { key: "d", name: "[section]", params: { section: "directories", restored: "1" } }],
      },
      "directories",
    );
    expect(kept?.routes.map((route) => route.key)).toEqual(["index-1", "section-0", "d"]);
    expect(kept?.routes[2]?.params).toEqual({ section: "directories" });
    // A section on the root: anything left beneath it goes.
    const appearance = completeMobileSettingsRestoredStack(
      { ...stack(["sources"]), index: 2, routes: [...stack(["sources"]).routes, { key: "a", name: "[section]", params: { section: "appearance", restored: "1" } }] },
      "appearance",
    );
    expect(appearance?.routes.map((route) => route.key)).toEqual(["index-1", "a"]);
    // Not the top: nothing to complete.
    expect(completeMobileSettingsRestoredStack(stack(["sources", "directories"]), "sources")).toBeNull();
  });
});

describe("settings split column back mounts", () => {
  test("with native bar-axis views both bar-row backs stay mounted and the bar picks one", () => {
    for (const placement of ["bar", "column"] as const) {
      expect(backMounts({ placement, axisViews: true })).toEqual({ barItem: true, titleRow: true, pane: false });
    }
  });

  test("without them only the placement's own back is mounted", () => {
    expect(backMounts({ placement: "bar", axisViews: false })).toEqual({ barItem: true, titleRow: false, pane: false });
    expect(backMounts({ placement: "column", axisViews: false })).toEqual({ barItem: false, titleRow: true, pane: false });
  });

  test("the pane back and no page pushed are unchanged", () => {
    for (const axisViews of [true, false]) {
      expect(backMounts({ placement: "pane", axisViews })).toEqual({ barItem: false, titleRow: false, pane: true });
      expect(backMounts({ placement: null, axisViews })).toEqual({ barItem: false, titleRow: false, pane: false });
    }
  });
});

describe("settings split: the Account page is a detail-column section", () => {
  const accountStack = (above: { key?: string; name: string; params?: object }[]): MobileSettingsStackState => ({
    key: "stack-1",
    type: "stack",
    routeNames: ["index", "[section]", "account", "server"],
    index: above.length,
    routes: [{ key: "index-1", name: "index", params: {} }, ...above],
  });

  test("the account route reads as the account section", () => {
    const state = accountStack([{ key: "account-1", name: "account", params: {} }]);
    expect(getMobileSettingsStackSections(state)).toEqual(["account"]);
    expect(isMobileSettingsStackTop(state, "account")).toBe(true);
    // A deep link / a push kept from one column selects Account in the split.
    expect(resolve({ selected: null, routeSection: "account", focus: undefined })).toBe("account");
    expect(getMobileSettingsSplitHighlightedRow("account")).toBe("account");
    expect(getMobileSettingsPrimaryPane("account")).toBe("detail");
  });

  test("split → one column pushes the account route (unanimated), not a [section] route", () => {
    const collapse = plan({ routeSections: [], shown: "account" });
    expect(collapse).toEqual({ keep: 0, push: ["account"] });
    const next = applyMobileSettingsCollapsePlan(accountStack([]), collapse!);
    expect(next.routes).toEqual([
      { key: "index-1", name: "index", params: {} },
      { name: "account", params: { restored: "1" } },
    ]);
    expect(isMobileSettingsRestoredPush(next.routes[1]?.params)).toBe(true);
    // Already on the account route: nothing to do.
    expect(plan({ routeSections: ["account"], shown: "account" })).toBeNull();
    // Another section picked in the split over an account route replaces it.
    expect(plan({ routeSections: ["account"], shown: "reader" })).toEqual({ keep: 0, push: ["reader"] });
  });

  test("once in place the restored account route loses its param, keeping its key", () => {
    const restored = accountStack([{ key: "account-1", name: "account", params: { restored: "1" } }]);
    const done = completeMobileSettingsRestoredStack(restored, "account");
    expect(done?.routes).toEqual([
      { key: "index-1", name: "index", params: {} },
      { key: "account-1", name: "account", params: {} },
    ]);
  });
});
