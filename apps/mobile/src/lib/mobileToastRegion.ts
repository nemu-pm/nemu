import { useSyncExternalStore } from "react";

/**
 * Where the focused screen wants the app-wide toast (`MobileToastProvider`),
 * which sits above every route and cannot see their layout:
 * - `x`/`width`: the window x-range of the screen's main column (a split's
 *   trailing pane, the reader's page pane);
 * - `top`: anchor below this window y instead of at the bottom (the reader,
 *   whose bottom HUD would cover a bottom toast).
 */
export type MobileToastRegion = {
  x: number;
  width: number;
  top?: number;
};

/**
 * A control on the focused screen a bottom toast must not cover (window
 * coordinates), and the window y to anchor the toast at when it would.
 */
export type MobileToastObstacle = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  anchorTop: number;
};

// Publishers in mount order; the newest focused one wins (a pushed screen
// mounts and focuses after the one beneath it).
const regions = new Map<symbol, MobileToastRegion>();
let current: MobileToastRegion | null = null;
const listeners = new Set<() => void>();

function publish(): void {
  const last = [...regions.values()].at(-1) ?? null;
  if (last === current) return;
  current = last;
  for (const listener of listeners) listener();
}

export function setMobileToastRegion(key: symbol, region: MobileToastRegion | null): void {
  if (region) regions.set(key, region);
  else regions.delete(key);
  publish();
}

export function getMobileToastRegion(): MobileToastRegion | null {
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useMobileToastRegion(): MobileToastRegion | null {
  return useSyncExternalStore(subscribe, getMobileToastRegion, getMobileToastRegion);
}

const obstacles = new Map<symbol, MobileToastObstacle>();
let currentObstacle: MobileToastObstacle | null = null;

export function setMobileToastObstacle(key: symbol, obstacle: MobileToastObstacle | null): void {
  if (obstacle) obstacles.set(key, obstacle);
  else obstacles.delete(key);
  const last = [...obstacles.values()].at(-1) ?? null;
  if (last === currentObstacle) return;
  currentObstacle = last;
  for (const listener of listeners) listener();
}

export function getMobileToastObstacle(): MobileToastObstacle | null {
  return currentObstacle;
}

export function useMobileToastObstacle(): MobileToastObstacle | null {
  return useSyncExternalStore(subscribe, getMobileToastObstacle, getMobileToastObstacle);
}

/** Tests only. */
export function resetMobileToastRegionForTests(): void {
  regions.clear();
  current = null;
  obstacles.clear();
  currentObstacle = null;
}
