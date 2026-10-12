import type { WindowLayoutRect } from "@/lib/mobileWindowLayout";

type Bounds = { width: number; height: number };
/** Ignore callbacks from the previous display and off-screen navigation frames. */
export function mobileContainerMeasurementIsCurrent(requested: Bounds, current: Bounds, rect: WindowLayoutRect): boolean {
  return requested.width === current.width && requested.height === current.height
    && [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)
    && rect.width > 0 && rect.height >= 0
    && rect.x >= -0.5 && rect.x + rect.width <= current.width + 0.5;
}
