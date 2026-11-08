import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import type { MobileMeasuredRow } from "@/lib/mobileMeasuredRowLayout";
import {
  isMobileListAtRest,
  mobileListRowAnchor,
  mobileListRowAnchorOffset,
  type MobileListRowAnchor,
} from "@/lib/mobileListRowAnchor";

type AnchorableList = {
  scrollToOffset: (params: { offset: number; animated?: boolean }) => void;
};

/**
 * How long an anchor keeps being re-applied after the geometry's last change
 * or the anchor row's last layout: a rotation or fold lays the list out more
 * than once (window, then columns, then the bar's inset).
 */
const ANCHOR_SETTLE_MS = 600;

/** When a list at its top is put back at its rest: the bar's inset settles over a fold or rotation. */
const MOBILE_LIST_REST_DELAYS_MS = [0, 120, 320, 600];

/**
 * Keeps the row at the top of a variable-height list there through a change
 * of the list's geometry (`geometryKey`: a rotation, a fold, the hero moving
 * between the list and a column beside it). The row and how far into it the
 * top is are taken from the frames laid out before the change (`rows`), then
 * restored as that row lays out again, and once more as the scroll view
 * reports its new top inset. A list showing its header is left alone, and a
 * drag ends the restore.
 */
export function useMobileListRowAnchor({
  listRef,
  geometryKey,
  rows,
  enabled,
  restAtTop,
}: {
  listRef: RefObject<AnchorableList | null>;
  geometryKey: string;
  rows: () => MobileMeasuredRow[];
  enabled: boolean;
  /** Puts a list that was at its top back there, at the inset it now has. */
  restAtTop?: () => void;
}) {
  const visibleTopRef = useRef<number | null>(null);
  const insetTopRef = useRef(0);
  const pendingRef = useRef<{ anchor: MobileListRowAnchor; appliedInset: number | null } | null>(null);
  const expiryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenKeyRef = useRef(geometryKey);
  const restTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearRest = useCallback(() => {
    restTimersRef.current.forEach(clearTimeout);
    restTimersRef.current = [];
  }, []);
  const clear = useCallback(() => {
    pendingRef.current = null;
    if (expiryRef.current) clearTimeout(expiryRef.current);
    expiryRef.current = null;
  }, []);
  const extend = useCallback(() => {
    if (expiryRef.current) clearTimeout(expiryRef.current);
    expiryRef.current = setTimeout(() => {
      expiryRef.current = null;
      pendingRef.current = null;
    }, ANCHOR_SETTLE_MS);
  }, []);
  useEffect(
    () => () => {
      clear();
      clearRest();
    },
    [clear, clearRest],
  );

  const apply = useCallback(
    (row: Pick<MobileMeasuredRow, "y" | "height">) => {
      const pending = pendingRef.current;
      const list = listRef.current;
      if (!pending || !list) return;
      const insetTop = insetTopRef.current;
      pending.appliedInset = insetTop;
      const offset = mobileListRowAnchorOffset(pending.anchor, row, insetTop);
      // Where the list now rests, should the next change come before a scroll.
      visibleTopRef.current = offset + insetTop;
      list.scrollToOffset({ offset, animated: false });
      extend();
    },
    [extend, listRef],
  );

  // Taken while the frames are still the old geometry's: they report their
  // new places only after this commit lays out.
  useLayoutEffect(() => {
    if (seenKeyRef.current === geometryKey) return;
    seenKeyRef.current = geometryKey;
    if (!enabled) return;
    // A change landing while the last one settles keeps that anchor.
    if (!pendingRef.current) {
      const top = visibleTopRef.current;
      if (restAtTop && isMobileListAtRest(top)) {
        // The bar's inset arrives with the new layout, and UIKit only moves a
        // list to it if the inset behaviour stayed the same.
        clearRest();
        restTimersRef.current = MOBILE_LIST_REST_DELAYS_MS.map((delay) => setTimeout(restAtTop, delay));
        return;
      }
      const anchor = top === null ? null : mobileListRowAnchor(rows(), top);
      if (!anchor) return;
      pendingRef.current = { anchor, appliedInset: null };
    }
    extend();
  }, [clearRest, enabled, extend, geometryKey, restAtTop, rows]);

  const onRowLayout = useCallback(
    (row: MobileMeasuredRow) => {
      if (pendingRef.current?.anchor.index === row.index) apply(row);
    },
    [apply],
  );

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentInset } = event.nativeEvent;
      const insetTop = typeof contentInset?.top === "number" && Number.isFinite(contentInset.top) ? contentInset.top : 0;
      insetTopRef.current = insetTop;
      const pending = pendingRef.current;
      if (pending) {
        // The bar's inset changed after the row was put back: once more at
        // the new inset.
        if (pending.appliedInset !== null && pending.appliedInset !== insetTop) {
          const row = rows().find((candidate) => candidate.index === pending.anchor.index);
          if (row) apply(row);
        }
        return;
      }
      visibleTopRef.current = contentOffset.y + insetTop;
    },
    [apply, rows],
  );

  const onScrollBeginDrag = useCallback(() => {
    clear();
    clearRest();
  }, [clear, clearRest]);

  return { onRowLayout, onScroll, onScrollBeginDrag };
}
