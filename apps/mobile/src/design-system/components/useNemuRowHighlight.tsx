import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, Platform, StyleSheet } from "react-native";
import { nemuColorWithAlpha } from "@/design/colorAlpha";
import { useNemuTheme } from "@/design/useNemuTheme";
import { NEMU_ROW_HIGHLIGHT, resolveNemuRowHighlightRadii } from "@/lib/nemuPressable";

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
  const { scheme, tokens } = useNemuTheme();
  const [value] = useState(() => new Animated.Value(0));
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };
  useEffect(() => clear, []);
  const fadeOut = useCallback(() => {
    Animated.timing(value, {
      toValue: 0,
      duration: NEMU_ROW_HIGHLIGHT.fadeOutMs,
      easing: Easing.out(Easing.quad),
      useNativeDriver: useNativeAnimationDriver,
    }).start();
  }, [value]);
  // Released before the highlight appeared: the tap (onPress follows) still
  // flashes it once; a longer hold already showed it and only fades.
  const releasedEarlyRef = useRef(false);
  const onPressIn = useCallback(() => {
    clear();
    releasedEarlyRef.current = false;
    value.stopAnimation();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      value.setValue(1);
    }, NEMU_ROW_HIGHLIGHT.delayMs);
  }, [value]);
  const onPressOut = useCallback(() => {
    releasedEarlyRef.current = timerRef.current !== null;
    clear();
    fadeOut();
  }, [fadeOut]);
  const onPress = useCallback(() => {
    if (!releasedEarlyRef.current) return;
    releasedEarlyRef.current = false;
    value.stopAnimation();
    value.setValue(1);
    fadeOut();
  }, [fadeOut, value]);
  const color = nemuColorWithAlpha(
    tokens.foreground,
    scheme === "dark" ? NEMU_ROW_HIGHLIGHT.darkAlpha : NEMU_ROW_HIGHLIGHT.lightAlpha,
  );
  const overlay = useCallback(
    (radii?: ReturnType<typeof resolveNemuRowHighlightRadii>) => (
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, radii, { backgroundColor: color, opacity: value }]}
      />
    ),
    [color, value],
  );
  return { onPressIn, onPressOut, onPress, overlay };
}

