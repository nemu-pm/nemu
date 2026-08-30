import { StyleSheet, type ViewStyle } from "react-native";
import type { NemuButtonDepthVisual } from "./nemuButtonDepth";

export function createNemuButtonDepthStyle(
  visual: NemuButtonDepthVisual,
): ViewStyle {
  return {
    backgroundColor: visual.backgroundColor,
    borderColor: visual.borderColor,
    borderWidth: StyleSheet.hairlineWidth,
    boxShadow: visual.boxShadow,
  };
}
