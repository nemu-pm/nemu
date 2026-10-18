import { useEffect, useState } from "react";
import { View } from "react-native";
import type { WindowLayoutObserverProps } from "./types";

/** Android/web fallback: reports actual container bounds, never infers a hinge. */
export default function WindowLayoutObserver({ style, enabled = true, onLayoutChange }: WindowLayoutObserverProps) {
  const [bounds, setBounds] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    if (enabled && bounds) {
      onLayoutChange({ ...bounds, supported: false, divisions: [], occlusions: [] });
    }
  }, [bounds, enabled, onLayoutChange]);
  return <View style={style} pointerEvents="none" accessible={false} onLayout={(event) => {
    const { width, height } = event.nativeEvent.layout;
    setBounds((previous) => previous?.width === width && previous.height === height ? previous : { width, height });
  }} />;
}
