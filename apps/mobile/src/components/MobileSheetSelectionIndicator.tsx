import type { StyleProp, ViewStyle } from "react-native";
import { View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { nemuSheetMetrics, useNemuTheme } from "@/design-system";

/**
 * The checkbox / radio glyph drawn inside a custom sheet row (the row itself
 * is the pressable). iOS keeps each caller's approved indicator (`iosStyle`:
 * size, radius, hairline outline) untouched. Android draws the Material 3
 * control from `nemuSheetMetrics` — an 18dp checkbox / 20dp radio with a 2dp
 * onSurfaceVariant outline — because the hairline `border` outline vanished
 * against the muted row fill and left an empty gap where the control was.
 */
export function MobileSheetSelectionIndicator({
  kind,
  checked,
  color,
  iosStyle,
  iosUncheckedBorderColor,
  iosGlyphSize = 13,
}: {
  kind: "checkbox" | "radio";
  checked: boolean;
  /** Selected colour (primary, or danger for destructive choices). */
  color: string;
  iosStyle: StyleProp<ViewStyle>;
  /** iOS unchecked outline; defaults to the `border` token. */
  iosUncheckedBorderColor?: string;
  iosGlyphSize?: number;
}) {
  const { tokens } = useNemuTheme();
  const material =
    kind === "checkbox" ? nemuSheetMetrics.checkbox : nemuSheetMetrics.radio;

  if (!material) {
    return (
      <View
        style={[
          iosStyle,
          {
            backgroundColor: checked ? color : "transparent",
            borderColor: checked
              ? color
              : (iosUncheckedBorderColor ?? tokens.border),
          },
        ]}
      >
        {checked ? (
          <Ionicons
            name="checkmark"
            size={iosGlyphSize}
            color={tokens.primaryForeground}
          />
        ) : null}
      </View>
    );
  }

  const filled = kind === "checkbox" && checked;
  return (
    <View
      style={{
        width: material.size,
        height: material.size,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: material.borderRadius,
        borderWidth: material.borderWidth,
        borderColor: checked ? color : tokens.mutedForeground,
        backgroundColor: filled ? color : "transparent",
      }}
    >
      {filled ? (
        <Ionicons
          name="checkmark"
          size={material.glyphSize}
          color={tokens.primaryForeground}
        />
      ) : null}
      {kind === "radio" && checked ? (
        <View
          style={{
            width: material.dotSize,
            height: material.dotSize,
            borderRadius: material.dotSize / 2,
            backgroundColor: color,
          }}
        />
      ) : null}
    </View>
  );
}
