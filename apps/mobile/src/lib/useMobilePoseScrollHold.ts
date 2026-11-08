import { useCallback, useEffect, useRef, useState } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { useMobilePoseTransition } from "@/lib/MobilePoseTransitionContext";
import {
  isMobilePoseMotionWindowOpen,
  MOBILE_POSE_MOTION_WINDOW_MS,
} from "@/lib/mobilePoseLayoutAnimations";
import {
  mobilePoseScrollHoldStart,
  mobilePoseScrollHoldTrim,
  type MobilePoseScrollMetrics,
} from "@/lib/mobilePoseScrollHold";

/**
 * The Library's scroll hold across a pose change (`mobilePoseScrollHold.ts`).
 * Spread `onScroll` / `onContentSizeChange` into the list (compose with its
 * own handlers) and add `paddingBottom` to its content container.
 */
export function useMobilePoseScrollHold() {
  const { changeId } = useMobilePoseTransition();
  const metricsRef = useRef<MobilePoseScrollMetrics>({
    offsetY: 0,
    insetTop: 0,
    insetBottom: 0,
    viewportHeight: 0,
    contentHeight: 0,
  });
  const [hold, setHold] = useState({ changeId, extra: 0 });
  let extra = hold.extra;
  if (hold.changeId !== changeId) {
    // Derived while rendering the change, so the padding is in the very
    // commit that starts re-laying the page out (before any shrink).
    extra = mobilePoseScrollHoldStart(metricsRef.current, hold.extra);
    setHold({ changeId, extra });
  }

  const trim = useCallback(() => {
    if (isMobilePoseMotionWindowOpen()) return;
    setHold((previous) => {
      if (previous.extra <= 0) return previous;
      const next = mobilePoseScrollHoldTrim(metricsRef.current, previous.extra);
      return next < previous.extra - 0.5 ? { ...previous, extra: next } : previous;
    });
  }, []);

  // Trim once the change has settled (the async container re-measure lands
  // inside the motion window).
  const holding = extra > 0;
  useEffect(() => {
    if (!holding) return;
    const timer = setTimeout(trim, MOBILE_POSE_MOTION_WINDOW_MS + 100);
    return () => clearTimeout(timer);
  }, [changeId, holding, trim]);

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentInset, layoutMeasurement, contentSize } = event.nativeEvent;
      const metrics = metricsRef.current;
      metrics.offsetY = contentOffset.y;
      if (contentInset && Number.isFinite(contentInset.top)) metrics.insetTop = contentInset.top;
      if (contentInset && Number.isFinite(contentInset.bottom)) metrics.insetBottom = contentInset.bottom;
      metrics.viewportHeight = layoutMeasurement.height;
      metrics.contentHeight = contentSize.height;
      trim();
    },
    [trim],
  );

  const onContentSizeChange = useCallback(
    (_width: number, height: number) => {
      metricsRef.current.contentHeight = height;
      trim();
    },
    [trim],
  );

  return { paddingBottom: extra, onScroll, onContentSizeChange };
}
