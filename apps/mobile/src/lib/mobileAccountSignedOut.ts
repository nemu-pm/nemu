/**
 * Leaving the account pages once there is no account behind them.
 *
 * The Account page (`settings/account`, with its sign-out and delete-account
 * flows) only has a signed-in state: once the session is gone it rendered
 * blank rows, and nothing popped it, so after a sign-out (from the page, a
 * session expiry or a remote sign-out) or an account deletion it stayed on
 * screen. Signed out, the account lives on the Settings root (its Cloud sync
 * card shows the sign-in state), so the Settings stack drops every account
 * page and lands there: `dismissTo("/settings")` after this page's own
 * sign-out (with a "Signed out" toast) or deletion, a stack-only RESET when
 * the session ended by itself.
 */

/**
 * Settings stack routes that belong to the signed-in account flow. Any page
 * pushed from the Account page (e.g. a delete-account details page) goes
 * here too, or above `account` — everything from the first of them up is
 * dropped.
 */
export const MOBILE_ACCOUNT_STACK_ROUTES: readonly string[] = ["account"];

const SETTINGS_ROOT_ROUTE = "index";

type StackRoute = { key?: string; name: string; params?: object };
type StackState = { index: number; routes: StackRoute[]; [key: string]: unknown };

/**
 * Whether the account pages should go now: the session has settled with no
 * user, and no sign-out / deletion of this page is still running (it closes
 * its own sheet and finishes local cleanup first, so the page never pops from
 * under a presented sheet or a pending action).
 */
export function shouldLeaveMobileAccountPages({
  signedIn,
  sessionPending,
  busy,
}: {
  signedIn: boolean;
  sessionPending: boolean;
  busy: boolean;
}): boolean {
  return !signedIn && !sessionPending && !busy;
}

/**
 * The Settings stack without its account pages, as a RESET payload: the
 * routes beneath the first account route keep their keys (so the Settings
 * root stays mounted, not re-created), everything from it up is dropped.
 * Null when the stack holds no account page (already left: idempotent).
 */
export function getMobileSettingsStackWithoutAccountPages<State extends StackState>(
  state: State | undefined,
  accountRoutes: readonly string[] = MOBILE_ACCOUNT_STACK_ROUTES,
): State | null {
  if (!state || !Array.isArray(state.routes)) return null;
  const first = state.routes.findIndex((route) => accountRoutes.includes(route.name));
  if (first < 0) return null;
  const kept = state.routes.slice(0, first);
  const routes = kept.length > 0 ? kept : [{ name: SETTINGS_ROOT_ROUTE, params: {} }];
  return { ...state, index: routes.length - 1, routes, stale: false };
}

type AccountStackNavigation = {
  getState: () => StackState | undefined;
  dispatch: (action: { type: "RESET"; payload: StackState }) => void;
};

/**
 * Drops the account pages from the stack the given navigation belongs to (the
 * Settings stack, from the account screen). A RESET of that stack only, so a
 * remote sign-out while another tab is showing does not switch tabs.
 */
export function leaveMobileAccountPages(navigation: AccountStackNavigation): boolean {
  const next = getMobileSettingsStackWithoutAccountPages(navigation.getState());
  if (!next) return false;
  navigation.dispatch({ type: "RESET", payload: next });
  return true;
}

/**
 * Why the account pages go:
 * - `signedOut`: this page's sign-out succeeded;
 * - `deleted`: this page's account deletion succeeded;
 * - `sessionEnded`: the session went away on its own (expiry, a remote
 *   sign-out) or a sign-out ended it but failed its local cleanup.
 */
export type MobileAccountLeaveReason = "signedOut" | "deleted" | "sessionEnded";

export type MobileAccountLeavePlan = {
  /**
   * `dismissToSettings`: the user acted here, Settings is on screen —
   * `router.dismissTo("/settings")`, as the route guard does. `resetStack`:
   * nobody asked; only the Settings stack drops its account pages, without
   * bringing the Settings tab forward.
   */
  navigation: "dismissToSettings" | "resetStack";
  /** The sign-out success toast; deletion shows its own (cleanup-aware) one. */
  toast: "signedOut" | null;
};

export function planMobileAccountLeave(reason: MobileAccountLeaveReason): MobileAccountLeavePlan {
  switch (reason) {
    case "signedOut":
      return { navigation: "dismissToSettings", toast: "signedOut" };
    case "deleted":
      return { navigation: "dismissToSettings", toast: null };
    default:
      return { navigation: "resetStack", toast: null };
  }
}

/**
 * One leave per account page: the first reason wins, so a sign-out that ends
 * the session (its own leave, then the session effect) or a deletion (its
 * leave, then its local sign-out's session change) navigates and toasts once.
 */
export function createMobileAccountLeave({
  dismissToSettings,
  resetStack,
  showSignedOutToast,
}: {
  dismissToSettings: () => void;
  resetStack: () => void;
  showSignedOutToast: () => void;
}) {
  let left = false;
  return (reason: MobileAccountLeaveReason): boolean => {
    if (left) return false;
    left = true;
    const plan = planMobileAccountLeave(reason);
    if (plan.navigation === "dismissToSettings") dismissToSettings();
    else resetStack();
    if (plan.toast === "signedOut") showSignedOutToast();
    return true;
  };
}
