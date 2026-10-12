import type { ReactNode } from "react";
import { Platform, StyleSheet } from "react-native";
import { usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ScrollEdgeEffectHost,
  scrollEdgeEffectSupportsProgressiveBlur,
} from "../../modules/nemu-scroll-edge-effect";
import { spacing } from "@/design-system";
import { shouldShowMobileFloatingTabBar } from "@/lib/mobileRootTabs";
import { resolveMobileBottomScrollEdgeEffect } from "@/lib/mobileScrollEdgeEffect";

/**
 * Wraps the root navigation stack so Android can blur what scrolls under the
 * floating tab bar (see `mobileScrollEdgeEffect.ts`). Enabled exactly while
 * the tab bar is shown; everywhere else — the reader, pushed flows without the
 * bar — the native host drops its RenderEffect and costs nothing.
 *
 * iOS renders the children untouched: its native tab bar owns the system
 * scroll edge effect, and an extra wrapper would only change the hierarchy.
 */
export function MobileScrollEdgeEffectHost({ children }: { children: ReactNode }) {
  if (Platform.OS !== "android") return <>{children}</>;
  return <AndroidScrollEdgeEffectHost>{children}</AndroidScrollEdgeEffectHost>;
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
});
