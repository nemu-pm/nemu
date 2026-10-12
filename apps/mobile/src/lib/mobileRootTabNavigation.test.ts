import { describe, expect, test } from "bun:test";
import {
  mobileRootTabHrefForUrl,
  mobileSelectedRootTabHref,
  navigateToMobileRootTab,
  planMobileRootTabNavigation,
  resolveMobileActiveRootTabHref,
  type MobileNavigationState,
} from "./mobileRootTabNavigation";
import type { MobileRootTabHref } from "./mobileRootTabs";

const TABS: MobileRootTabHref[] = ["/library", "/browse", "/search", "/settings"];

function stack(names: string[], nested: Record<string, MobileNavigationState> = {}): MobileNavigationState {
  return {
    type: "stack",
    index: names.length - 1,
    routes: names.map((name) => ({ name, state: nested[name] })),
  };
}

function tabs(
  selected: string,
  stacks: Record<string, string[]> = {},
): MobileNavigationState {
  const names = ["library", "browse", "search", "settings"];
  return {
    type: "tab",
    index: names.indexOf(selected),
    routes: names.map((name) => ({
      name,
      state: stacks[name] ? stack(stacks[name]) : undefined,
    })),
  };
}

/** The container's tree: Expo Router's `__root` slot around the app's root stack. */
function root(
  tabsState: MobileNavigationState,
  above: MobileNavigationState[] = [],
): MobileNavigationState {
  return {
    index: 0,
    routes: [
      {
        name: "__root",
        state: {
          type: "stack",
          index: above.length,
          routes: [
            { name: "(tabs)", state: tabsState },
            ...above.map((state) => ({ name: "sources", state })),
          ],
        },
      },
    ],
  };
}

describe("mobileRootTabHrefForUrl", () => {
  test("reads tab roots from custom-scheme links", () => {
    expect(mobileRootTabHrefForUrl("nemu://library")).toBe("/library");
    expect(mobileRootTabHrefForUrl("nemu:///settings")).toBe("/settings");
    expect(mobileRootTabHrefForUrl("nemu://search/")).toBe("/search");
    expect(mobileRootTabHrefForUrl("nemu://(tabs)/browse")).toBe("/browse");
    expect(mobileRootTabHrefForUrl("nemu://")).toBe("/library");
    expect(mobileRootTabHrefForUrl("/settings")).toBe("/settings");
  });

  test("leaves every other link to the default handling", () => {
    expect(mobileRootTabHrefForUrl("nemu://settings/data")).toBeNull();
    expect(mobileRootTabHrefForUrl("nemu://library/abc")).toBeNull();
    expect(mobileRootTabHrefForUrl("nemu://sources/r/s/m/c")).toBeNull();
    expect(mobileRootTabHrefForUrl("nemu://oauth/callback?code=1")).toBeNull();
    expect(mobileRootTabHrefForUrl("nemu://library?refresh=1")).toBeNull();
    expect(mobileRootTabHrefForUrl("https://nemu.pm/library")).toBeNull();
    expect(mobileRootTabHrefForUrl("")).toBeNull();
  });
});

describe("selected tab beneath the root stack", () => {
  test("follows the tabs route, not the pathname", () => {
    const state = root(tabs("search", { search: ["index"] }), [stack(["[mangaId]"])]);
    expect(mobileSelectedRootTabHref(state)).toBe("/search");
    expect(
      resolveMobileActiveRootTabHref("/sources/r/s/m", state, TABS),
    ).toBe("/search");
  });

  test("tab screens still answer from the path", () => {
    const state = root(tabs("settings"));
    expect(resolveMobileActiveRootTabHref("/settings/data", state, TABS)).toBe(
      "/settings",
    );
  });

  test("falls back to Browse for a source screen without tab state", () => {
    expect(resolveMobileActiveRootTabHref("/sources/r/s/m", undefined, TABS)).toBe(
      "/browse",
    );
  });
});

