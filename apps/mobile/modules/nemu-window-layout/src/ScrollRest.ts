import { requireOptionalNativeModule } from "expo-modules-core";
import { Platform } from "react-native";

const nativeModule = Platform.OS === "ios"
  ? requireOptionalNativeModule<{ scrollToAdjustedTop?: (viewTag: number) => Promise<void> }>("NemuWindowLayout")
  : null;

/**
 * Puts a resting scroll view (by native tag) at its top for the inset it now
 * has. No-op on Android and on binaries built before it.
 */
export function scrollToAdjustedTop(viewTag: number): void {
  void nativeModule?.scrollToAdjustedTop?.(viewTag)?.catch(() => undefined);
}
