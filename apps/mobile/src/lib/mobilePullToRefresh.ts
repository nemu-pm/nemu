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
