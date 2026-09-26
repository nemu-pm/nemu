import type { TextStyle } from "react-native";

/**
 * Android: the chip label spans the chip's full inner width and centers its
 * glyphs, instead of being shrink-wrapped to its own measured advance.
 *
 * A shrink-wrapped single-line label on Android is laid out in a box exactly
 * as wide as its measured (ceil'd) advance, and the medium-weight Roboto run
 * can need a pixel more than that when it is drawn, so `numberOfLines={1}`
 * ellipsized the longest reading-mode label ("Scroll" -> "Scr…") even though
 * each chip had roughly three times the room. Sizing the label box to the chip
 * leaves ellipsis for labels that truly do not fit. iOS keeps its layout (its
 * reading-mode control is a native segmented Picker anyway).
 */
export function readerSegmentedChipLabelLayout(
  platform: string,
): TextStyle | null {
  return platform === "android"
    ? { alignSelf: "stretch", textAlign: "center" }
    : null;
}
