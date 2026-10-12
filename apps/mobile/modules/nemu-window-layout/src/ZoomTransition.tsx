import type { ReactNode } from "react";
import { View, type ViewProps } from "react-native";

/** No native zoom here (see ZoomTransition.native.tsx). */
export const zoomTransitionAvailable = false;
export const zoomSettledEventAvailable = false;

export function ZoomSource({ style, children }: { zoomId: string; style?: ViewProps["style"]; children?: ReactNode }) {
  return <View style={style}>{children}</View>;
}

export function ZoomTarget({
  style,
  children,
}: {
  zoomId: string;
  align?: boolean;
  interactiveDismiss?: boolean;
  onZoomSettled?: () => void;
  style?: ViewProps["style"];
  children?: ReactNode;
}) {
  return <View style={style}>{children}</View>;
}

export function ContentScrollMarker(_props: { generation?: number }) {
  void _props;
  return null;
}
