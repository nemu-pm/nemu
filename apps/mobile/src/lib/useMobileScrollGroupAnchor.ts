import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";

type Measurable = {
  measureInWindow?: (callback: (x: number, y: number, width: number, height: number) => void) => void;
};
type Scrollable = Measurable & {
  scrollTo?: (options: { x?: number; y?: number; animated?: boolean }) => void;
  getNativeScrollRef?: () => Measurable | null | undefined;
};

/** Window-coordinate frame of a group, for picking the first visible one. */
export type MobileScrollGroupFrame = { key: string; x: number; top: number; bottom: number };

/**
 * The group being looked at: the topmost one (leading column first) still
 * showing below the viewport's top edge, and its distance from that edge.
 * Null at rest at the top (the page then simply stays at its top).
 */
export function pickMobileScrollGroupAnchor(
  frames: readonly MobileScrollGroupFrame[],
  viewportTop: number,
  atTop: boolean,
): { key: string; offset: number } | null {
  if (atTop) return null;
  let best: MobileScrollGroupFrame | null = null;
  for (const frame of frames) {
    if (frame.bottom <= viewportTop + 1) continue;
    if (
      !best
      || frame.top < best.top - 0.5
      || (Math.abs(frame.top - best.top) <= 0.5 && frame.x < best.x)
    ) {
      best = frame;
    }
  }
  return best ? { key: best.key, offset: best.top - viewportTop } : null;
}

/** How far to scroll so the anchored group is back at its distance from the viewport top. */
export function mobileScrollGroupAnchorDelta(
  anchor: { offset: number },
  groupTop: number,
  viewportTop: number,
): number {
  return groupTop - viewportTop - anchor.offset;
}

/** Re-measure once the container's async fold measurement has settled (useMobileContainerFold: 450 ms). */
const SETTLE_RESTORE_MS = 500;
/** A scroll this long at rest is the user's position (rotation clamps fire inside it). */
const CAPTURE_IDLE_MS = 160;

/**
 * Keeps the first visible group of a plain (non-virtualized) ScrollView page
 * at the same distance from the viewport's top across a re-layout that moves
 * the groups (Sources: one column ⇄ one column per pane on rotation),
 * as `useMobileGridScrollAnchor` does for the virtualized grids.
 *
 * Register every group with `groupRef(key)`, pass the page's scroll view,
 * call `onScroll` from it, and change `layoutKey` whenever the arrangement
 * changes (window size, column count). Nothing remounts: the page is moved
 * by the difference, without animation, right after the new layout commits
 * and once more after it settles.
 */
export function useMobileScrollGroupAnchor({
  scrollRef,
  layoutKey,
}: {
  scrollRef: { current: Scrollable | null };
  layoutKey: string;
}) {
  const nodesRef = useRef(new Map<string, Measurable>());
  const callbacksRef = useRef(new Map<string, (node: Measurable | null) => void>());
  const scrollYRef = useRef(0);
  const insetTopRef = useRef(0);
  const anchorRef = useRef<{ key: string; offset: number } | null>(null);
  const restoringUntilRef = useRef(0);
  const captureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenKeyRef = useRef(layoutKey);

  const groupRef = useCallback((key: string) => {
    let callback = callbacksRef.current.get(key);
    if (!callback) {
      callback = (node: Measurable | null) => {
        if (node) nodesRef.current.set(key, node);
        else nodesRef.current.delete(key);
      };
      callbacksRef.current.set(key, callback);
    }
    return callback;
  }, []);

  const measureViewportTop = useCallback((done: (top: number) => void) => {
    const scroll = scrollRef.current;
    const host: Measurable | null | undefined = scroll?.measureInWindow ? scroll : scroll?.getNativeScrollRef?.();
    if (!host?.measureInWindow) return;
    host.measureInWindow((_x, y) => done(y + insetTopRef.current));
  }, [scrollRef]);

  const capture = useCallback(() => {
    if (Date.now() < restoringUntilRef.current) return;
    const atTop = scrollYRef.current + insetTopRef.current <= 1;
    if (atTop) {
      anchorRef.current = null;
      return;
    }
    measureViewportTop((viewportTop) => {
      const entries = [...nodesRef.current.entries()];
      const frames: MobileScrollGroupFrame[] = [];
      let pending = entries.length;
      if (!pending) return;
      for (const [key, node] of entries) {
        if (!node.measureInWindow) {
          pending -= 1;
          continue;
        }
        node.measureInWindow((x, y, _width, height) => {
          frames.push({ key, x, top: y, bottom: y + height });
          pending -= 1;
          if (pending === 0 && Date.now() >= restoringUntilRef.current) {
            anchorRef.current = pickMobileScrollGroupAnchor(frames, viewportTop, false) ?? anchorRef.current;
          }
        });
      }
    });
  }, [measureViewportTop]);

  const restore = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const node = nodesRef.current.get(anchor.key);
    if (!node?.measureInWindow) return;
    measureViewportTop((viewportTop) => {
      node.measureInWindow?.((_x, y) => {
        const delta = mobileScrollGroupAnchorDelta(anchor, y, viewportTop);
        if (Math.abs(delta) < 0.5) return;
        const next = Math.max(-insetTopRef.current, scrollYRef.current + delta);
        scrollYRef.current = next;
        scrollRef.current?.scrollTo?.({ y: next, animated: false });
      });
    });
  }, [measureViewportTop, scrollRef]);

  useLayoutEffect(() => {
    if (seenKeyRef.current === layoutKey) return;
    seenKeyRef.current = layoutKey;
    // No capture until the new arrangement has settled: the scroll events of
    // the transition (an offset clamped to the new content) are not the user's.
    restoringUntilRef.current = Date.now() + SETTLE_RESTORE_MS + 100;
    if (captureTimerRef.current) clearTimeout(captureTimerRef.current);
    const frame = requestAnimationFrame(restore);
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = setTimeout(restore, SETTLE_RESTORE_MS);
    return () => cancelAnimationFrame(frame);
  }, [layoutKey, restore]);

  useEffect(() => () => {
    if (captureTimerRef.current) clearTimeout(captureTimerRef.current);
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
  }, []);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentInset } = event.nativeEvent;
    scrollYRef.current = contentOffset.y;
    const top = contentInset?.top;
    if (typeof top === "number" && Number.isFinite(top)) insetTopRef.current = top;
    if (Date.now() < restoringUntilRef.current) return;
    if (captureTimerRef.current) clearTimeout(captureTimerRef.current);
    captureTimerRef.current = setTimeout(capture, CAPTURE_IDLE_MS);
  }, [capture]);

  return { groupRef, onScroll };
}
