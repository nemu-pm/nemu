import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";

/** Web / fallback: there is no system vertical bar. */
export const barAxisViewsAvailable = false;

export default function VerticalBarOnlyLeadingItems() {
  return null;
}

export function BarAxisVisibility({
  fallbackShown,
  children,
}: {
  axis: "horizontal" | "vertical";
  fallbackShown: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  return fallbackShown ? <>{children}</> : null;
}
