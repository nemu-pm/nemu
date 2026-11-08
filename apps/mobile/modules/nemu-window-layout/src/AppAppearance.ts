import { requireOptionalNativeModule } from "expo-modules-core";
import { Platform } from "react-native";

export type AppAppearance = "light" | "dark" | "unspecified";

type NativeModule = { setAppAppearance?: (appearance: AppAppearance) => Promise<void> };

const nativeModule = Platform.OS === "ios"
  ? requireOptionalNativeModule<NativeModule>("NemuWindowLayout")
  : null;

/**
 * The app's own light / dark choice for every UIKit surface (iOS): sets
 * `overrideUserInterfaceStyle` on every window of every connected scene —
 * windows created later included — so system bars, tab bars, the vertical
 * bar, sheets, menus and every Liquid Glass surface resolve from the in-app
 * theme instead of the system appearance. "unspecified" follows the system.
 * The choice is remembered natively and re-applied at the next launch before
 * any JS runs. No-op on Android, web and binaries built before it existed.
 */
export function setAppAppearance(appearance: AppAppearance): void {
  void nativeModule?.setAppAppearance?.(appearance)?.catch(() => undefined);
}
