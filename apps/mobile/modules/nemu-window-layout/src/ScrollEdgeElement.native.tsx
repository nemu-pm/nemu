import { requireNativeViewManager, requireOptionalNativeModule } from "expo-modules-core";
import { Platform } from "react-native";
import type { ScrollEdgeElementProps } from "./ScrollEdgeElement";

const module = Platform.OS === "ios"
  ? requireOptionalNativeModule<{ scrollEdgeElementAvailable?: boolean }>("NemuWindowLayout")
  : null;
/**
 * Chrome over a scroll view's edge, or an empty view marking that edge: UIKit's
 * soft edge effect forms under it (iOS 26). Null where the binary has no such
 * view (Android, web, an old build).
 */
export const ScrollEdgeElement = module?.scrollEdgeElementAvailable
  ? requireNativeViewManager<ScrollEdgeElementProps>("NemuWindowLayout", "NemuScrollEdgeElementView")
  : null;
