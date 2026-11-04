import { useEffect } from "react";
import { useIsFocused } from "expo-router";
import { setMobileToastRegion, type MobileToastRegion } from "@/lib/mobileToastRegion";

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
