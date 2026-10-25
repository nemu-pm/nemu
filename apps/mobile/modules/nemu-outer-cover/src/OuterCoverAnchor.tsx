import type { ComponentType } from "react";
import { requireNativeViewManager, requireOptionalNativeModule } from "expo-modules-core";
import { Platform, StyleSheet } from "react-native";

type NativeProps = {
  active: boolean;
  pointerEvents?: "none";
  style?: unknown;
};

const nativeModule = Platform.OS === "ios"
  ? requireOptionalNativeModule<{ outerCoverAvailable?: boolean }>("NemuOuterCover")
  : null;

const NativeOuterCoverAnchor: ComponentType<NativeProps> | null =
  nativeModule?.outerCoverAvailable === true
    ? requireNativeViewManager<NativeProps>("NemuOuterCover")
    : null;

/**
 * Mount once in the reader screen. Its view controller is the one the
 * camera capture accessory registers on, and the camera never runs while no
 * active anchor is in a window (or while its hinge reports closed).
 */
export default function OuterCoverAnchor({ active }: { active: boolean }) {
  if (!NativeOuterCoverAnchor) return null;
  return <NativeOuterCoverAnchor active={active} pointerEvents="none" style={styles.hidden} />;
}

const styles = StyleSheet.create({
  hidden: { position: "absolute", width: 0, height: 0 },
});
