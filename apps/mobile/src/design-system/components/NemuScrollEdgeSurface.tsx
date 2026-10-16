import { useEffect, type ComponentType, type ReactElement, type ReactNode } from "react";
import { Platform, StyleSheet, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { BlurView } from "expo-blur";
import RNCMaskedView from "@react-native-masked-view/masked-view";
import { nemuColorWithAlpha } from "@/design/colorAlpha";
import { useNemuTheme } from "@/design/useNemuTheme";
import { useNemuScrollEdge, type NemuScrollEdgeOptions } from "@/design/useNemuScrollEdge";
import { ExploreGradient } from "@/components/explore/ExploreGradient";
import {
  MOBILE_RAIL_TOP_EDGE_BLUR_INTENSITY,
  MOBILE_SCROLL_EDGE_BAND_DURATION_MS,
  type MobileRailTopScrollEdge,
} from "@/lib/mobileScrollEdgeEffect";

// Its types are built against another copy of React's types.
const MaskedView = RNCMaskedView as unknown as ComponentType<{
  maskElement: ReactElement;
  children: ReactNode;
  pointerEvents?: "none";
  style?: object;
}>;

/**
 * A page scroll container's soft edges (see `useNemuScrollEdge`): the scroll
 * view, with the bands UIKit cannot draw laid over its top and bottom. They
 * sit inside the screen, so under the native bar's title and items and over
 * the content. iOS always keeps the wrapper (a fold that brings the rail must
 * not remount the scroll view); Android renders the scroll view alone.
 */
export function NemuScrollEdgeSurface({
  children,
  ...options
}: NemuScrollEdgeOptions & { children: ReactNode }) {
  const bands = useNemuScrollEdge(options);
  if (Platform.OS !== "ios") return <>{children}</>;
  return (
    <View style={styles.surface}>
      {children}
      <NemuScrollEdgeBand edge={bands.top} placement="top" />
      <NemuScrollEdgeBand edge={bands.bottom} placement="bottom" />
    </View>
  );
}

function maskAlpha(mask: string): number {
  return Number(mask.match(/,([\d.]+)\)$/)?.[1] ?? 0);
}

/**
 * One progressive blur band. Its height follows the page's pinned top with a
 * short ease (a compact title fading in, a bar row going), never a jump.
 */
function NemuScrollEdgeBand({ edge, placement }: { edge: MobileRailTopScrollEdge; placement: "top" | "bottom" }) {
  const { scheme, tokens } = useNemuTheme();
  const height = useSharedValue(edge.height);
  useEffect(() => {
    height.set(withTiming(edge.height, {
      duration: MOBILE_SCROLL_EDGE_BAND_DURATION_MS,
      easing: Easing.out(Easing.cubic),
    }));
  }, [edge.height, height]);
  const animatedStyle = useAnimatedStyle(() => ({ height: height.value }));
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
      {edge.scrimAlpha > 0 ? (
        <ExploreGradient
          colors={edge.maskStops.map(([mask, offset]) => [
            nemuColorWithAlpha(tokens.background, maskAlpha(mask) * edge.scrimAlpha),
            offset,
          ] as const)}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
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
