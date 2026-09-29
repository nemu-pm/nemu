import { requireNativeViewManager } from "expo-modules-core";
import { StyleSheet, type NativeSyntheticEvent } from "react-native";
import type { SheetProgressObserverProps } from "./SheetProgressObserver";

const NativeObserver = requireNativeViewManager<{
  style: object;
  pointerEvents: "none";
  onProgress: (event: NativeSyntheticEvent<{ progress: number }>) => void;
}>("NemuWindowLayout", "NemuSheetProgressView");

/** Lives inside the sheet; samples its actual presentation, including interactive drags. */
export default function SheetProgressObserver({ onProgress }: SheetProgressObserverProps) {
  return <NativeObserver style={styles.probe} pointerEvents="none"
    onProgress={(event) => onProgress(event.nativeEvent.progress)} />;
}
const styles = StyleSheet.create({ probe: { position: "absolute", width: 1, height: 1 } });
