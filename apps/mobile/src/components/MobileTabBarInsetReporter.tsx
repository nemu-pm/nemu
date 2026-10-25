import { useCallback } from "react";
import { Platform, StyleSheet } from "react-native";
import { WindowLayoutObserver } from "../../modules/nemu-window-layout";
import type { MobileWindowLayout } from "@/lib/mobileWindowLayout";
import { reportMobileBottomTabBarInset } from "@/lib/mobileBottomTabBarInset";

/**
 * Invisible observer mounted inside each iOS tab's stack layout. Its bottom
 * safe-area inset is the native tab bar's height plus the home indicator,
 * which it publishes for app-wide overlays (`MobileToastProvider`).
 */
export function MobileTabBarInsetReporter() {
  const onLayoutChange = useCallback((layout: MobileWindowLayout) => {
    reportMobileBottomTabBarInset(layout.safeAreaInsets?.bottom);
  }, []);
  if (Platform.OS !== "ios") return null;
  return (
    <WindowLayoutObserver
      style={StyleSheet.absoluteFill}
      onLayoutChange={onLayoutChange}
    />
  );
}
