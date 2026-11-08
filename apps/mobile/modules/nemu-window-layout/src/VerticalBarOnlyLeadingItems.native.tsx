import type { ComponentType, ReactNode } from "react";
import { requireNativeViewManager, requireOptionalNativeModule } from "expo-modules-core";
import { Platform, StyleSheet, type StyleProp, type ViewStyle } from "react-native";

type NativeProps = { style?: unknown; pointerEvents?: "none" };
type AxisProps = { axis: "horizontal" | "vertical"; style?: StyleProp<ViewStyle>; pointerEvents?: "box-none"; children?: ReactNode };

const nativeModule = Platform.OS === "ios"
  ? requireOptionalNativeModule<{
      verticalBarOnlyLeadingItemsViewAvailable?: boolean;
      barAxisViewsVersion?: number;
    }>("NemuWindowLayout")
  : null;
// A binary built before the view existed keeps the JS-timed removal alone.
const NativeVerticalBarOnlyLeadingItems: ComponentType<NativeProps> | null =
  nativeModule?.verticalBarOnlyLeadingItemsViewAvailable === true
    ? requireNativeViewManager<NativeProps>("NemuWindowLayout", "NemuVerticalBarOnlyLeadingItemsView")
    : null;

/**
 * True when the native side keeps a screen's leading items out of every
 * horizontal bar and re-hides them when react-native-screens rebuilds them,
 * and `BarAxisVisibility` follows the bar axis natively: a screen may then
 * keep its vertical-bar items (and its top-bar stand-ins) mounted in both
 * axes, so a pose change swaps them in the frame the bar turns.
 */
export const barAxisViewsAvailable = (nativeModule?.barAxisViewsVersion ?? 0) >= 2;

const NativeBarAxisVisibility: ComponentType<AxisProps> | null = barAxisViewsAvailable
  ? requireNativeViewManager<AxisProps>("NemuWindowLayout", "NemuBarAxisVisibilityView")
  : null;

/**
 * While mounted, the leading (`Stack.Toolbar placement="left"`) items of the
 * screen it is in show only while the system bars are vertical (iOS 27.1+,
 * `UITraitCollection.verticalBarEdge`). The native side hides and shows them
 * from the trait change, a size transition's animation and every rebuild of
 * the items, ahead of React. Mount it together with those items. No-op on
 * Android and web.
 */
export default function VerticalBarOnlyLeadingItems() {
  if (!NativeVerticalBarOnlyLeadingItems) return null;
  return <NativeVerticalBarOnlyLeadingItems pointerEvents="none" style={styles.hidden} />;
}

/**
 * Its children show only while the system bars are on `axis`, switched
 * natively in the frame the bar turns. Without the native view (Android,
 * web, an older binary) it shows them when `fallbackShown`.
 */
export function BarAxisVisibility({
  axis,
  fallbackShown,
  style,
  children,
}: {
  axis: "horizontal" | "vertical";
  fallbackShown: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  if (!NativeBarAxisVisibility) return fallbackShown ? <>{children}</> : null;
  return (
    <NativeBarAxisVisibility axis={axis} style={style} pointerEvents="box-none">
      {children}
    </NativeBarAxisVisibility>
  );
}

const styles = StyleSheet.create({
  hidden: { position: "absolute", width: 0, height: 0 },
});
