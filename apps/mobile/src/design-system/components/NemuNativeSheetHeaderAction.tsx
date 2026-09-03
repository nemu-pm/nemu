import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, Text, View } from "react-native";
import { nemuFontWeight } from "@/design/typography";
import { useNemuTheme } from "@/design/useNemuTheme";
import { NemuPressable } from "./NemuPressable";
import type { NemuNativeSheetHeaderActionProps } from "./NemuNativeSheetHeaderAction.types";

export function NemuNativeSheetHeaderAction({
  accessibilityLabel,
  androidIcon,
  badgeCount = 0,
  disabled = false,
  onPress,
}: NemuNativeSheetHeaderActionProps) {
  const { tokens } = useNemuTheme();

  return (
    <View style={styles.root}>
      <NemuPressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        hapticFeedback="none"
        minimumTouchTarget
        onPress={onPress}
        pressProfile="icon"
        style={[styles.action, { opacity: disabled ? 0.48 : 1 }]}
      >
        <Ionicons
          accessibilityElementsHidden
          importantForAccessibility="no"
          name={androidIcon}
          size={21}
          color={tokens.primary}
        />
      </NemuPressable>
      {badgeCount > 0 ? (
        <View
          pointerEvents="none"
          style={[styles.badge, { backgroundColor: tokens.primary }]}
        >
          <Text style={[styles.badgeText, { color: tokens.primaryForeground }]}>
            {Math.min(badgeCount, 99)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: 48,
    height: 48,
  },
  action: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: 1,
    right: 0,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    paddingHorizontal: 4,
  },
  badgeText: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: nemuFontWeight.semibold,
  },
});
