import { useEffect } from "react";
import { AccessibilityInfo, StyleSheet } from "react-native";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutUp,
  useReducedMotion,
} from "react-native-reanimated";
import { useNemuTheme } from "@/design-system";
import { MobileToastSurface } from "@/components/MobileToast";
import {
  READER_CHROME_GLASS_BORDER,
  READER_CHROME_GLASS_TINT,
} from "@/components/reader/readerChromeGlass";
import type { MobileStrings } from "@/lib/mobileI18n";

export type ReaderPairingShiftToastState = { id: number; on: boolean };

const VISIBLE_MS = 1500;
// Same light-on-dark pair as the Duo handoff toast.
const DARK_TITLE = "rgba(235,238,245,0.98)";

/**
 * Confirms a two-finger double tap on a spread: "错开一页：打开 / 关闭"
 * (Apple's "Orientation Lock: On" wording). Shown for 1.5 s; VoiceOver hears
 * it once instead of reading the hidden toast.
 */
export function ReaderPairingShiftToast({
  toast,
  onDone,
  topOffset,
  insets,
  strings,
}: {
  toast: ReaderPairingShiftToastState | null;
  onDone: (id: number) => void;
  topOffset: number;
  insets?: { left: number; right: number };
  strings: MobileStrings;
}) {
  const { scheme, tokens } = useNemuTheme();
  const reducedMotion = useReducedMotion();
  const title = toast
    ? toast.on ? strings.reader.shiftByOnePageOn : strings.reader.shiftByOnePageOff
    : "";

  useEffect(() => {
    if (!toast) return;
    AccessibilityInfo.announceForAccessibility(title);
    const timer = setTimeout(() => onDone(toast.id), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [onDone, title, toast]);

  if (!toast) return null;
  return (
    <Animated.View
      key={toast.id}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      entering={reducedMotion ? FadeIn.duration(120) : FadeInDown.damping(18)}
      exiting={reducedMotion ? FadeOut.duration(120) : FadeOutUp.duration(160)}
      pointerEvents="none"
      style={[styles.host, { top: topOffset, left: insets?.left ?? 12, right: insets?.right ?? 12 }]}
    >
      <MobileToastSurface
        backgroundColor={READER_CHROME_GLASS_TINT[scheme]}
        borderColor={READER_CHROME_GLASS_BORDER[scheme]}
        icon="book-outline"
        iconColor={tokens.mutedForeground}
        plain
        style={styles.surface}
        title={title}
        titleColor={scheme === "dark" ? DARK_TITLE : tokens.foreground}
        tone="info"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    alignItems: "center",
    zIndex: 30,
    elevation: 30,
  },
  surface: {
    maxWidth: 420,
    alignSelf: "center",
  },
});
