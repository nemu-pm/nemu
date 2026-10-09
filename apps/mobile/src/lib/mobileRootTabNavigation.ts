import {
  exactMobileRootTabHrefForPathname,
  isMobileRootTabSelected,
  type MobileRootTabHref,
} from "./mobileRootTabs";

/**
 * Tab-root navigation that never stacks a second copy of a root.
 *
 * Expo Router resolves a link (a `nemu://` deep link, `router.navigate`) with
 * NAVIGATE semantics at every level: a stack whose focused screen is not the
 * target pushes a new one. So `nemu://library` from the reader pushed a whole
 * second `(tabs)` over `[(tabs), sources]` — the Library header drew Back
 * (from the parent stack) and the reader stayed mounted underneath with its
 * native sheets still presented — and `nemu://settings` from a settings
 * section pushed a second settings root.
 *
 * A tab root is a place, not a new screen: dismiss whatever the root stack
 * holds above the tabs, select the tab, and (for deep links) pop the tab's
 * stack back to its root.
 */

export const MOBILE_TABS_ROUTE_NAME = "(tabs)";

type MobileNavigationRoute = {
  key?: string;
  name: string;
  state?: MobileNavigationState;
};

export type MobileNavigationState = {
  key?: string;
  index?: number;
  routes: MobileNavigationRoute[];
  type?: string;
};

const MOBILE_ROOT_TAB_NAMES = new Set(["library", "browse", "search", "settings"]);

function focusedRoute(
  state: MobileNavigationState | undefined,
): MobileNavigationRoute | undefined {
  if (!state || !Array.isArray(state.routes) || state.routes.length === 0) {
    return undefined;
  }
  const index = state.index ?? state.routes.length - 1;
  return state.routes[Math.min(Math.max(index, 0), state.routes.length - 1)];
}

/**
 * The stack that holds the tabs. The container's own root is Expo Router's
 * `__root` slot, so the app's root stack is one (or more) levels down.
 */
function findMobileTabsHostState(
  state: MobileNavigationState | undefined,
): MobileNavigationState | undefined {
  let current = state;
  for (let depth = 0; current && depth < 4; depth += 1) {
    if (current.routes?.some((route) => route.name === MOBILE_TABS_ROUTE_NAME)) {
      return current;
    }
    current = focusedRoute(current)?.state;
  }
  return undefined;
}

function tabNameForHref(href: MobileRootTabHref): string {
  return href.slice(1);
}

/**
 * The tab root a custom-scheme deep link addresses (`nemu://library`,
 * `nemu:///settings`, `nemu://`), or null for anything else — a screen
 * inside a tab, a link carrying a query (OAuth callbacks, dev-client URLs),
 * or a web URL — which keep Expo Router's default handling.
 */
export function mobileRootTabHrefForUrl(url: string): MobileRootTabHref | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  let rest: string;
  const scheme = /^([a-z][a-z0-9+.-]*):(.*)$/i.exec(trimmed);
  if (scheme) {
    const name = scheme[1]!.toLowerCase();
    if (name === "http" || name === "https" || name === "file") return null;
    rest = scheme[2]!;
  } else if (trimmed.startsWith("/")) {
    rest = trimmed;
  } else {
    return null;
  }
  if (/[?#]/.test(rest)) return null;
  const segments = rest
    .split("/")
    .filter(Boolean)
    .filter((segment) => !(segment.startsWith("(") && segment.endsWith(")")));
  return exactMobileRootTabHrefForPathname(`/${segments.join("/")}`);
}

/**
 * The tab currently selected beneath whatever the root stack shows — the
 * tab a manga detail or reader (root-level `sources` routes) was opened
 * from.
 */
export function mobileSelectedRootTabHref(
  rootState: MobileNavigationState | undefined,
): MobileRootTabHref | null {
  const tabsRoute = findMobileTabsHostState(rootState)?.routes.find(
    (route) => route.name === MOBILE_TABS_ROUTE_NAME,
  );
  const tab = focusedRoute(tabsRoute?.state);
  if (!tab) return null;
  if (tab.name === "index") return "/library";
  return MOBILE_ROOT_TAB_NAMES.has(tab.name)
    ? (`/${tab.name}` as MobileRootTabHref)
    : null;
}

/**
 * The floating tab bar's selected tab. Tab screens answer from the path;
 * the root-level `sources` screens (detail, reader) belong to the tab they
 * were opened from, so Search stays selected for a title opened from Search.
 */
export function resolveMobileActiveRootTabHref(
  pathname: string,
  rootState: MobileNavigationState | undefined,
  tabs: readonly MobileRootTabHref[],
): MobileRootTabHref | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] === "sources") {
    return mobileSelectedRootTabHref(rootState) ?? "/browse";
  }
  return tabs.find((href) => isMobileRootTabSelected(pathname, href)) ?? null;
}

