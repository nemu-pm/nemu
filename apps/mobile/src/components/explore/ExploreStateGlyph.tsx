import Svg, { Circle, Path, Rect } from "react-native-svg";

/**
 * Glyphs for empty, loading and error states (design-explore): small line
 * drawings of nemu's own things — pages, books, a shelf — instead of stock
 * symbols, one stroke weight and round caps throughout. Each has its base
 * lines in the muted ink and one accent element (the thing that is missing
 * or wrong) in the primary colour, or the danger colour for an error.
 */
import type { ExploreStateGlyphKind } from "@/lib/mobileExploreStateGlyph";

const STROKE = 2;

export function ExploreStateGlyph({
  kind,
  size = 56,
  base,
  accent,
}: {
  kind: ExploreStateGlyphKind;
  size?: number;
  /** The drawing's lines (the muted ink). */
  base: string;
  /** The one marked element (primary, or danger for an error). */
  accent: string;
}) {
  const line = { stroke: base, strokeWidth: STROKE, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
  const mark = { ...line, stroke: accent };
  return (
    <Svg width={size} height={size} viewBox="0 0 56 56" accessibilityElementsHidden importantForAccessibility="no">
      {kind === "search" ? (
        <>
          {/* A page with nothing on it, and a lens over its corner. */}
          <Path d="M14 9h18l8 8v26a3 3 0 0 1-3 3H14a3 3 0 0 1-3-3V12a3 3 0 0 1 3-3Z" {...line} />
          <Path d="M32 9v8h8" {...line} />
          <Circle cx={33} cy={34} r={8} {...mark} />
          <Path d="m39 40 6 6" {...mark} />
        </>
      ) : kind === "listing" ? (
        <>
          {/* A shelf with room on it: two books standing, an empty dashed slot. */}
          <Path d="M8 44h40" {...line} />
          <Rect x={11} y={18} width={9} height={26} rx={1.5} {...line} />
          <Rect x={22} y={14} width={9} height={30} rx={1.5} {...line} />
          <Rect x={34} y={18} width={10} height={26} rx={1.5} {...mark} strokeDasharray="3 3.5" />
        </>
      ) : kind === "source" ? (
        <>
          {/* An open book whose right page has torn away. */}
          <Path d="M28 16c-4-3-10-4-17-3v29c7-1 13 0 17 3" {...line} />
          <Path d="M28 16v29" {...line} />
          <Path d="M28 16c4-3 10-4 17-3v8l-4 4 4 4-4 4 4 4v5c-7-1-13 0-17 3" {...mark} />
        </>
      ) : kind === "offline" ? (
        <>
          {/* An open book, and above it a signal that does not reach it. */}
          <Path d="M28 26c-4-3-9-4-15-3v21c6-1 11 0 15 3 4-3 9-4 15-3V23c-6-1-11 0-15 3Z" {...line} />
          <Path d="M28 26v21" {...line} />
          <Path d="M19 15c5-5 13-5 18 0" {...mark} strokeDasharray="2.5 4" />
          <Path d="M23 19c3-2.5 7-2.5 10 0" {...mark} strokeDasharray="2.5 4" />
        </>
      ) : kind === "chapters" ? (
        <>
          {/* A stack of pages with no lines on the top one. */}
          <Rect x={17} y={11} width={26} height={33} rx={3} {...line} />
          <Path d="M13 17v27a4 4 0 0 0 4 4h20" {...line} />
          <Path d="M23 20h14M23 26h14M23 32h8" {...mark} strokeDasharray="0.1 5" />
        </>
      ) : kind === "globe" ? (
        <>
          {/* Sources out in the world: a globe of meridians, one ring marked. */}
          <Circle cx={28} cy={28} r={17} {...line} />
          <Path d="M11 28h34M28 11c-6 5-6 29 0 34M28 11c6 5 6 29 0 34" {...line} />
          <Path d="M14 19c8 4 20 4 28 0" {...mark} />
        </>
      ) : (
        <>
          {/* A page with a mark where something went wrong. */}
          <Path d="M14 9h18l8 8v26a3 3 0 0 1-3 3H14a3 3 0 0 1-3-3V12a3 3 0 0 1 3-3Z" {...line} />
          <Path d="M25.5 20v11" {...mark} />
          <Circle cx={25.5} cy={37} r={0.6} {...mark} strokeWidth={3} />
        </>
      )}
    </Svg>
  );
}
