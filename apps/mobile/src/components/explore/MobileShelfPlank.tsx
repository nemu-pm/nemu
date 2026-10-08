import { MOBILE_EXPLORE_RADIUS as R } from "@/lib/mobileExploreRadius";
import { StyleSheet, View } from "react-native";
import { createNemuShadowStyle, useNemuTheme } from "@/design-system";
import { MOBILE_SHELF } from "@/lib/mobileLibraryShelf";

/** Solid grey board (step 2 intensity). */
const PLANK_PALETTE = {
  light: { top: ["#ffffff", "#edf0f6"], front: ["#e2e6ee", "#d8dde7"], shadow: "rgba(38,57,120,0.1)", rim: "rgba(255,255,255,0.9)" },
  dark: { top: ["#5c5d61", "#4b4c50"], front: ["#313235", "#434447"], shadow: "rgba(0,0,0,0.5)", rim: "rgba(255,255,255,0.12)" },
} as const;
const PLANK = {
  light: PLANK_PALETTE.light,
  dark: PLANK_PALETTE.dark,
} as const;

/** `#rrggbb` → channels. */
function channels(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** The plank's lit top edge: the rim colour (`rgba(255,255,255,a)`) over the top face. */
function rimOver(hex: string, rim: string): string {
  const alpha = Number(rim.slice(rim.lastIndexOf(",") + 1, -1));
  const [r, g, b] = channels(hex).map((channel) => Math.round(channel + (255 - channel) * alpha));
  return `rgb(${r}, ${g}, ${b})`;
}

const PLANK_HEIGHT = MOBILE_SHELF.plankTop + MOBILE_SHELF.plankFront;
const percent = (points: number) => `${((points / PLANK_HEIGHT) * 100).toFixed(3)}%`;

/**
 * Both faces of the solid plank as one background: the hairline rim, the top
 * face, then the front face, with hard stops between them. One view (and no
 * clip view, no bitmap) per plank instead of four.
 */
function plankFaces(palette: (typeof PLANK)["light" | "dark"]): string {
  const rim = rimOver(palette.top[0], palette.rim);
  const edge = percent(StyleSheet.hairlineWidth);
  const fold = percent(MOBILE_SHELF.plankTop);
  return `linear-gradient(to bottom, ${rim} 0%, ${rim} ${edge}, ${palette.top[0]} ${edge}, ${palette.top[1]} ${fold}, ${palette.front[0]} ${fold}, ${palette.front[1]} 100%)`;
}
const PLANK_FACES = { light: plankFaces(PLANK.light), dark: plankFaces(PLANK.dark) } as const;

/**
 * A thin floating wall shelf: a lighter top face the covers stand on and a
 * darker front face, slightly rounded at the ends, with a soft shadow on the
 * wall beneath. No case, no back: the page itself is the wall.
 */
export function MobileShelfPlank({ left, width, top }: { left: number; width: number; top: number }) {
  const { scheme } = useNemuTheme();
  const palette = PLANK[scheme];
  const shadow = createNemuShadowStyle({ color: palette.shadow, offsetY: 2, radius: 3, elevation: 2 });
  const frame = [styles.plank, { left, width, top, height: PLANK_HEIGHT }, shadow];
  return (
    <View
      pointerEvents="none"
      // The solid colour under the faces is never seen; it makes the view
      // opaque, which is what lets its shadow be drawn from a path instead of
      // from an offscreen pass over the plank's pixels on every frame.
      style={[frame, { backgroundColor: palette.front[1], backgroundImage: PLANK_FACES[scheme] }]}
    />
  );
}

const styles = StyleSheet.create({
  plank: {
    position: "absolute",
    borderRadius: R.hair,
  },
  glassTop: {
    height: MOBILE_SHELF.plankTop,
    borderTopWidth: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
});
