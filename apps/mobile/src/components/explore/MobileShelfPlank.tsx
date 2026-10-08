import { MOBILE_EXPLORE_RADIUS as R } from "@/lib/mobileExploreRadius";
import { StyleSheet, View } from "react-native";
import { createNemuShadowStyle, useNemuTheme } from "@/design-system";
import { MOBILE_SHELF } from "@/lib/mobileLibraryShelf";
import { ExploreGlass } from "./ExploreGlass";

/**
 * Plank finish, chosen at bundle time for comparison:
 * `EXPO_PUBLIC_NEMU_SHELF_PLANK=glass` (Liquid Glass board) or the default
 * solid grey board.
 */
const PLANK_GLASS = process.env.EXPO_PUBLIC_NEMU_SHELF_PLANK === "glass";

/**
 * Plank intensity steps (1 quietest … 3 strongest), selectable at bundle time
 * with `EXPO_PUBLIC_NEMU_SHELF_PLANK_STEP` for comparison; step 2 is the
 * default. Dark step 2 matches the reference: a thin mid-grey board whose
 * front lightens toward its lower edge. Light mode is a pale tint of the page.
 */
const PLANK_STEPS = {
  1: {
    light: { top: ["#ffffff", "#f2f4f9"], front: ["#eaedf4", "#e2e6ee"], shadow: "rgba(38,57,120,0.07)" },
    dark: { top: ["#4a4b4f", "#3f4044"], front: ["#2c2d30", "#37383b"], shadow: "rgba(0,0,0,0.4)" },
  },
  2: {
    light: { top: ["#ffffff", "#edf0f6"], front: ["#e2e6ee", "#d8dde7"], shadow: "rgba(38,57,120,0.1)" },
    dark: { top: ["#5c5d61", "#4b4c50"], front: ["#313235", "#434447"], shadow: "rgba(0,0,0,0.5)" },
  },
  3: {
    light: { top: ["#fcfdff", "#e6e9f1"], front: ["#d7dce7", "#cad0dd"], shadow: "rgba(38,57,120,0.13)" },
    dark: { top: ["#67696e", "#55575c"], front: ["#36383c", "#4a4c50"], shadow: "rgba(0,0,0,0.55)" },
  },
} as const;
const PLANK_STEP = (Number(process.env.EXPO_PUBLIC_NEMU_SHELF_PLANK_STEP) || 2) as 1 | 2 | 3;
const PLANK = {
  light: { ...PLANK_STEPS[PLANK_STEP in PLANK_STEPS ? PLANK_STEP : 2].light, rim: "rgba(255,255,255,0.9)", glassTint: "rgba(110,122,156,0.14)" },
  dark: { ...PLANK_STEPS[PLANK_STEP in PLANK_STEPS ? PLANK_STEP : 2].dark, rim: "rgba(255,255,255,0.12)", glassTint: "rgba(255,255,255,0.12)" },
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
  if (PLANK_GLASS) {
    return (
      <View pointerEvents="none" style={frame}>
        <ExploreGlass cornerRadius={R.hair} tintColor={palette.glassTint} style={StyleSheet.absoluteFill}>
          <View style={[styles.glassTop, { borderTopColor: palette.rim }]} />
        </ExploreGlass>
      </View>
    );
  }
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
