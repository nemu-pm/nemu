import type { ComponentType } from "react";
import { requireNativeViewManager, requireOptionalNativeModule } from "expo-modules-core";
import { Platform, StyleSheet } from "react-native";
import type { VerticalBarBehaviorProps } from "./types";

type NativeProps = { disabled: boolean; appearance?: "dark" | "light"; style?: unknown; pointerEvents?: "none" };

const nativeModule = Platform.OS === "ios"
  ? requireOptionalNativeModule<{ verticalBarBehaviorViewAvailable?: boolean }>("NemuWindowLayout")
  : null;
// Only iOS has vertical bars. A binary built before the view existed keeps
// the system default (automatic) instead of crashing on an unknown view.
const NativeVerticalBarBehavior: ComponentType<NativeProps> | null =
  nativeModule?.verticalBarBehaviorViewAvailable === true
    ? requireNativeViewManager<NativeProps>("NemuWindowLayout", "NemuVerticalBarBehaviorView")
    : null;

/**
 * Declares the screen this is mounted in prefers `UIVerticalBarBehavior.disabled`
 * (iOS 27.1+): horizontal status bar, no vertical bar safe-area inset. Mount
 * once per screen for the screen's lifetime (Apple: a stable choice, never
 * toggled with view state). No-op on Android, web and older iOS.
 */
export default function VerticalBarBehavior({ disabled, appearance }: VerticalBarBehaviorProps) {
  if (!NativeVerticalBarBehavior) return null;
  return <NativeVerticalBarBehavior disabled={disabled} appearance={appearance} pointerEvents="none" style={styles.hidden} />;
}

const styles = StyleSheet.create({
  hidden: { position: "absolute", width: 0, height: 0 },
});
