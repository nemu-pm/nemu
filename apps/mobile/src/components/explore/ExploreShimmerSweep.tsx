import { useCallback, useEffect, useRef, useState } from "react";
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
const LEAN_SLOPE = Math.tan((LEAN_DEG * Math.PI) / 180);

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
 * The shimmer over a skeleton: one soft diagonal band every ~1.8 s; nothing under Reduce Motion.
 */
export function ExploreShimmerSweep() {
  const { scheme, reduceMotion } = useNemuTheme();
  // Skeletons sit inside the page gutters while their rails bleed past them
  // to the screen edge: the sweep covers the gutters too, so the band never
  // stops in a hard vertical line short of the edge (seen on source home).
  const gutters = useMobilePageGutters();
  const time = useShimmerClock();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  // Every sweep on screen draws the same window-wide band: its place comes
  // from the frame's window position, and the band leans about the window's
  // top rather than its own frame's middle, so a short row (the source tabs)
  // and a tall block under it light up along one diagonal. The position is
  // read again every cycle: a frame laid out during a push is still sliding
  // in when it first measures.
  const frameRef = useRef<ViewInstance | null>(null);
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const [height, setHeight] = useState(0);
  const measure = useCallback(() => {
    frameRef.current?.measureInWindow((x, y) => {
      setOrigin((current) => (current.x === x && current.y === y ? current : { x, y }));
    });
  }, []);
  useEffect(() => {
    const timer = setInterval(measure, SWEEP_MS + REST_MS);
    return () => clearInterval(timer);
  }, [measure]);
  const onLayout = (event: LayoutChangeEvent) => {
    setHeight(event.nativeEvent.layout.height);
    measure();
  };
  // The lean puts the band's foot up to a window height's slope behind its head.
  const travel = windowWidth + BAND * 2 + LEAN_SLOPE * windowHeight;
  const lean = LEAN_SLOPE * (origin.y + height / 2);
  const style = useAnimatedStyle(() => {
    const share = Math.min(1, (time.value * (SWEEP_MS + REST_MS)) / SWEEP_MS);
    // Ease-out: the band arrives quickly and slows as it leaves.
    const eased = 1 - (1 - share) * (1 - share) * (1 - share);
    return { transform: [{ translateX: -BAND + eased * travel - origin.x - lean }, { rotate: `${LEAN_DEG}deg` }] };
  });
  if (reduceMotion) return null;
  // A mid grey: colour-dodge lifts the blocks by about half in light mode and
  // a third in dark, and barely touches a near-white or near-black page.
  const grey = scheme === "dark" ? "110, 110, 116" : "92, 92, 98";
  return (
    <View
      ref={frameRef}
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