export type MobileRootTabNavigationPlan = {
  /** The root stack shows screens above the tabs (detail, reader). */
  dismissAboveTabs: boolean;
  /** A different tab is selected. */
  switchTab: boolean;
  /** The target tab's stack has screens above its root. */
  popTabStack: boolean;
};

export function planMobileRootTabNavigation(
  rootState: MobileNavigationState | undefined,
  href: MobileRootTabHref,
): MobileRootTabNavigationPlan | null {
  const hostState = findMobileTabsHostState(rootState);
  if (!hostState) return null;
  const tabsIndex = hostState.routes.findIndex(
    (route) => route.name === MOBILE_TABS_ROUTE_NAME,
  );
  if (tabsIndex < 0) return null;
  const rootIndex = hostState.index ?? hostState.routes.length - 1;
  const tabsState = hostState.routes[tabsIndex]!.state;
  const target = tabNameForHref(href);
  const selected = mobileSelectedRootTabHref(rootState);
  // No `Array#at`: Android's JSC predates it.
  const targetRoutes = tabsState?.routes?.filter((route) => route.name === target) ?? [];
  const tabStack = targetRoutes[targetRoutes.length - 1]?.state;
  return {
    dismissAboveTabs: rootIndex > tabsIndex,
    switchTab: selected !== href,
    popTabStack: (tabStack?.index ?? 0) > 0,
  };
}

type MobileRootTabRouter = {
  navigate: (href: MobileRootTabHref) => void;
  dismissTo: (href: MobileRootTabHref) => void;
  dismissAll: () => void;
};

type MobileRootNavigationAccess = {
  getRootState: () => MobileNavigationState | undefined;
  /**
   * Runs `listener` once, after the next navigation state change (dropped
   * when no change arrives shortly, so it never fires for a later one).
   */
  onNextState: (listener: () => void) => void;
};

let registeredNavigation: MobileRootNavigationAccess | null = null;

/** Registered by the root layout, which owns the navigation container. */
export function registerMobileRootNavigation(
  access: MobileRootNavigationAccess,
): () => void {
  registeredNavigation = access;
  return () => {
    if (registeredNavigation === access) registeredNavigation = null;
  };
}

/**
 * Opens a tab root. With `popToRoot` (deep links) the tab's own stack also
 * returns to its root; without it (tab bar presses) the tab keeps its
 * history, as a tab bar does. Returns false when the navigation tree is not
 * available yet, so the caller can fall back to the default handling.
 */
export function navigateToMobileRootTab(
  href: MobileRootTabHref,
  {
    popToRoot,
    router,
    navigation = registeredNavigation,
  }: {
    popToRoot: boolean;
    router: MobileRootTabRouter;
    navigation?: MobileRootNavigationAccess | null;
  },
): boolean {
  if (!navigation) return false;
  const plan = planMobileRootTabNavigation(navigation.getRootState(), href);
  if (!plan) return false;

  // POP_TO resolves the levels below the root stack with NAVIGATE semantics,
  // so a tab stack that had screens above its root gains another root copy.
  // Once that lands, pop the (now focused) tab stack to its first screen.
  const popTabStackOnceSettled = () => {
    navigation.onNextState(() => {
      const settled = planMobileRootTabNavigation(navigation.getRootState(), href);
      if (settled && !settled.dismissAboveTabs && !settled.switchTab && settled.popTabStack) {
        router.dismissAll();
      }
    });
  };

  const popAfterward = popToRoot && plan.popTabStack;
  if (plan.dismissAboveTabs) {
    router.dismissTo(href);
    if (popAfterward) popTabStackOnceSettled();
    return true;
  }
  if (plan.switchTab) {
    router.navigate(href);
    if (popAfterward) popTabStackOnceSettled();
    return true;
  }
  if (popToRoot && plan.popTabStack) router.dismissAll();
  return true;
}
