import type { ComponentType, ReactNode } from "react";
import { Platform, View, type StyleProp, type ViewStyle } from "react-native";
import {
  requireNativeViewManager,
  requireOptionalNativeModule,
} from "expo-modules-core";

export type ScrollEdgeEffectHostProps = {
  /** Applies the progressive blur while true; a plain container otherwise. */
  enabled: boolean;
  /** Height (dp) of the bottom band the blur ramps across. */
  bottomEdgeHeight: number;
  /** Blur radius (dp) at the very bottom edge. */
  maxBlurRadius: number;
  /** Ease-in exponent of the radius ramp (1 = linear). */
  blurExponent: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

type NativeModuleShape = { supportsProgressiveBlur?: boolean };

// Android only. iOS (the native tab bar owns its edge effect), web, and an
// Android binary built before this module existed get a plain View.
const nativeModule =
  Platform.OS === "android"
    ? requireOptionalNativeModule<NativeModuleShape>("NemuScrollEdgeEffect")
    : null;

const NativeHost: ComponentType<ScrollEdgeEffectHostProps> | null = nativeModule
  ? requireNativeViewManager("NemuScrollEdgeEffect")
  : null;

/** True when the native host can blur (Android 13+ with the module linked). */
export const scrollEdgeEffectSupportsProgressiveBlur =
  nativeModule?.supportsProgressiveBlur === true;

export default function ScrollEdgeEffectHost({
  style,
  children,
  ...effect
}: ScrollEdgeEffectHostProps) {
  if (!NativeHost) return <View style={style}>{children}</View>;
  return (
    <NativeHost style={style} {...effect}>
      {children}
    </NativeHost>
  );
}
