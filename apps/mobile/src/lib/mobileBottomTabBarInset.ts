import { useSyncExternalStore } from "react";

/**
 * The native bottom tab bar's extent from the window's bottom edge, including
 * the bottom safe area, as measured inside a tab (`MobileTabBarInsetReporter`:
 * `UITabBarController` extends its children's bottom safe area by the bar).
 * null until a tab reports. App-wide overlays above the tabs (the toast) read
 * it, since they cannot measure the bar themselves.
 */
let measuredInset: number | null = null;
const listeners = new Set<() => void>();

export function reportMobileBottomTabBarInset(value: number | null | undefined): void {
  const next = typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value * 2) / 2
    : null;
  if (next === null || next === measuredInset) return;
  measuredInset = next;
  for (const listener of listeners) listener();
}

export function getMobileBottomTabBarInset(): number | null {
  return measuredInset;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useMobileBottomTabBarInset(): number | null {
  return useSyncExternalStore(subscribe, getMobileBottomTabBarInset, getMobileBottomTabBarInset);
}

/** Tests only. */
export function resetMobileBottomTabBarInsetForTests(): void {
  measuredInset = null;
}
