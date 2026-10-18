import { requireNativeViewManager, requireOptionalNativeModule } from "expo-modules-core";
import { Platform, type ViewProps } from "react-native";

type Props = ViewProps & {
  labels: string[];
  selectedIndex: number;
  selectionColor: string;
  textColor: string;
  selectedTextColor: string;
  onSelectionChange: (event: { nativeEvent: { selectedIndex: number } }) => void;
};
const module = Platform.OS === "ios"
  ? requireOptionalNativeModule<{ segmentedControlViewAvailable?: boolean }>("NemuWindowLayout")
  : null;
export const NativeSegmentedControl = module?.segmentedControlViewAvailable
  ? requireNativeViewManager<Props>("NemuWindowLayout", "NemuSegmentedControlView")
  : null;
