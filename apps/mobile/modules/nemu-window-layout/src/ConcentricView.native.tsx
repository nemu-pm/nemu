import { requireNativeViewManager, requireOptionalNativeModule } from "expo-modules-core";
import { Platform, View } from "react-native";
import type { ConcentricViewProps } from "./ConcentricView";
const available = Platform.OS === "ios" && requireOptionalNativeModule<{ concentricViewAvailable?: boolean }>("NemuWindowLayout")?.concentricViewAvailable;
const NativeView = available ? requireNativeViewManager<ConcentricViewProps>("NemuWindowLayout", "NemuConcentricView") : null;
export function ConcentricView({ minimumRadius = 8, style, ...props }: ConcentricViewProps) {
  return NativeView
    ? <NativeView {...props} minimumRadius={minimumRadius} style={style} />
    : <View {...props} style={[style, { borderRadius: minimumRadius, overflow: "hidden" }]} />;
}
