import { useEffect, type ComponentType, type ReactElement, type ReactNode } from "react";
import { Platform, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedRef,
  useAnimatedStyle,
  useEvent,
  useSharedValue,
  withTiming,
  type AnimatedRef,
  type ReanimatedEvent,
  type SharedValue,
} from "react-native-reanimated";
import { BlurView } from "expo-blur";
import RNCMaskedView from "@react-native-masked-view/masked-view";
import { useNemuTheme } from "@/design/useNemuTheme";
import { useNemuScrollEdge, type NemuScrollEdgeOptions } from "@/design/useNemuScrollEdge";
import { ExploreGradient } from "@/components/explore/ExploreGradient";
import {
  MOBILE_RAIL_TOP_EDGE_BLUR_INTENSITY,
  MOBILE_SCROLL_EDGE_BAND_DURATION_MS,
  mobileScrollEdgeReveal,
  type MobileRailTopScrollEdge,
} from "@/lib/mobileScrollEdgeEffect";

// Its types are built against another copy of React's types.
const MaskedView = RNCMaskedView as unknown as ComponentType<{
  maskElement: ReactElement;
  children: ReactNode;
  pointerEvents?: "none";
  style?: object;
}>;

type ScrollEdgeEvent = {
  contentOffset: { y: number };
  contentInset?: { top: number };
};

const SCROLL_EVENT_NAMES = ["onScroll", "onScrollEndDrag", "onMomentumScrollEnd"];

export type NemuScrollEdgeTracking = {
  /** Attach to the page's scroll view (call it from its ref callback). */
  ref: AnimatedRef<never>;
  /** How far the content has scrolled past its resting top (pt), on the UI thread. */
  scrolledPastRest: SharedValue<number>;
};

/**
 * Follows a page scroll view's offset on the UI thread (no render per frame),
 * so the top band shows only once content sits under it. The resting top is
 * the offset less the bar's inset UIKit adds above the content.
 */
export function useNemuScrollEdgeTracking(): NemuScrollEdgeTracking {
  const ref = useAnimatedRef<never>();
  const scrolledPastRest = useSharedValue(0);
  const handler = useEvent<ScrollEdgeEvent>(
    (event: ReanimatedEvent<ScrollEdgeEvent>) => {
      "worklet";
      scrolledPastRest.set(event.contentOffset.y + (event.contentInset?.top ?? 0));
    },
    SCROLL_EVENT_NAMES,
  );
  useEffect(() => {
    if (Platform.OS !== "ios") return undefined;
    // Registered on the scroll view's own tag, as Reanimated's
    // `useScrollOffset` does: the scaffolds keep their plain RN scroll views.
    const events = (handler as unknown as {
      workletEventHandler: { registerForEvents: (tag: number) => void; unregisterFromEvents: (tag: number) => void };
    }).workletEventHandler;
    return ref.observe((tag) => {
      if (!tag) return undefined;
      events.registerForEvents(tag);
      return () => events.unregisterFromEvents(tag);
    });
  }, [handler, ref]);
  return { ref, scrolledPastRest };
}

/**
 * A page scroll container's soft edges (see `useNemuScrollEdge`): the scroll
 * view, with the bands UIKit cannot draw laid over its top and bottom. They
 * sit inside the screen, so under the native bar's title and items and over
 * the content. iOS always keeps the wrapper (a fold that brings the rail must
 * not remount the scroll view); Android renders the scroll view alone.
 */
export function NemuScrollEdgeSurface({
  children,
  tracking,
  ...options
}: NemuScrollEdgeOptions & {
  children: ReactNode;
  /** The scroll view's offset: the top band shows only once content is under it. */
  tracking: NemuScrollEdgeTracking;
}) {
  const bands = useNemuScrollEdge(options);
  if (Platform.OS !== "ios") return <>{children}</>;
  return (
    <View style={styles.surface}>
      {children}
      <NemuScrollEdgeBand edge={bands.top} placement="top" scrolledPastRest={tracking.scrolledPastRest} />
      <NemuScrollEdgeBand edge={bands.bottom} placement="bottom" />
    </View>
  );
}

/**
 * One progressive blur band. Its height follows the page's pinned top with a
 * short ease (a compact title fading in, a bar row going), never a jump; the
 * top band's opacity follows the scroll.
 */
function NemuScrollEdgeBand({
  edge,
  placement,
  scrolledPastRest,
}: {
  edge: MobileRailTopScrollEdge;
  placement: "top" | "bottom";
  scrolledPastRest?: SharedValue<number>;
}) {
  const { scheme } = useNemuTheme();
  const height = useSharedValue(edge.height);
  useEffect(() => {
    height.set(withTiming(edge.height, {
      duration: MOBILE_SCROLL_EDGE_BAND_DURATION_MS,
      easing: Easing.out(Easing.cubic),
    }));
  }, [edge.height, height]);
  const animatedStyle = useAnimatedStyle(() => ({
    height: height.get(),
    opacity: scrolledPastRest ? mobileScrollEdgeReveal(scrolledPastRest.get()) : 1,
  }));
  if (edge.height <= 0) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[placement === "top" ? styles.topEdge : styles.bottomEdge, animatedStyle]}
    >
      <MaskedView
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
        maskElement={<ExploreGradient colors={edge.maskStops} style={StyleSheet.absoluteFill} />}
      >
        <BlurView
          intensity={MOBILE_RAIL_TOP_EDGE_BLUR_INTENSITY}
          tint={scheme === "dark" ? "systemUltraThinMaterialDark" : "systemUltraThinMaterialLight"}
          style={StyleSheet.absoluteFill}
        />
      </MaskedView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  surface: {
    flex: 1,
  },
  topEdge: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  bottomEdge: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
});
