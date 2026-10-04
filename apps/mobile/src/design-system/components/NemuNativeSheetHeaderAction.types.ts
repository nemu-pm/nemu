import type Ionicons from "@expo/vector-icons/Ionicons";

export type NemuNativeSheetHeaderActionProps = {
  accessibilityLabel: string;
  androidIcon: keyof typeof Ionicons.glyphMap;
  iosSystemImage: "line.3.horizontal.decrease" | "xmark" | "chevron.backward" | "checkmark";
  /**
   * The sheet's confirming action (Save / Done): iOS draws it as the
   * accent-filled prominent glass circle, as the system does for a
   * `confirmationAction` toolbar item. Android keeps the accent glyph.
   */
  prominent?: boolean;
  badgeCount?: number;
  disabled?: boolean;
  onPress: () => void;
};
