import { StyleSheet } from "react-native";
import { ScrollEdgeElement } from "../../../modules/nemu-window-layout";

/** How far each end's marker reaches into the row (pt). */
const HORIZONTAL_SCROLL_EDGE_WIDTH = 22;

/** Native soft row ends here (iOS 26 binaries): else the caller keeps its own fade. */
export const nemuHorizontalScrollEdgesAvailable = Boolean(ScrollEdgeElement);

/**
 * A horizontal row's soft ends, laid beside its scroll view: UIKit's edge effect
 * on each end that has content scrolled past it (at rest the first card is sharp).
 */
export function NemuHorizontalScrollEdges() {
  if (!ScrollEdgeElement) return null;
  return (
    <>
      <ScrollEdgeElement edge="left" revealPastRest pointerEvents="none" style={[styles.edge, styles.left]} />
      <ScrollEdgeElement edge="right" revealPastRest pointerEvents="none" style={[styles.edge, styles.right]} />
    </>
  );
}

const styles = StyleSheet.create({
  edge: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: HORIZONTAL_SCROLL_EDGE_WIDTH,
  },
  left: {
    left: 0,
  },
  right: {
    right: 0,
  },
});
