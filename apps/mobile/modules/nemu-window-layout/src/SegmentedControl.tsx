import type { ComponentType } from "react";
import type { ViewProps } from "react-native";
export type NativeSegmentedControlProps = ViewProps & {
  labels: string[];
  selectedIndex: number;
  selectionColor: string;
  textColor: string;
  selectedTextColor: string;
  onSelectionChange: (event: { nativeEvent: { selectedIndex: number } }) => void;
};
export const NativeSegmentedControl = null as ComponentType<NativeSegmentedControlProps> | null;
