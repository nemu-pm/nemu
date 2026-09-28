import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { GlassView, glassViewAvailable } from "../../../modules/nemu-window-layout";

/**
 * Reader capsule chrome palette. The reader is an immersive black surface, so
 * its regular-width capsules and the notebook console are always dark — a
 * white slab over manga pages is what the owner rejected — regardless of the
 * app theme. The phone chrome keeps its theme-following panel.
 */
export const READER_CAPSULE_COLORS = {
  /**
   * Liquid Glass tint. Glass adapts to the luminance under it, so over a white
   * manga page untinted glass turns bright and white glyphs vanish; a dark
   * tint keeps the Photos-style dark glass legible on any page.
   */
  glassTint: "rgba(16,16,18,0.52)",
  /** Painted surface where native glass is unavailable (Android, older iOS). */
  panel: "rgba(30,30,32,0.9)",
  border: "rgba(255,255,255,0.14)",
  primaryText: "rgba(255,255,255,0.96)",
  secondaryText: "rgba(235,235,245,0.64)",
  hover: "rgba(255,255,255,0.14)",
  disabled: "rgba(235,235,245,0.3)",
} as const;

/**
 * Docked learning panels over the black reader: a lighter tint so the glass
 * reads as a surface over the empty pane, and translucent content tokens so
 * the panel's own cards and footer never paint opaque slabs inside the glass.
 */
export const READER_PANEL_GLASS_TINT = "rgba(46,46,50,0.55)";
export const READER_PANEL_TOKEN_OVERRIDES = {
  background: "rgba(255,255,255,0)",
  card: "rgba(255,255,255,0.07)",
  secondary: "rgba(255,255,255,0.09)",
  muted: "rgba(255,255,255,0.12)",
} as const;

/** Dark-token tweaks inside the capsule chrome: a translucent slider track on glass. */
export const READER_CAPSULE_TOKEN_OVERRIDES = {
  muted: "rgba(255,255,255,0.24)",
} as const;

export type ReaderCapsuleProps = {
  children?: ReactNode;
  /** Capsule (radius = height / 2) or a fixed radius. */
  cornerRadius?: number;
  /** Corners concentric with the display where the piece meets it, never below this radius (docked panels). */
  concentricMinimum?: number;
  /** Interactive glass press response (buttons). Panels pass false. */
  interactive?: boolean;
  /** Glass tint; defaults to the chrome's dark tint. */
  tintColor?: string;
  style?: StyleProp<ViewStyle>;
  pointerEvents?: "box-none" | "auto";
};

/**
 * One separate piece of the reader chrome (Safari / Photos on iPhone Duo):
 * real UIKit Liquid Glass (`UIGlassEffect`, dark appearance, interactive)
 * hosting its buttons, so presses get the system glass response and pieces
 * inside a `GlassContainer` blend and morph like system toolbars. Android and
 * iOS before 26 paint the dark translucent fallback. Shape comes from `style`
 * size: a 44pt square is a circle, anything wider a capsule.
 */
export function ReaderCapsule({
  children,
  cornerRadius,
  concentricMinimum,
  interactive = true,
  tintColor = READER_CAPSULE_COLORS.glassTint,
  style,
  pointerEvents = "box-none",
}: ReaderCapsuleProps) {
  const flat = StyleSheet.flatten(style) ?? {};
  const height = typeof flat.height === "number" ? flat.height : null;
  const radius = concentricMinimum ?? cornerRadius ?? (height != null ? height / 2 : 22);
  if (!glassViewAvailable) {
    return (
      <View
        pointerEvents={pointerEvents}
        style={[
          styles.painted,
          { borderRadius: radius, backgroundColor: READER_CAPSULE_COLORS.panel, borderColor: READER_CAPSULE_COLORS.border },
          style,
        ]}
      >
        {children}
      </View>
    );
  }
  return (
    <GlassView
      colorScheme="dark"
      tintColor={tintColor}
      interactive={interactive}
      cornerRadius={cornerRadius ?? 0}
      concentricMinimum={concentricMinimum ?? 0}
      pointerEvents={pointerEvents}
      style={style}
    >
      {children}
    </GlassView>
  );
}

const styles = StyleSheet.create({
  painted: {
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
});
