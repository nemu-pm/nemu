import { requireNativeViewManager, requireOptionalNativeModule } from "expo-modules-core";
import { Platform, type ViewProps } from "react-native";

type Props = ViewProps & {
  /** 0…100, as expo-blur's `intensity`. */
  intensity: number;
  /** An expo-blur tint name (`systemUltraThinMaterialDark`, …). */
  tint: string;
};
const module = Platform.OS === "ios"
  ? requireOptionalNativeModule<{ blurViewAvailable?: boolean }>("NemuWindowLayout")
  : null;
/**
 * A partial-intensity blur that re-applies its effect whenever it is on
 * screen without one (expo-blur's BlurView could stay empty from launch).
 * Null where the binary has no such view (Android, web, an old build).
 */
export const NativeBlurView = module?.blurViewAvailable
  ? requireNativeViewManager<Props>("NemuWindowLayout", "NemuBlurView")
  : null;
