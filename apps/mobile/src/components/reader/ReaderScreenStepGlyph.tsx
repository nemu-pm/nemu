import Ionicons from "@expo/vector-icons/Ionicons";
import type { ReaderScreenStepGlyphProps } from "./ReaderScreenStepGlyph.types";

/** Android and older targets: the Ionicons chevron. */
export function ReaderScreenStepGlyph({ direction, color }: ReaderScreenStepGlyphProps) {
  return <Ionicons name={direction === "up" ? "chevron-up" : "chevron-down"} size={26} color={color} />;
}
