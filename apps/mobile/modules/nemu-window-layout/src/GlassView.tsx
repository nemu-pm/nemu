import { View } from "react-native";
import type { GlassContainerProps, GlassViewProps } from "./types";

/** Web / fallback: no native glass; callers paint their own surface. */
export const glassViewAvailable = false;

/** No native host here (see GlassView.native.tsx). */
export const NativeGlassViewHost = null;

/** Plain view: callers style the painted fallback themselves. */
export function GlassView({ children, style, pointerEvents }: GlassViewProps) {
  return <View style={style} pointerEvents={pointerEvents}>{children}</View>;
}

export function GlassContainer({ children, style, pointerEvents }: GlassContainerProps) {
  return <View style={style} pointerEvents={pointerEvents}>{children}</View>;
}
