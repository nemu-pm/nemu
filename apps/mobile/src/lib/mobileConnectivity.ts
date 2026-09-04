/**
 * Pure connectivity classification for reconnect-retry behavior.
 *
 * expo-network reports `isConnected`/`isInternetReachable` as optional
 * booleans; either can be missing while the platform is still probing.
 * Retries fire only on an explicit offline → online transition so an
 * "unknown" probe never triggers spurious reloads.
 */
export type MobileConnectivityStatus = "online" | "offline" | "unknown";

export function classifyMobileNetworkState(state: {
  isConnected?: boolean;
  isInternetReachable?: boolean;
}): MobileConnectivityStatus {
  if (state.isConnected === false || state.isInternetReachable === false) {
    return "offline";
  }
  if (state.isConnected === true) return "online";
  return "unknown";
}

export function shouldRetryAfterMobileConnectivityChange({
  previous,
  next,
}: {
  previous: MobileConnectivityStatus | null;
  next: MobileConnectivityStatus;
}): boolean {
  return previous === "offline" && next === "online";
}
