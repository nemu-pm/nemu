import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import {
  mobileGridAnchorFallbackOffset,
  mobileGridAnchorLayoutKey,
  mobileGridAnchorRestoreRow,
  mobileGridFirstVisibleIndex,
  type MobileGridViewToken,
} from "@/lib/mobileGridScrollAnchor";

type AnchorableList = {
  scrollToIndex: (params: {
    index: number;
    animated?: boolean;
    viewOffset?: number;
    viewPosition?: number;
  }) => void;
  scrollToOffset: (params: { offset: number; animated?: boolean }) => void;
};

type ScrollToIndexFailedInfo = {
  index: number;
  highestMeasuredFrameIndex: number;
  averageItemLength: number;
};

const MAX_RETRIES = 3;
const RETRY_MS = 50;
/** An item counts as "the one being looked at" once half of it is on screen. */
const VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 50 } as const;

/**
 * Keeps a virtualized grid's first visible item at the top of the viewport
 * across a column-count or cell-size change (outer ⇄ inner display, rotation,
 * folding). Works for a remount (new `numColumns` ⇒ new `key`) and for an
 * in-place re-layout.
 *
 * Spread the returned handlers onto the FlatList (compose with your own
 * `onScroll` / `onContentSizeChange`). `onViewableItemsChanged` and
 * `viewabilityConfig` are stable, as FlatList requires.
 */
export function useMobileGridScrollAnchor({
  listRef,
  columns,
  itemWidth,
  itemCount,
}: {
  listRef: RefObject<AnchorableList | null>;
  columns: number;
  itemWidth: number;
  itemCount: number;
}) {
  const layoutKey = mobileGridAnchorLayoutKey({ columns, itemWidth });
  const anchorRef = useRef<number | null>(null);
  const insetTopRef = useRef(0);
  const pendingRowRef = useRef<number | null>(null);
  const retriesRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenKeyRef = useRef(layoutKey);

  const tryRestore = useCallback(() => {
    const row = pendingRowRef.current;
    const list = listRef.current;
    if (row === null || !list) return;
    try {
      list.scrollToIndex({ index: row, animated: false, viewPosition: 0, viewOffset: insetTopRef.current });
      // Success is only certain when no failure callback follows; a failure
      // re-arms the row below.
      pendingRowRef.current = null;
    } catch {
      pendingRowRef.current = null;
    }
  }, [listRef]);

  useLayoutEffect(() => {
    if (seenKeyRef.current === layoutKey) return;
    seenKeyRef.current = layoutKey;
    pendingRowRef.current = mobileGridAnchorRestoreRow({
      anchorIndex: anchorRef.current,
      columns,
      itemCount,
    });
    retriesRef.current = 0;
    // An in-place re-layout may not change the content size again; a
    // remounted list restores from `onContentSizeChange` instead.
    const frame = requestAnimationFrame(tryRestore);
    return () => cancelAnimationFrame(frame);
  }, [columns, itemCount, layoutKey, tryRestore]);

  useEffect(() => () => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
  }, []);

  // Created once: FlatList throws if `onViewableItemsChanged` changes.
  const [onViewableItemsChanged] = useState(
    () => ({ viewableItems }: { viewableItems: MobileGridViewToken[] }) => {
      const first = mobileGridFirstVisibleIndex(viewableItems);
      if (first !== null) anchorRef.current = first;
    },
  );

  const onScrollToIndexFailed = useCallback(
    (info: ScrollToIndexFailedInfo) => {
      const list = listRef.current;
      if (!list) return;
      list.scrollToOffset({
        offset: mobileGridAnchorFallbackOffset({
          row: info.index,
          averageRowLength: info.averageItemLength,
          insetTop: insetTopRef.current,
        }),
        animated: false,
      });
      if (retriesRef.current >= MAX_RETRIES) return;
      retriesRef.current += 1;
      pendingRowRef.current = info.index;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      retryTimerRef.current = setTimeout(tryRestore, RETRY_MS);
    },
    [listRef, tryRestore],
  );

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const top = event.nativeEvent.contentInset?.top;
    if (typeof top === "number" && Number.isFinite(top)) insetTopRef.current = top;
  }, []);

  return {
    onViewableItemsChanged,
    viewabilityConfig: VIEWABILITY_CONFIG,
    onScrollToIndexFailed,
    /** Call from the list's `onContentSizeChange`. */
    onContentSizeChange: tryRestore,
    /** Call from the list's `onScroll` (tracks the adjusted top inset). */
    onScroll,
  };
}
