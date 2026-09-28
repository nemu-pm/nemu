import type { ComponentType } from "react";
import { requireNativeViewManager, requireOptionalNativeModule } from "expo-modules-core";
import { Platform, View } from "react-native";
import type { GlassContainerProps, GlassViewProps } from "./types";

type NativeGlassProps = Omit<GlassViewProps, "cornerRadius" | "clear" | "concentricMinimum" | "interactive"> & {
  cornerRadius: number;
  clear: boolean;
  concentricMinimum: number;
  interactive: boolean;
};
type NativeContainerProps = Omit<GlassContainerProps, "spacing"> & { spacing: number };

const nativeModule = Platform.OS === "ios"
  ? requireOptionalNativeModule<{ glassViewHostsChildren?: boolean }>("NemuWindowLayout")
  : null;
// Only binaries whose glass view hosts React Native children (in the effect
// view's contentView) use it; anything older paints the fallback.
const available = nativeModule?.glassViewHostsChildren === true;
const NativeGlassView: ComponentType<NativeGlassProps> | null = available
  ? requireNativeViewManager<NativeGlassProps>("NemuWindowLayout", "NemuGlassView")
  : null;
const NativeGlassContainer: ComponentType<NativeContainerProps> | null = available
  ? requireNativeViewManager<NativeContainerProps>("NemuWindowLayout", "NemuGlassContainerView")
  : null;

/** True when `GlassView` renders native UIKit Liquid Glass (iOS binaries with the view). */
export const glassViewAvailable = NativeGlassView !== null;

/**
 * UIKit Liquid Glass (`UIGlassEffect`) hosting its children, like SwiftUI's
 * `.glassEffect(.regular.interactive(), in: .capsule)`. `cornerRadius` 0 =
 * capsule. Where unavailable it is a plain View — callers paint a fallback.
 */
export function GlassView({
  children,
  style,
  pointerEvents,
  tintColor,
  cornerRadius = 0,
  clear = false,
  concentricMinimum = 0,
  interactive = false,
  colorScheme,
}: GlassViewProps) {
  if (!NativeGlassView) return <View style={style} pointerEvents={pointerEvents}>{children}</View>;
  return (
    <NativeGlassView
      style={style}
      pointerEvents={pointerEvents}
      tintColor={tintColor}
      cornerRadius={cornerRadius}
      clear={clear}
      concentricMinimum={concentricMinimum}
      interactive={interactive}
      colorScheme={colorScheme}
    >
      {children}
    </NativeGlassView>
  );
}

/** `UIGlassContainerEffect` (SwiftUI `GlassEffectContainer`) around sibling glass views. */
export function GlassContainer({ children, style, pointerEvents, spacing = 0 }: GlassContainerProps) {
  if (!NativeGlassContainer) return <View style={style} pointerEvents={pointerEvents}>{children}</View>;
  return (
    <NativeGlassContainer style={style} pointerEvents={pointerEvents} spacing={spacing}>
      {children}
    </NativeGlassContainer>
  );
}
