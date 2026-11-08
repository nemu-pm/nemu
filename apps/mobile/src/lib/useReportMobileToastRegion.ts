import { useEffect } from "react";
import { useIsFocused } from "expo-router";
import {
  setMobileToastObstacle,
  setMobileToastRegion,
  type MobileToastObstacle,
  type MobileToastRegion,
} from "@/lib/mobileToastRegion";

/** Publishes `region` while the calling screen is focused; null publishes nothing. */
export function useReportMobileToastRegion(region: MobileToastRegion | null): void {
  const focused = useIsFocused();
  const x = region?.x;
  const width = region?.width;
  const top = region?.top;
  useEffect(() => {
    if (!focused || x === undefined || width === undefined) return;
    const key = Symbol("mobile-toast-region");
    setMobileToastRegion(key, top === undefined ? { x, width } : { x, width, top });
    return () => setMobileToastRegion(key, null);
  }, [focused, x, width, top]);
}

/** Publishes `obstacle` while the calling screen is focused; null publishes nothing. */
export function useReportMobileToastObstacle(obstacle: MobileToastObstacle | null): void {
  const focused = useIsFocused();
  const left = obstacle?.left;
  const right = obstacle?.right;
  const top = obstacle?.top;
  const bottom = obstacle?.bottom;
  const anchorTop = obstacle?.anchorTop;
  useEffect(() => {
    if (
      !focused ||
      left === undefined ||
      right === undefined ||
      top === undefined ||
      bottom === undefined ||
      anchorTop === undefined
    ) {
      return;
    }
    const key = Symbol("mobile-toast-obstacle");
    setMobileToastObstacle(key, { left, right, top, bottom, anchorTop });
    return () => setMobileToastObstacle(key, null);
  }, [focused, left, right, top, bottom, anchorTop]);
}
