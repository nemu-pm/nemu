import { requireNativeViewManager } from "expo-modules-core";
import { StyleSheet, type NativeSyntheticEvent } from "react-native";
import type { SheetProgressObserverProps } from "./SheetProgressObserver";

const NativeObserver = requireNativeViewManager<{
  style: object;
  pointerEvents: "none";
  visible: boolean;
  onProgress: (event: NativeSyntheticEvent<{ progress: number }>) => void;
}>("NemuWindowLayout", "NemuSheetProgressView");

/**
 * Lives inside the sheet; samples its actual presentation, including
 * interactive drags. `visible` only wakes the native sampler for a
 * programmatic dismiss; the progress itself always comes from UIKit.
 */
export default function SheetProgressObserver({ visible, onProgress }: SheetProgressObserverProps) {
  return <NativeObserver style={styles.probe} pointerEvents="none" visible={visible}
    onProgress={(event) => onProgress(event.nativeEvent.progress)} />;
}
const styles = StyleSheet.create({ probe: { position: "absolute", width: 1, height: 1 } });
