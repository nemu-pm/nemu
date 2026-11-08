import type { ComponentType } from "react";
import { requireNativeViewManager, requireOptionalNativeModule } from "expo-modules-core";
import { Platform, StyleSheet } from "react-native";

type NativeProps = { shown: boolean; durationMs: number; pointerEvents?: "none"; style?: unknown };

const nativeModule = Platform.OS === "ios"
  ? requireOptionalNativeModule<{ barItemsFadeViewAvailable?: boolean }>("NemuWindowLayout")
  : null;
const NativeBarItemsFade: ComponentType<NativeProps> | null =
  nativeModule?.barItemsFadeViewAvailable === true
    ? requireNativeViewManager<NativeProps>("NemuWindowLayout", "NemuBarItemsFadeView")
    : null;

/**
 * Mounted in a screen with system bar items: when `shown` turns on, the bar
 * fades in over `durationMs` on UIKit's ease-out instead of popping in.
 * Hiding is left to the system. No-op without the native view.
 */
export default function BarItemsFade({ shown, durationMs }: { shown: boolean; durationMs: number }) {
  if (!NativeBarItemsFade) return null;
  return <NativeBarItemsFade shown={shown} durationMs={durationMs} pointerEvents="none" style={styles.hidden} />;
}

const styles = StyleSheet.create({
  hidden: { position: "absolute", width: 0, height: 0 },
});
