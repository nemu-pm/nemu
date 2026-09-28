import type Ionicons from "@expo/vector-icons/Ionicons";

export type NemuNativeSheetHeaderActionProps = {
  accessibilityLabel: string;
  androidIcon: keyof typeof Ionicons.glyphMap;
  iosSystemImage: "line.3.horizontal.decrease" | "xmark" | "chevron.backward";
  badgeCount?: number;
  disabled?: boolean;
  onPress: () => void;
};
