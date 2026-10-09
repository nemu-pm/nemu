import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { type LayoutChangeEvent } from "react-native";
import { mobileFoldSplitForContainer } from "@/lib/mobileAdaptiveLayout";
import { useMobileAdaptiveLayout } from "@/lib/MobileWindowLayoutContext";
import type { WindowLayoutRect } from "@/lib/mobileWindowLayout";

type MeasurableNode = {
  measureInWindow?: (callback: (x: number, y: number, width: number, height: number) => void) => void;
};

/** Screen transitions animate the container; settle measurements after them. */
const SETTLE_REMEASURE_MS = 450;

function sameRect(a: WindowLayoutRect | null, b: WindowLayoutRect) {
  return !!a
    && Math.abs(a.x - b.x) < 0.5
    && Math.abs(a.y - b.y) < 0.5
    && Math.abs(a.width - b.width) < 0.5
    && Math.abs(a.height - b.height) < 0.5;
}

/**
 * Where the app-wide active fold crosses one container. Attach `ref` (or pass
 * `getNode` for components such as FlatList whose host view is internal) and
 * call `onLayout` from the container's layout callback. Measurement runs in
 * window coordinates — the container may be narrower than the window (Duo's
 * trailing system bars, split panes) and offset from it.
 *
 * `rect` is only trusted while it lies inside the window: a push transition
 * measures the incoming screen off-screen, so it is measured again once the
 * transition settles.
 *
 * `split` is the ACTIVE fold only (reserved: nothing may rest on it).
 */
export function useMobileContainerFold<T extends MeasurableNode = MeasurableNode>(
  getNode?: () => MeasurableNode | null | undefined,
) {
  const adaptive = useMobileAdaptiveLayout();
  const ref = useRef<T | null>(null);
  const getNodeRef = useRef(getNode);
  const [rect, setRect] = useState<WindowLayoutRect | null>(null);
  const [width, setWidth] = useState<number | null>(null);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const windowRef = useRef({ width: adaptive.width, height: adaptive.height });
  // Latest values for the measure callback, without re-creating it.
  useLayoutEffect(() => {
    getNodeRef.current = getNode;
    windowRef.current = { width: adaptive.width, height: adaptive.height };
  });

  const measure = useCallback(() => {
    const node = getNodeRef.current ? getNodeRef.current() : ref.current;
    node?.measureInWindow?.((x, y, measuredWidth, measuredHeight) => {
      if (![x, y, measuredWidth, measuredHeight].every(Number.isFinite) || measuredWidth <= 0) return;
      const bounds = windowRef.current;
      // Off-window (mid-transition) geometry would misplace the fold.
      if (x < -0.5 || x + measuredWidth > bounds.width + 0.5) return;
      const next = { x, y, width: measuredWidth, height: measuredHeight };
      setRect((previous) => (sameRect(previous, next) ? previous : next));
    });
  }, []);

  const scheduleMeasure = useCallback(() => {
    measure();
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = setTimeout(measure, SETTLE_REMEASURE_MS);
  }, [measure]);

  const onLayout = useCallback(
    (event?: LayoutChangeEvent) => {
      const nextWidth = event?.nativeEvent.layout.width;
      if (typeof nextWidth === "number" && nextWidth > 0) {
        setWidth((previous) => (previous !== null && Math.abs(previous - nextWidth) < 0.5 ? previous : nextWidth));
      }
      scheduleMeasure();
    },
    [scheduleMeasure],
  );

  // Folding changes reserved regions without resizing the window, so no
  // layout event fires; measure again whenever the posture or fold moves.
  const foldKey = adaptive.fold
    ? `${adaptive.posture}:${adaptive.fold.x}:${adaptive.fold.y}:${adaptive.fold.width}:${adaptive.fold.height}`
    : "flat";
  useEffect(() => {
    scheduleMeasure();
  }, [foldKey, scheduleMeasure]);

  useEffect(() => () => {
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
  }, []);

  const split = useMemo(
    () => (rect ? mobileFoldSplitForContainer(adaptive, rect) : null),
    [adaptive, rect],
  );
  return {
    ref,
    onLayout,
    measure,
    rect,
    width: width ?? rect?.width ?? null,
    split,
    adaptive,
  };
}
