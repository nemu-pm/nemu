import { useEffect, useMemo, type ReactNode } from "react";
import { Animated, Easing, Platform, StyleSheet } from "react-native";
import { nemuColorWithAlpha } from "@/design/colorAlpha";
import { useNemuTheme } from "@/design/useNemuTheme";
import {
  createNemuRowHighlightController,
  NEMU_ROW_HIGHLIGHT,
  resolveNemuRowHighlightRadii,
} from "@/lib/nemuPressable";

const useNativeAnimationDriver = Platform.OS !== "web";

export type NemuRowHighlight = {
  /** Call from the row's pressable (NemuPressable does this itself). */
  onPressIn: () => void;
  onPressOut: () => void;
  onPress: () => void;
  /** Absolute fill to render as the row's FIRST child (behind its content). */
  overlay: (radii?: ReturnType<typeof resolveNemuRowHighlightRadii>) => ReactNode;
};

/**
 * Native row selection feedback (UITableView inset-grouped, Mail/Settings
 * sidebars): the row fills on touch-down (after a short scroll-safe delay),
 * a quick tap still flashes it, and release fades it out — no shrinking. The
 * fill is a plain absolute layer behind the content, so it takes the row's
 * own shape: pass the row's corner radii, or render it inside a clipping
 * card so first/last rows get the card's corners and middle rows stay square.
 * Use it directly when the pressable is only part of a row (a leading button
 * beside trailing controls) so the whole row highlights.
 */
export function useNemuRowHighlight(): NemuRowHighlight {
  return useOptionalNemuRowHighlight(true)!;
}

/**
 * `useNemuRowHighlight` that allocates nothing (no Animated.Value, no
 * handlers) while `enabled` is false; NemuPressable is in every list row and
 * most of them do not highlight.
 */
export function useOptionalNemuRowHighlight(enabled: boolean): NemuRowHighlight | null {
  const { scheme, tokens } = useNemuTheme();
  const state = useMemo(() => {
    if (!enabled) return null;
    const value = new Animated.Value(0);
    const controller = createNemuRowHighlightController(value, () => {
      Animated.timing(value, {
        toValue: 0,
        duration: NEMU_ROW_HIGHLIGHT.fadeOutMs,
        easing: Easing.out(Easing.quad),
        useNativeDriver: useNativeAnimationDriver,
      }).start();
    });
    return { value, controller };
  }, [enabled]);
  useEffect(() => () => state?.controller.dispose(), [state]);
  const color = nemuColorWithAlpha(
    tokens.foreground,
    scheme === "dark" ? NEMU_ROW_HIGHLIGHT.darkAlpha : NEMU_ROW_HIGHLIGHT.lightAlpha,
  );
  return useMemo(() => {
    if (!state) return null;
    const { value, controller } = state;
    return {
      onPressIn: controller.onPressIn,
      onPressOut: controller.onPressOut,
      onPress: controller.onPress,
      overlay: (radii?: ReturnType<typeof resolveNemuRowHighlightRadii>) => (
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, radii, { backgroundColor: color, opacity: value }]}
        />
      ),
    };
  }, [color, state]);
}
