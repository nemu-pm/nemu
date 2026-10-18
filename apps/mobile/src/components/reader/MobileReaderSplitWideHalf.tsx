import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

/**
 * One half of a wide page split at its centre line (the book posture's
 * printed spread): a box half the page wide that shows the page's left or
 * right half. The page itself is laid out whole, at `frame`.
 */
export function MobileReaderSplitWideHalf({
  children,
  frame,
  part,
  rect,
}: {
  children: ReactNode;
  frame: { width: number; height: number };
  part: "left" | "right";
  /** Where the half rests, in its parent's coordinates. */
  rect: { x: number; y: number; width: number; height: number };
}) {
  return (
    <View style={[styles.half, { left: rect.x, top: rect.y, width: rect.width, height: rect.height }]}>
      <View style={[styles.page, { left: part === "left" ? 0 : -rect.width, width: frame.width, height: frame.height }]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  half: {
    position: "absolute",
    overflow: "hidden",
  },
  page: {
    position: "absolute",
    top: 0,
    alignItems: "center",
    justifyContent: "center",
  },
});
