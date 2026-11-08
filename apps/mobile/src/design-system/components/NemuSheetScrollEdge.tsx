import { useMemo, type ReactNode } from "react";
import {
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { ScrollEdgeElement } from "../../../modules/nemu-window-layout";

/** How far the top edge's marker reaches into the body (pt). */
const SHEET_SCROLL_EDGE_HEIGHT = 16;

export type NemuSheetScrollEdgeProps = {
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollEventThrottle?: number;
};

/**
 * The soft top edge of a scrolling body in an RN-drawn sheet: the sheet's header
 * sits above the body, not over it, so no bar forms UIKit's edge effect there.
 * An empty `ScrollEdgeElement` along the body's top does, once the body has
 * scrolled (at rest the first row stays sharp). The child spreads the props it is
 * given onto its scroll view:
 *
 *   <NemuSheetScrollEdge>{(edge) => <FlatList {...edge} … />}</NemuSheetScrollEdge>
 */
export function NemuSheetScrollEdge({
  children,
  onScroll,
  style,
}: {
  children: (edge: NemuSheetScrollEdgeProps) => ReactNode;
  /** The body's own scroll handler, still called. */
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  /** The wrapper's size: the scroll view's own (default: fills the body). */
  style?: StyleProp<ViewStyle>;
}) {
  const edge = useMemo(() => (onScroll ? { onScroll, scrollEventThrottle: 16 } : {}), [onScroll]);
  if (!ScrollEdgeElement) return <>{children(edge)}</>;
  return (
    <View style={style ?? styles.surface}>
      {children(edge)}
      <ScrollEdgeElement edge="top" revealPastRest pointerEvents="none" style={styles.edge} />
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    flex: 1,
  },
  edge: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: SHEET_SCROLL_EDGE_HEIGHT,
  },
});
