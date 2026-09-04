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
 * The system draws and sizes the chrome; we only choose the glyph.
 *
 * `@expo/ui`'s SwiftUI surface has no toolbar/`toolbarItem` binding (there is
 * no `toolbar` export under `@expo/ui/swift-ui`), so a sheet header action is
 * an ordinary `Button` styled the way the system styles bar buttons:
 * `.buttonStyle(.glass)` on iOS 26+ (the real Liquid Glass capsule — painting
 * the effect by hand onto a `borderless` button renders as a flat white disc),
 * `.bordered` before it, plus `.buttonBorderShape(.circle)` and
 * `.controlSize(.large)`. Pinning an explicit size on the label instead makes
 * the circle grow to that size plus the style's own padding, which is how it
 * ended up reading oversized; leaving the label unsized hands the measurement
 * back to SwiftUI.
 */
export function NemuNativeSheetHeaderAction({
  accessibilityLabel,
  iosSystemImage,
  badgeCount = 0,
  disabled = false,
  onPress,
}: NemuNativeSheetHeaderActionProps) {
  const { scheme, tokens } = useNemuTheme();
  const glass = supportsNemuLiquidGlassButtonStyle(Platform.Version);

  return (
    <View style={styles.root}>
      <SwiftHost colorScheme={scheme} style={styles.host}>
        <SwiftButton
          onPress={onPress}
          modifiers={[
            buttonStyle(glass ? "glass" : "bordered"),
            buttonBorderShape("circle"),
            controlSize("large"),
            tint(tokens.primary),
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
