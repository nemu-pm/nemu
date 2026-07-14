import { Platform, type ViewStyle } from "react-native";
import {
  createNemuShadowStyleForPlatform,
  type NemuShadowStyleOptions,
} from "./shadowStyles";

export type { NemuShadowStyleOptions };

export function createNemuShadowStyle(
  options: NemuShadowStyleOptions,
  platform: typeof Platform.OS = Platform.OS,
): ViewStyle {
  return createNemuShadowStyleForPlatform(options, platform) as ViewStyle;
}
