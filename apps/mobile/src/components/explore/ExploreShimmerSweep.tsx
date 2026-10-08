import { useEffect, useState } from "react";
import { StyleSheet, View, useWindowDimensions, type LayoutChangeEvent, type ViewInstance } from "react-native";
import Animated, {
  Easing,
  makeMutable,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useMobilePageGutters, useNemuTheme } from "@/design-system";
import { ExploreGradient } from "./ExploreGradient";

/** One sweep across the window, then a rest, forever (ms). */
const SWEEP_MS = 1300;
const REST_MS = 500;
const BAND = 240;
/** The band leans, so it crosses a block corner to corner rather than as a ruled line. */
const LEAN_DEG = 16;

/** One clock for every sweep on screen, so placeholders shimmer as one surface. */
const clock = makeMutable(0);
let users = 0;

function useShimmerClock(): SharedValue<number> {
  const value = clock;
  useEffect(() => {
    users += 1;
    if (users === 1) {
      value.value = 0;
      value.value = withRepeat(withTiming(1, { duration: SWEEP_MS + REST_MS, easing: Easing.linear }), -1);
    }
    return () => {
      users -= 1;
      if (users === 0) value.value = 0;
    };
  }, [value]);
  return value;
}

/**
 * The shimmer over a skeleton (design-explore): one soft band that crosses
 * the whole window, diagonally, every ~1.8 s, eased out, in the same place
 * for every skeleton on screen. Lay it over the skeleton's blocks as the last
 * child of their container, and give the container the page colour: the band
 * dodges what is drawn inside the container's group, which lifts the blocks
 * and barely touches a near-white or near-black page (on a transparent
 * backdrop it would paint grey). Nothing under Reduce Motion.
 */
export function ExploreShimmerSweep() {
  const { scheme, reduceMotion } = useNemuTheme();
  // Skeletons sit inside the page gutters while their rails bleed past them
  // to the screen edge: the sweep covers the gutters too, so the band never
  // stops in a hard vertical line short of the edge (seen on source home).
  const gutters = useMobilePageGutters();
  const time = useShimmerClock();
  const { width: windowWidth } = useWindowDimensions();
  const [originX, setOriginX] = useState(0);
  const [height, setHeight] = useState(0);
  const onLayout = (event: LayoutChangeEvent) => {
    setHeight(event.nativeEvent.layout.height);
    (event.target as unknown as ViewInstance).measureInWindow((x) => setOriginX(x));
  };
  const travel = windowWidth + BAND * 2;
  const style = useAnimatedStyle(() => {
    const share = Math.min(1, (time.value * (SWEEP_MS + REST_MS)) / SWEEP_MS);
    // Ease-out: the band arrives quickly and slows as it leaves.
    const eased = 1 - (1 - share) * (1 - share) * (1 - share);
    return { transform: [{ translateX: -BAND + eased * travel - originX }, { rotate: `${LEAN_DEG}deg` }] };
  });
  if (reduceMotion) return null;
  // A mid grey: colour-dodge lifts the blocks by about half in light mode and
  // a third in dark, and barely touches a near-white or near-black page.
  const grey = scheme === "dark" ? "110, 110, 116" : "92, 92, 98";
  return (
    <View
      pointerEvents="none"
      onLayout={onLayout}
      style={[styles.frame, { left: -gutters.left, right: -gutters.right }]}
    >
      <Animated.View style={[styles.band, { height: height + 400 }, style]}>
        <ExploreGradient
          direction="right"
          colors={[
            [`rgba(${grey}, 0)`, 0],
            [`rgba(${grey}, 0.7)`, 0.42],
            [`rgba(${grey}, 1)`, 0.5],
            [`rgba(${grey}, 0.7)`, 0.58],
            [`rgba(${grey}, 0)`, 1],
          ]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    overflow: "hidden",
    mixBlendMode: "color-dodge",
  },
  band: {
    position: "absolute",
    top: -200,
    left: 0,
    width: BAND,
  },
});
