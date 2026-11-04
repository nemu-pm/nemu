import { useCallback, useEffect, useState, type ComponentType, type ReactElement, type ReactNode } from "react";
import { Platform, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
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
import { BlurView, type BlurTint } from "expo-blur";
import RNCMaskedView from "@react-native-masked-view/masked-view";
import { useNemuTheme } from "@/design/useNemuTheme";
import { NativeBlurView, WindowLayoutObserver, type MobileWindowLayout } from "../../../modules/nemu-window-layout";
import { useNemuScrollEdge, type NemuScrollEdgeOptions } from "@/design/useNemuScrollEdge";
import { ExploreGradient } from "@/components/explore/ExploreGradient";
import {
  MOBILE_RAIL_TOP_EDGE_BLUR_INTENSITY,
  MOBILE_SCROLL_EDGE_BAND_DURATION_MS,
  mobileScrollEdgeReveal,
  mobileScrollEdgeScrolledPastRest,
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
  /**
   * The scroll view's offset plus its own `contentInset.top` (on the UI
   * thread). A form that tracks its own rest sets it to how far it has
   * scrolled past that rest.
   */
  scrolledPastRest: SharedValue<number>;
  /**
   * The top inset UIKit adds on its own (`adjustedContentInset` less
   * `contentInset`: the safe area, the bar's height under a transparent bar)
   * for a scroll view that adjusts its insets; 0 otherwise. Scroll events
   * carry only `contentInset`, so at rest the offset is minus this, not 0.
   * Read from the scroll view's frame (`NemuScrollEdgeSurface`).
   */
  systemInsetTop?: SharedValue<number>;
  /**
   * The same offset from the scroll view's JS end events (a drag released, a
   * fling settled): where the scroll comes to rest is never left to the
   * UI-thread registration alone. Compose into the scroll view's
   * `onScrollEndDrag` and `onMomentumScrollEnd`.
   */
  onScrollSettled?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
};

/**
 * Follows a page scroll view's offset on the UI thread (no render per frame),
 * so the top band shows only once content sits under it. The resting top is
 * the offset less every inset above the content: the scroll view's own and,
 * with `systemAdjustsInsets`, the one UIKit adds (`systemInsetTop`).
 */
export function useNemuScrollEdgeTracking({
  systemAdjustsInsets = false,
}: { systemAdjustsInsets?: boolean } = {}): NemuScrollEdgeTracking {
  const ref = useAnimatedRef<never>();
  const scrolledPastRest = useSharedValue(0);
  const systemInsetTop = useSharedValue(0);
  useEffect(() => {
    if (!systemAdjustsInsets) systemInsetTop.set(0);
  }, [systemAdjustsInsets, systemInsetTop]);
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
  const onScrollSettled = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentInset } = event.nativeEvent;
      if (!contentOffset || !Number.isFinite(contentOffset.y)) return;
      const own = contentInset && Number.isFinite(contentInset.top) ? contentInset.top : 0;
      scrolledPastRest.set(contentOffset.y + own);
    },
    [scrolledPastRest],
  );
  return systemAdjustsInsets
    ? { ref, scrolledPastRest, systemInsetTop, onScrollSettled }
    : { ref, scrolledPastRest, onScrollSettled };
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
  /**
   * The scroll view's offset: the top band shows only once content is under
   * it (a SwiftUI Form feeds it from its scroll geometry).
   */
  tracking: Pick<NemuScrollEdgeTracking, "scrolledPastRest" | "systemInsetTop">;
}) {
  const { systemInsetTop } = tracking;
  // The scroll view's safe-area top: where the native bar really ends (the
  // band's height) and the inset UIKit adds (the band's rest). Only measured
  // for a scroll view that adjusts its insets (`systemInsetTop`).
  const [observedSafeAreaTop, setObservedSafeAreaTop] = useState<number | null>(null);
  const bands = useNemuScrollEdge({
    ...options,
    observedSafeAreaTop: systemInsetTop ? observedSafeAreaTop : null,
  });
  const onObserverLayout = useCallback(
    (layout: MobileWindowLayout) => {
      const top = layout.safeAreaInsets?.top;
      if (!systemInsetTop || top === undefined || !Number.isFinite(top)) return;
      const next = Math.max(0, top);
      systemInsetTop.set(next);
      setObservedSafeAreaTop((previous) =>
        previous !== null && Math.abs(previous - next) < 0.5 ? previous : next,
      );
    },
    [systemInsetTop],
  );
  if (Platform.OS !== "ios") return <>{children}</>;
  return (
    <View style={styles.surface}>
      {children}
      {/*
        The scroll view's safe area (same frame): the bar's real bottom and
        the top inset UIKit adds to the scroll view (the top band's rest).
        Only while a top band is drawn (beside the Duo's vertical bar, under
        a bar the page draws).
      */}
      {systemInsetTop && bands.top.height > 0 ? (
        <WindowLayoutObserver style={StyleSheet.absoluteFill} onLayoutChange={onObserverLayout} />
      ) : null}
      <NemuScrollEdgeBand
        edge={bands.top}
        placement="top"
        scrolledPastRest={tracking.scrolledPastRest}
        systemInsetTop={systemInsetTop}
      />
      <NemuScrollEdgeBand edge={bands.bottom} placement="bottom" />
    </View>
  );
}

/**
 * The bands' blur: NemuBlurView on iOS (it re-applies its effect whenever it
 * is on screen without one; expo-blur's BlurView sets it only from its first
 * draw and stayed empty on about half of the cold launches for the Library's
 * band, iPhone Duo r6), expo-blur's BlurView elsewhere or on an older binary.
 * Same intensity and tint either way.
 */
function BandBlur({ intensity, tint }: { intensity: number; tint: BlurTint }) {
  if (NativeBlurView) return <NativeBlurView intensity={intensity} tint={tint} style={StyleSheet.absoluteFill} />;
  return <BlurView intensity={intensity} tint={tint} style={StyleSheet.absoluteFill} />;
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
  systemInsetTop,
}: {
  edge: MobileRailTopScrollEdge;
  placement: "top" | "bottom";
  scrolledPastRest?: SharedValue<number>;
  systemInsetTop?: SharedValue<number>;
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
    opacity: scrolledPastRest
      ? mobileScrollEdgeReveal(
          mobileScrollEdgeScrolledPastRest({
            // Already the offset plus the scroll view's own inset.
            offsetY: scrolledPastRest.get(),
            contentInsetTop: 0,
            systemInsetTop: systemInsetTop ? systemInsetTop.get() : 0,
          }),
        )
      : 1,
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
        <BandBlur
          intensity={MOBILE_RAIL_TOP_EDGE_BLUR_INTENSITY}
          tint={scheme === "dark" ? "systemUltraThinMaterialDark" : "systemUltraThinMaterialLight"}
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
