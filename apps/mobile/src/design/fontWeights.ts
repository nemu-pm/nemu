import type { TextStyle } from "react-native";

/**
 * Font weight tokens. Kept free of `react-native` runtime imports so pure
 * metric tables (`sheetMetrics.ts`) and their tests can use them; re-exported
 * from `typography.ts`.
 */
export const nemuFontWeight = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
} as const satisfies Record<string, TextStyle["fontWeight"]>;
