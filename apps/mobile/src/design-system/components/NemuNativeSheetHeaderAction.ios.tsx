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
  font,
  tint,
  disabled as swiftDisabled,
} from "@expo/ui/swift-ui/modifiers";
import { Platform, StyleSheet, Text, View } from "react-native";
import { supportsNemuLiquidGlassButtonStyle } from "@/lib/nemuLiquidGlass";
import { mobileDesignExploreFlag } from "@/lib/mobileDesignExplore";
import { nemuFontWeight } from "@/design/typography";
import { useNemuTheme } from "@/design/useNemuTheme";
import type { NemuNativeSheetHeaderActionProps } from "./NemuNativeSheetHeaderAction.types";

/**
 * Reserved box for the control plus its badge. The glass circle itself is
 * measured by SwiftUI (see below) and sits centred inside this box, so this is
 * a layout allowance, not the control's size.
 */
const CONTROL_BOX = 44;
/**
 * Navigation-bar glyph metrics. 20pt medium keeps the filter / close symbols
 * from reading undersized inside `.controlSize(.large)`'s ~40pt glass circle
 * (the UIKit bar-button default of 17pt was too small per owner review);
 * Android's bare 48dp target draws its own glyph at 22 in
 * `NemuNativeSheetHeaderAction.tsx`. `.controlSize(.large)` still pads the
 * circle out to the system's size, so only the glyph moves.
 */
const GLYPH_POINT_SIZE = 20;

/**
 * Sets the header action's glyph; the system draws the Liquid Glass chrome
 * around it (a glass button style, circle, large control size).
 */
export function NemuNativeSheetHeaderAction({
  accessibilityLabel,
  iosSystemImage,
  prominent = false,
  badgeCount = 0,
  disabled = false,
  onPress,
}: NemuNativeSheetHeaderActionProps) {
  const { scheme, tokens } = useNemuTheme();
  const glass = supportsNemuLiquidGlassButtonStyle(Platform.Version);
  const chrome = glass ? "glass" : "bordered";
  // The sheet's confirming action (Save / Done): the accent-filled circle the
  // system draws for a `confirmationAction` toolbar item.
  const prominentChrome = glass ? "glassProminent" : "borderedProminent";

  return (
    <View style={styles.root}>
      <SwiftHost colorScheme={scheme} style={styles.host}>
        <SwiftButton
          onPress={onPress}
          modifiers={[
            buttonStyle(prominent ? prominentChrome : chrome),
            buttonBorderShape("circle"),
            controlSize("large"),
            // Design-explore: bar items take the label colour (the close X,
            // a filter); only the confirming action carries the accent. Set
            // outright: a host that seeds the accent (the reader's Plugins
            // sheet) would otherwise hand it down to this button.
            tint(prominent || !mobileDesignExploreFlag ? tokens.primary : tokens.foreground),
            swiftAccessibilityLabel(accessibilityLabel),
            ...(disabled ? [swiftDisabled(true)] : []),
          ]}
        >
          <SwiftImage
            systemName={iosSystemImage}
            modifiers={[font({ size: GLYPH_POINT_SIZE, weight: "medium" })]}
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
    width: CONTROL_BOX,
    height: CONTROL_BOX,
    alignItems: "center",
    justifyContent: "center",
  },
  host: {
    width: CONTROL_BOX,
    height: CONTROL_BOX,
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
