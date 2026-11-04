import { PlatformColor } from "react-native";

/**
 * Row colours for an iOS Form on the opaque grouped background
 * (`MobileNativeFormSheet` `background="grouped"`): the system label and
 * cell colours, which keep their contrast in light, dark and Increase
 * Contrast. iOS only — Android has no such named colours.
 */
export const nativeGroupedRowColors = {
  text: PlatformColor("label"),
  detail: PlatformColor("secondaryLabel"),
  rowBackground: PlatformColor("secondarySystemGroupedBackground"),
} as const;
