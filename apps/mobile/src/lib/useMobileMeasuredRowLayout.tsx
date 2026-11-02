import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { View, type LayoutChangeEvent, type LayoutRectangle } from "react-native";
import type { CellRendererProps } from "@react-native/virtualized-lists";
import {
  resolveMobileMeasuredRowLayout,
  type MobileMeasuredRowLayout,
} from "./mobileMeasuredRowLayout";

export type MobileMeasuredRowReport = {
  place: (cellKey: string, index: number) => void;
  layout: (cellKey: string, frame: LayoutRectangle) => void;
  unmount: (cellKey: string) => void;
};

const RowReportContext = createContext<MobileMeasuredRowReport | null>(null);

/** Wraps the list: its cells report their frames through it. */
export const MobileMeasuredRowReportProvider = RowReportContext.Provider;

/** A list cell that reports its frame (and its unmount) to the row layout. */
function MeasuredRowCell<ItemT>({ cellKey, index, onLayout, style, onFocusCapture, children }: CellRendererProps<ItemT>) {
  const report = useContext(RowReportContext);
  useEffect(() => () => report?.unmount(cellKey), [cellKey, report]);
  // Before the list's own effects: a reorder moves a cell's index without
  // necessarily moving its frame.
  useEffect(() => report?.place(cellKey, index), [cellKey, index, report]);
  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      onLayout?.(event);
      report?.layout(cellKey, event.nativeEvent.layout);
    },
    [cellKey, onLayout, report],
  );
  return (
    <View style={style} onFocusCapture={onFocusCapture} onLayout={handleLayout}>
      {children}
    </View>
  );
}

export type MobileMeasuredRowLayoutProps<ItemT> = {
  getItemLayout?: (data: ArrayLike<ItemT> | null | undefined, index: number) => {
    length: number;
    offset: number;
    index: number;
  };
  CellRendererComponent?: ComponentType<CellRendererProps<ItemT>>;
  /** For MobileMeasuredRowReportProvider around the list. */
  report: MobileMeasuredRowReport;
};

/**
 * Exact `getItemLayout` for rows of a few fixed heights (see
 * mobileMeasuredRowLayout): a jump to a row far down the list lands on it at
 * once instead of going through `onScrollToIndexFailed`. `kindOf` names a
 * row's height class; `layoutKey` changes whenever those heights may (width,
 * text size). Off (`enabled` false): the list measures as usual.
 */
// Kept beside the cell component it hands to the list.
// eslint-disable-next-line react-refresh/only-export-components
export function useMobileMeasuredRowLayout<ItemT>({
  data,
  kindOf,
  layoutKey,
  enabled,
}: {
  data: readonly ItemT[] | null | undefined;
  kindOf: ((item: ItemT) => string) | undefined;
  layoutKey: string;
  enabled: boolean;
}): MobileMeasuredRowLayoutProps<ItemT> {
  const active = enabled && kindOf !== undefined;
  const kinds = useMemo(() => (active && data ? data.map((item) => kindOf(item)) : []), [active, data, kindOf]);
  const cellsRef = useRef(new Map<string, { index: number; frame?: LayoutRectangle }>());
  const kindHeightsRef = useRef(new Map<string, number>());
  const layoutRef = useRef<MobileMeasuredRowLayout | null>(null);
  const [exact, setExact] = useState(false);
  const kindsRef = useRef(kinds);
  useLayoutEffect(() => {
    kindsRef.current = kinds;
  }, [kinds]);

  const resolve = useCallback(() => {
    const rows = [];
    for (const { index, frame } of cellsRef.current.values()) {
      if (frame) rows.push({ index, y: frame.y, height: frame.height });
    }
    rows.sort((left, right) => left.index - right.index);
    const layout = resolveMobileMeasuredRowLayout(kindsRef.current, rows, kindHeightsRef.current);
    // The last exact layout stays readable until the list re-renders without
    // it: the list may ask again before then, and must never read zeros.
    if (layout) layoutRef.current = layout;
    setExact(layout !== null);
  }, []);

  // New heights (a width or text size change) re-measure from scratch.
  useEffect(() => {
    kindHeightsRef.current = new Map();
    resolve();
  }, [layoutKey, resolve]);
  useEffect(() => {
    if (active) resolve();
  }, [active, kinds, resolve]);

  const report = useMemo<MobileMeasuredRowReport>(
    () => ({
      place: (cellKey, index) => {
        const cell = cellsRef.current.get(cellKey);
        if (cell) cell.index = index;
        else cellsRef.current.set(cellKey, { index });
      },
      layout: (cellKey, frame) => {
        const cell = cellsRef.current.get(cellKey);
        if (!cell) return;
        cell.frame = frame;
        const kind = kindsRef.current[cell.index];
        if (kind !== undefined) kindHeightsRef.current.set(kind, frame.height);
        resolve();
      },
      unmount: (cellKey) => {
        cellsRef.current.delete(cellKey);
      },
    }),
    [resolve],
  );
  const getItemLayout = useCallback(
    (_data: ArrayLike<ItemT> | null | undefined, index: number) => {
      const layout = layoutRef.current;
      return {
        length: layout?.lengths[index] ?? 0,
        offset: layout?.offsets[index] ?? 0,
        index,
      };
    },
    [],
  );
  return {
    getItemLayout: active && exact ? getItemLayout : undefined,
    CellRendererComponent: active ? (MeasuredRowCell as ComponentType<CellRendererProps<ItemT>>) : undefined,
    report,
  };
}
