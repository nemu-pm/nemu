import Ionicons from "@expo/vector-icons/Ionicons";
import { MOBILE_READER_CHROME_GLYPHS } from "@/lib/mobileReaderBarIcons";
import type { ReaderBackGlyphProps } from "./ReaderBackGlyph.types";

/** Android and older targets: the chrome's Ionicons chevron. */
export function ReaderBackGlyph({ color }: ReaderBackGlyphProps) {
  return (
    <Ionicons
      name={MOBILE_READER_CHROME_GLYPHS.back.name}
      size={MOBILE_READER_CHROME_GLYPHS.back.size}
      color={color}
    />
  );
}
