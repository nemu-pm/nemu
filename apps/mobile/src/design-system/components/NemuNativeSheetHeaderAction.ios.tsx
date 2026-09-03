import {
  Button as SwiftButton,
  Host as SwiftHost,
  Image as SwiftImage,
} from "@expo/ui/swift-ui";
import {
  accessibilityLabel as swiftAccessibilityLabel,
  background,
  buttonStyle,
  contentShape,
  font,
  foregroundStyle,
  frame,
  glassEffect,
  opacity,
  shapes,
  strokeBorder,
  tint,
  disabled as swiftDisabled,
} from "@expo/ui/swift-ui/modifiers";
import { Platform, StyleSheet, Text, View } from "react-native";
import { nemuFontWeight } from "@/design/typography";
import { useNemuTheme } from "@/design/useNemuTheme";
import type { NemuNativeSheetHeaderActionProps } from "./NemuNativeSheetHeaderAction.types";

/** Full-size iOS control target; the glass circle fills it exactly. */
const CONTROL_SIZE = 44;
/** Matches the symbol weight UIKit uses for 44pt navigation-bar actions. */
const GLYPH_POINT_SIZE = 20;

function supportsLiquidGlass(): boolean {
  const major = Number.parseInt(String(Platform.Version).split(".")[0] ?? "0", 10);
  return Number.isFinite(major) && major >= 26;
}

/**
 * The chrome is sized on the *label*, never on the button.
 *
 * `buttonStyle('glass' | 'bordered')` draws its background around the label's
 * intrinsic size plus the style's own control padding, so a `frame` modifier on
 * the button only re-centers that small pill inside a larger invisible box —
 * which is why the circles rendered at ~32pt no matter what `controlSize` said.
 * Giving the label an explicit 44pt frame and painting the circle on it
 * (`glassEffect` on iOS 26+, a token-filled circle before that) makes the
 * visible control and the touch target the same fixed 44pt on every OS version.
 */
export function NemuNativeSheetHeaderAction({
  accessibilityLabel,
  iosSystemImage,
  badgeCount = 0,
  disabled = false,
  onPress,
}: NemuNativeSheetHeaderActionProps) {
  const { scheme, tokens } = useNemuTheme();
  const surfaceModifiers = supportsLiquidGlass()
    ? [
        glassEffect({
          glass: { variant: "regular", interactive: true },
          shape: "circle",
        }),
      ]
    : [
        background(tokens.toolbarAction, shapes.circle()),
        strokeBorder({
          color: tokens.toolbarActionBorder,
          shape: "circle",
        }),
      ];

  return (
    <View style={styles.root}>
      <SwiftHost colorScheme={scheme} style={styles.host}>
        <SwiftButton
          onPress={onPress}
          modifiers={[
            // `borderless` keeps the system press dimming without letting a
            // button style re-measure the label we just sized.
            buttonStyle("borderless"),
            tint(tokens.primary),
            swiftAccessibilityLabel(accessibilityLabel),
            ...(disabled ? [swiftDisabled(true)] : []),
          ]}
        >
          <SwiftImage
            systemName={iosSystemImage}
            modifiers={[
              font({ size: GLYPH_POINT_SIZE, weight: "semibold" }),
              foregroundStyle(tokens.primary),
              frame({ width: CONTROL_SIZE, height: CONTROL_SIZE }),
              ...surfaceModifiers,
              contentShape(shapes.circle()),
              // `.plain`-family styles do not dim a disabled label on their own.
              ...(disabled ? [opacity(0.48)] : []),
            ]}
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
    width: CONTROL_SIZE,
    height: CONTROL_SIZE,
  },
  host: {
    width: CONTROL_SIZE,
    height: CONTROL_SIZE,
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
