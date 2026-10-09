/**
 * Every tab's stack must keep its root screen (the anchor, `index`) at the
 * bottom. The native header only draws Back when the stack has a screen
 * below the current one, and reselecting the tab pops to the stack's root —
 * so a stack whose root is a pushed screen (source browse, a collection, a
 * settings section) leaves no way back to the tab's root on iOS, including
 * iPhone Duo's vertical bar.
 *
 * Expo Router only seeds the anchor (`unstable_settings.initialRouteName`)
 * for cold deep links and for navigations made `withAnchor`. Anything that
 * creates the tab's stack fresh without it — e.g. the manga screen's
 * fallback `router.replace("/browse/<registry>/<source>")` when it was
 * opened without history, or a push into a tab whose stack is not mounted
 * yet — produces `[pushed screen]` alone. The tab layouts repair that as
 * soon as the stack reports it (see `createMobileTabStackAnchorListeners`).
 */

export const MOBILE_TAB_STACK_ANCHOR = "index";

type AnchorableRoute = {
  key?: string;
  name: string;
  params?: object;
};

export type MobileTabStackState = {
  key?: string;
  index: number;
  routeNames: string[];
  routes: AnchorableRoute[];
  stale?: boolean;
  type?: string;
  [key: string]: unknown;
};

/**
 * The same stack with the anchor inserted beneath its routes, or null when
 * the stack already starts at the anchor (or cannot hold it). The existing
 * routes keep their keys, so the visible screen stays mounted; the anchor has
 * no key and is minted by the router's RESET handler.
 */
export function getAnchoredMobileTabStackState<State extends MobileTabStackState>(
  state: State | undefined,
  anchor: string = MOBILE_TAB_STACK_ANCHOR,
): State | null {
  if (!state || state.type !== undefined && state.type !== "stack") return null;
  if (!Array.isArray(state.routes) || state.routes.length === 0) return null;
  if (!state.routeNames?.includes(anchor)) return null;
  if (state.routes[0]?.name === anchor) return null;
  return {
    ...state,
    index: state.index + 1,
    routes: [{ name: anchor, params: {} }, ...state.routes],
    stale: false,
  };
}

type TabStackNavigation = {
  dispatch: (action: { type: "RESET"; payload: MobileTabStackState }) => void;
};

type TabStackStateEvent = {
  data?: { state?: MobileTabStackState };
};

/**
 * `screenListeners` for a tab's `<Stack>`: the navigator emits `state` to its
 * focused screen's listeners after every change, and a RESET dispatched from
 * that screen's navigation targets this stack.
 */
export function createMobileTabStackAnchorListeners(
  anchor: string = MOBILE_TAB_STACK_ANCHOR,
) {
  return ({ navigation }: { navigation: TabStackNavigation }) => ({
    state: (event: TabStackStateEvent) => {
      const anchored = getAnchoredMobileTabStackState(event.data?.state, anchor);
      if (anchored) navigation.dispatch({ type: "RESET", payload: anchored });
    },
  });
}
