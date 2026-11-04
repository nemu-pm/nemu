import type { ComponentType } from "react";
import type { ViewProps } from "react-native";
export type NativeBlurViewProps = ViewProps & {
  intensity: number;
  tint: string;
};
export const NativeBlurView = null as ComponentType<NativeBlurViewProps> | null;
