import type { ComponentType } from "react";
import { requireNativeViewManager, requireOptionalNativeModule } from "expo-modules-core";
import { Platform, StyleSheet } from "react-native";

type NativeProps = { style?: unknown; pointerEvents?: "none" };

const nativeModule = Platform.OS === "ios"
  ? requireOptionalNativeModule<{ verticalBarOnlyLeadingItemsViewAvailable?: boolean }>("NemuWindowLayout")
  : null;
// A binary built before the view existed keeps the JS-timed removal alone.
const NativeVerticalBarOnlyLeadingItems: ComponentType<NativeProps> | null =
  nativeModule?.verticalBarOnlyLeadingItemsViewAvailable === true
    ? requireNativeViewManager<NativeProps>("NemuWindowLayout", "NemuVerticalBarOnlyLeadingItemsView")
    : null;

/**
 * While mounted, the leading (`Stack.Toolbar placement="left"`) items of the
 * screen it is in show only while the system bars are vertical (iOS 27.1+,
 * `UITraitCollection.verticalBarEdge`). The native side hides them from the
 * trait change itself, in the frame the bar turns horizontal, ahead of the
 * React commit that removes them. Mount it together with those items. No-op
 * on Android, web and older iOS.
 */
export default function VerticalBarOnlyLeadingItems() {
  if (!NativeVerticalBarOnlyLeadingItems) return null;
  return <NativeVerticalBarOnlyLeadingItems pointerEvents="none" style={styles.hidden} />;
}

const styles = StyleSheet.create({
  hidden: { position: "absolute", width: 0, height: 0 },
});
