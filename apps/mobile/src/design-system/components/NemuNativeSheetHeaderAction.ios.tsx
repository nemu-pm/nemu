import {
  Button as SwiftButton,
  Host as SwiftHost,
  Image as SwiftImage,
} from "@expo/ui/swift-ui";
import {
  accessibilityLabel as swiftAccessibilityLabel,
  buttonBorderShape,
  buttonStyle,
  controlSize,
  frame,
  tint,
  disabled as swiftDisabled,
} from "@expo/ui/swift-ui/modifiers";
import { Platform, StyleSheet, Text, View } from "react-native";
import { nemuFontWeight } from "@/design/typography";
import { useNemuTheme } from "@/design/useNemuTheme";
import type { NemuNativeSheetHeaderActionProps } from "./NemuNativeSheetHeaderAction.types";

function supportsLiquidGlass(): boolean {
  const major = Number.parseInt(String(Platform.Version).split(".")[0] ?? "0", 10);
  return Number.isFinite(major) && major >= 26;
}

export function NemuNativeSheetHeaderAction({
  accessibilityLabel,
  iosSystemImage,
  badgeCount = 0,
  disabled = false,
  onPress,
}: NemuNativeSheetHeaderActionProps) {
  const { scheme, tokens } = useNemuTheme();

  return (
    <View style={styles.root}>
      <SwiftHost colorScheme={scheme} style={styles.host}>
        <SwiftButton
          onPress={onPress}
          modifiers={[
            buttonStyle(supportsLiquidGlass() ? "glass" : "bordered"),
            buttonBorderShape("circle"),
            controlSize("regular"),
            frame({ width: 44, height: 44 }),
            tint(tokens.primary),
            swiftAccessibilityLabel(accessibilityLabel),
            ...(disabled ? [swiftDisabled(true)] : []),
          ]}
        >
          <SwiftImage
            systemName={iosSystemImage}
            size={17}
            color={tokens.primary}
          />
        </SwiftButton>
      </SwiftHost>
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
    width: 44,
    height: 44,
  },
  host: {
    width: 44,
    height: 44,
  },
  badge: {
    position: "absolute",
    top: -1,
    right: -3,
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
