export type MobilePullToRefreshState = {
  disabled?: boolean;
  hasRefreshAction: boolean;
  refreshing: boolean;
};

export function resolveMobilePullToRefreshEnabled({
  disabled = false,
  hasRefreshAction,
  refreshing,
}: MobilePullToRefreshState): boolean {
  if (!hasRefreshAction) return false;
  if (refreshing) return true;
  return !disabled;
}

/**
 * Whether the system refresh indicator shows a page's `refreshing` state.
 *
 * iOS: only for a refresh the person started by pulling. A page scroll view
 * under the see-through header adjusts its insets automatically, and there a
 * programmatic `refreshing` (the library's launch sweep, a background source
 * reload) makes UIKit reveal the spinner by pushing the whole page ~30pt down
 * at rest for as long as the work runs — under the old opaque header the same
 * state never moved the page. Background work keeps its own in-page signals.
 * Android's Material indicator overlays the page without moving it, so it keeps
 * showing every refresh as before.
 */
export function resolveMobilePullToRefreshIndicatorVisible({
  platform,
  refreshing,
  pulledByUser,
}: {
  platform: string;
  refreshing: boolean;
  pulledByUser: boolean;
}): boolean {
  if (!refreshing) return false;
  return platform !== "ios" || pulledByUser;
}
