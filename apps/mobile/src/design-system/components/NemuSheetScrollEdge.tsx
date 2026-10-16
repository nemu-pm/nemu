import { useCallback, useMemo, type ComponentType, type ReactElement, type ReactNode } from "react";
import {
  Platform,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { BlurView } from "expo-blur";
import RNCMaskedView from "@react-native-masked-view/masked-view";
import { useNemuTheme } from "@/design/useNemuTheme";
import { ExploreGradient } from "@/components/explore/ExploreGradient";
import {
  MOBILE_RAIL_TOP_EDGE_BLUR_INTENSITY,
  MOBILE_SHEET_SCROLL_EDGE,
} from "@/lib/mobileScrollEdgeEffect";

// Its types are built against another copy of React's types.
const MaskedView = RNCMaskedView as unknown as ComponentType<{
  maskElement: ReactElement;
  children: ReactNode;
  pointerEvents?: "none";
  style?: object;
}>;

export type NemuSheetScrollEdgeProps = {
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollEventThrottle: number;
};

/**
 * The soft top edge of a scrolling body in an RN-drawn sheet (see
 * `useNemuScrollEdge`): the sheet's header sits above the body, not over it,
 * so no system edge effect exists there and rows were cut hard at the body's
 * top. A short progressive blur band covers that edge once the body has
 * scrolled (at rest it is clear, so the first row is never blurred). The
 * child spreads the props it is given onto its scroll view:
 *
 *   <NemuSheetScrollEdge>{(edge) => <FlatList {...edge} … />}</NemuSheetScrollEdge>
 */
export function NemuSheetScrollEdge({
  children,
  onScroll,
  style,
}: {
  children: (edge: NemuSheetScrollEdgeProps) => ReactNode;
  /** The body's own scroll handler, still called. */
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  /** The wrapper's size: the scroll view's own (default: fills the body). */
  style?: StyleProp<ViewStyle>;
}) {
  const { scheme } = useNemuTheme();
  const shown = useSharedValue(0);
  // The target, not the animating value: one fade per crossing.
  const target = useSharedValue(0);
  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentInset } = event.nativeEvent;
      const scrolled = contentOffset.y + (contentInset?.top ?? 0) > MOBILE_SHEET_SCROLL_EDGE.threshold ? 1 : 0;
      if (target.get() !== scrolled) {
        target.set(scrolled);
        shown.set(withTiming(scrolled, { duration: MOBILE_SHEET_SCROLL_EDGE.fadeMs }));
      }
      onScroll?.(event);
    },
    [onScroll, shown, target],
  );
  const edge = useMemo(() => ({ onScroll: handleScroll, scrollEventThrottle: 16 }), [handleScroll]);
  const bandStyle = useAnimatedStyle(() => ({ opacity: shown.value }));
  if (Platform.OS !== "ios") return <>{children(edge)}</>;
  return (
    <View style={style ?? styles.surface}>
      {children(edge)}
      <Animated.View pointerEvents="none" style={[styles.band, bandStyle]}>
        <MaskedView
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
          maskElement={<ExploreGradient colors={MOBILE_SHEET_SCROLL_EDGE.maskStops} style={StyleSheet.absoluteFill} />}
        >
          <BlurView
            intensity={MOBILE_RAIL_TOP_EDGE_BLUR_INTENSITY}
            tint={scheme === "dark" ? "systemUltraThinMaterialDark" : "systemUltraThinMaterialLight"}
            style={StyleSheet.absoluteFill}
          />
        </MaskedView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    flex: 1,
  },
  band: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: MOBILE_SHEET_SCROLL_EDGE.height,
  },
});