describe("planMobileRootTabNavigation", () => {
  test("from the reader: dismiss above the tabs", () => {
    const state = root(tabs("library", { library: ["index"] }), [
      stack(["[mangaId]", "[chapterId]"]),
    ]);
    expect(planMobileRootTabNavigation(state, "/library")).toEqual({
      dismissAboveTabs: true,
      switchTab: false,
      popTabStack: false,
    });
  });

  test("a settings section: pop the settings stack", () => {
    const state = root(tabs("settings", { settings: ["index", "[section]"] }));
    expect(planMobileRootTabNavigation(state, "/settings")).toEqual({
      dismissAboveTabs: false,
      switchTab: false,
      popTabStack: true,
    });
  });

  test("another tab: switch", () => {
    const state = root(tabs("browse", { library: ["index"] }));
    expect(planMobileRootTabNavigation(state, "/library")).toEqual({
      dismissAboveTabs: false,
      switchTab: true,
      popTabStack: false,
    });
  });

  test("unknown tree: no plan", () => {
    expect(planMobileRootTabNavigation(undefined, "/library")).toBeNull();
    expect(
      planMobileRootTabNavigation(stack(["+not-found"]), "/library"),
    ).toBeNull();
  });
});

describe("navigateToMobileRootTab", () => {
  function harness(initial: MobileNavigationState) {
    let current = initial;
    const calls: string[] = [];
    const pending: (() => void)[] = [];
    const router = {
      navigate: (href: string) => calls.push(`navigate ${href}`),
      dismissTo: (href: string) => calls.push(`dismissTo ${href}`),
      dismissAll: () => calls.push("dismissAll"),
    };
    const navigation = {
      getRootState: () => current,
      onNextState: (listener: () => void) => pending.push(listener),
    };
    return {
      calls,
      router,
      navigation,
      settle(next: MobileNavigationState) {
        current = next;
        pending.splice(0).forEach((listener) => listener());
      },
    };
  }

  test("deep link from the reader returns to the tab root, never a second copy", () => {
    const h = harness(
      root(tabs("library", { library: ["index"] }), [stack(["[mangaId]", "[chapterId]"])]),
    );
    expect(
      navigateToMobileRootTab("/library", { popToRoot: true, router: h.router, navigation: h.navigation }),
    ).toBe(true);
    expect(h.calls).toEqual(["dismissTo /library"]);
  });

  test("deep link pops a tab stack re-rooted by the dismissal", () => {
    const h = harness(
      root(tabs("library", { library: ["index", "collection/[id]"] }), [stack(["[mangaId]"])]),
    );
    navigateToMobileRootTab("/library", { popToRoot: true, router: h.router, navigation: h.navigation });
    // The nested NAVIGATE pushed another root on top of the collection.
    h.settle(root(tabs("library", { library: ["index", "collection/[id]", "index"] })));
    expect(h.calls).toEqual(["dismissTo /library", "dismissAll"]);
  });

  test("deep link to the current tab's root pops its stack", () => {
    const h = harness(root(tabs("settings", { settings: ["index", "[section]"] })));
    navigateToMobileRootTab("/settings", { popToRoot: true, router: h.router, navigation: h.navigation });
    expect(h.calls).toEqual(["dismissAll"]);
  });

  test("deep link to the root already shown does nothing", () => {
    const h = harness(root(tabs("settings", { settings: ["index"] })));
    navigateToMobileRootTab("/settings", { popToRoot: true, router: h.router, navigation: h.navigation });
    expect(h.calls).toEqual([]);
  });

  test("tab bar from a detail closes it and keeps the tab's history", () => {
    const h = harness(
      root(tabs("search", { search: ["index"], browse: ["index", "[registryId]/[sourceId]"] }), [
        stack(["[mangaId]"]),
      ]),
    );
    navigateToMobileRootTab("/browse", { popToRoot: false, router: h.router, navigation: h.navigation });
    h.settle(root(tabs("browse", { browse: ["index", "[registryId]/[sourceId]"] })));
    expect(h.calls).toEqual(["dismissTo /browse"]);
  });

  test("without a registered navigation tree the caller falls back", () => {
    const calls: string[] = [];
    expect(
      navigateToMobileRootTab("/library", {
        popToRoot: true,
        router: {
          navigate: () => calls.push("navigate"),
          dismissTo: () => calls.push("dismissTo"),
          dismissAll: () => calls.push("dismissAll"),
        },
        navigation: null,
      }),
    ).toBe(false);
    expect(calls).toEqual([]);
  });
});
