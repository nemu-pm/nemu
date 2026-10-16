import type { ComponentType, ReactElement, ReactNode } from "react";
import { Platform, StyleSheet } from "react-native";
import { BlurView } from "expo-blur";
import RNCMaskedView from "@react-native-masked-view/masked-view";
import { usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ScrollEdgeEffectHost,
  scrollEdgeEffectSupportsProgressiveBlur,
} from "../../modules/nemu-scroll-edge-effect";
import { spacing, useNemuTheme } from "@/design-system";
import { ExploreGradient } from "@/components/explore/ExploreGradient";
import { isMobileReaderRoute, shouldShowMobileFloatingTabBar } from "@/lib/mobileRootTabs";
import {
  MOBILE_RAIL_TOP_EDGE_BLUR_INTENSITY,
  resolveMobileBottomScrollEdgeEffect,
  resolveMobileRailTopScrollEdge,
} from "@/lib/mobileScrollEdgeEffect";
import { useMobileAdaptiveLayout } from "@/lib/MobileWindowLayoutContext";

// Its types are built against another copy of React's types.
const MaskedView = RNCMaskedView as unknown as ComponentType<{
  maskElement: ReactElement;
  children: ReactNode;
  pointerEvents?: "none";
  style?: object;
}>;

/**
 * Wraps the root navigation stack so Android can blur what scrolls under the
 * floating tab bar (see `mobileScrollEdgeEffect.ts`). Enabled exactly while
 * the tab bar is shown; everywhere else — the reader, pushed flows without the
 * bar — the native host drops its RenderEffect and costs nothing.
 *
 * iOS renders the children untouched (its native bars own the system scroll
 * edge effects; an extra wrapper would only change the hierarchy) and, beside
 * the Duo's vertical bar, where no bar floats over the page top, draws the
 * top edge itself as a sibling band (`resolveMobileRailTopScrollEdge`).
 */
export function MobileScrollEdgeEffectHost({ children }: { children: ReactNode }) {
  if (Platform.OS === "ios") {
    return (
      <>
        {children}
        <IosRailTopScrollEdge />
      </>
    );
  }
  if (Platform.OS !== "android") return <>{children}</>;
  return <AndroidScrollEdgeEffectHost>{children}</AndroidScrollEdgeEffectHost>;
}

function IosRailTopScrollEdge() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { scheme } = useNemuTheme();
  const { verticalBarSide } = useMobileAdaptiveLayout();
  const edge = resolveMobileRailTopScrollEdge({
    platform: Platform.OS,
    verticalBarSide,
    safeAreaTop: insets.top,
    pageTop: spacing.pageTop,
    reader: isMobileReaderRoute(pathname),
  });
  if (edge.height <= 0) return null;
  return (
    <MaskedView
      pointerEvents="none"
      style={[styles.topEdge, { height: edge.height }]}
      maskElement={<ExploreGradient colors={edge.maskStops} style={StyleSheet.absoluteFill} />}
    >
      <BlurView
        intensity={MOBILE_RAIL_TOP_EDGE_BLUR_INTENSITY}
        tint={scheme === "dark" ? "systemUltraThinMaterialDark" : "systemUltraThinMaterialLight"}
        style={StyleSheet.absoluteFill}
      />
    </MaskedView>
  );
}

function AndroidScrollEdgeEffectHost({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const effect = resolveMobileBottomScrollEdgeEffect({
    bottomInset: insets.bottom,
    tabBottom: spacing.tabBottom,
    blurAvailable: scrollEdgeEffectSupportsProgressiveBlur,
  });

  return (
    <ScrollEdgeEffectHost
      blurExponent={effect.blurExponent}
      bottomEdgeHeight={effect.height}
      enabled={shouldShowMobileFloatingTabBar(pathname)}
      maxBlurRadius={effect.maxBlurRadius}
      style={styles.host}
    >
      {children}
    </ScrollEdgeEffectHost>
  );
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
  },
  topEdge: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
});
