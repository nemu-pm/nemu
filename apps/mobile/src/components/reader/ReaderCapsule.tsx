import { useEffect, type ComponentType, type ReactNode } from "react";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type LayoutAnimationFunction,
} from "react-native-reanimated";
import { GlassView, glassViewAvailable, NativeGlassViewHost } from "../../../modules/nemu-window-layout";

type NativeGlassHostProps = {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  pointerEvents?: "box-none" | "auto";
  tintColor?: string;
  cornerRadius: number;
  clear: boolean;
  concentricMinimum: number;
  interactive: boolean;
  colorScheme?: "light" | "dark";
  materialized: boolean;
  animateAppearance: boolean;
  materializeDurationMs: number;
  layout?: LayoutAnimationFunction;
};

/**
 * The glass piece itself as a Reanimated component: a layout transition must
 * run on the glass view (not a wrapper) so the material resizes with it.
 */
const AnimatedNativeGlass = NativeGlassViewHost
  ? (Animated.createAnimatedComponent(
      NativeGlassViewHost as unknown as ComponentType<Omit<NativeGlassHostProps, "layout">>,
    ) as unknown as ComponentType<NativeGlassHostProps>)
  : null;

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

/** Dark-token tweaks inside the capsule chrome: a translucent slider track on glass. */
export const READER_CAPSULE_TOKEN_OVERRIDES = {
  muted: "rgba(255,255,255,0.24)",
} as const;

export type ReaderCapsuleProps = {
  children?: ReactNode;
  /** Capsule (radius = height / 2) or a fixed radius. */
  cornerRadius?: number;
  /** Corners concentric with the display where the piece meets it, never below this radius. */
  concentricMinimum?: number;
  /** Interactive glass press response (buttons). Panels pass false. */
  interactive?: boolean;
  /** Glass tint; defaults to the chrome's dark tint. */
  tintColor?: string;
  style?: StyleProp<ViewStyle>;
  pointerEvents?: "box-none" | "auto";
  /**
   * Reanimated layout transition for this piece (a capsule gliding to its new
   * frame on a pose change). Omitted: frames change at once.
   */
  layout?: LayoutAnimationFunction;
  /**
   * Shown (default) or dismissed. The glass materializes / dematerializes
   * with its content in one animation (the effect itself animates; the glass
   * view is never alpha-faded, which UIKit renders as content without glass).
   */
  materialized?: boolean;
  /** Materialize from nothing when the piece first appears. */
  animateAppearance?: boolean;
  /** (De)materialize duration in ms; 0 = instant. */
  materializeDurationMs?: number;
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
  layout,
  materialized = true,
  animateAppearance = false,
  materializeDurationMs = 0,
}: ReaderCapsuleProps) {
  // Painted fallback (Android, older iOS): no glass to drop, so the piece
  // simply fades with the same timing.
  const paintedOpacity = useSharedValue(animateAppearance && materializeDurationMs > 0 ? 0 : materialized ? 1 : 0);
  useEffect(() => {
    paintedOpacity.value = withTiming(materialized ? 1 : 0, { duration: materializeDurationMs });
  }, [materialized, materializeDurationMs, paintedOpacity]);
  const paintedStyle = useAnimatedStyle(() => ({ opacity: paintedOpacity.value }));
  const flat = StyleSheet.flatten(style) ?? {};
  const height = typeof flat.height === "number" ? flat.height : null;
  const radius = concentricMinimum ?? cornerRadius ?? (height != null ? height / 2 : 22);
  if (!glassViewAvailable) {
    return (
      <Animated.View
        layout={layout}
        pointerEvents={pointerEvents}
        style={[
          styles.painted,
          { borderRadius: radius, backgroundColor: READER_CAPSULE_COLORS.panel, borderColor: READER_CAPSULE_COLORS.border },
          style,
          paintedStyle,
        ]}
      >
        {children}
      </Animated.View>
    );
  }
  // Always the animated host when it exists: switching component types when a
  // glide arms would remount the glass (a flash).
  if (AnimatedNativeGlass) {
    return (
      <AnimatedNativeGlass
        layout={layout}
        colorScheme="dark"
        tintColor={tintColor}
        interactive={interactive}
        cornerRadius={cornerRadius ?? 0}
        concentricMinimum={concentricMinimum ?? 0}
        clear={false}
        materialized={materialized}
        animateAppearance={animateAppearance}
        materializeDurationMs={materializeDurationMs}
        pointerEvents={pointerEvents}
        style={style}
      >
        {children}
      </AnimatedNativeGlass>
    );
  }
  return (
    <GlassView
      colorScheme="dark"
      tintColor={tintColor}
      interactive={interactive}
      cornerRadius={cornerRadius ?? 0}
      concentricMinimum={concentricMinimum ?? 0}
      materialized={materialized}
      animateAppearance={animateAppearance}
      materializeDurationMs={materializeDurationMs}
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
