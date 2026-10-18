import Svg, { Path } from "react-native-svg";
import type { ExploreLibraryGlyphProps } from "./ExploreLibraryGlyph.types";

/** Android: matched strokes for the library button's two states. */
export function ExploreLibraryGlyph({ added, color }: ExploreLibraryGlyphProps) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24">
      <Path
        d={added ? "M5 12.5 9.5 17 19 7" : "M12 5v14M5 12h14"}
        fill="none"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
