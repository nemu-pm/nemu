/**
 * DuoDisplayHandoffToast + useDuoDisplayHandoff — "close to peek / seamless
 * handoff" confirmation.
 *
 * When the reader moves between the outer and inner display of a foldable
 * (fold shut → outer, unfold → inner), a short glass toast confirms that
 * reading continued at the same place: "Continued on outer display · p.12".
 * Display changes come from `mobileDuoDisplayTransition` — rotation, fold
 * angle (book ↔ flat), split-view resizes and non-foldable devices never
 * trigger it.
 *
 * Props (`DuoDisplayHandoffToast`):
 * - `width`, `height`, `hinge`, `hasFold`: the window geometry — the
 *   reader's own observed `readerWindowLayout.width/height/hinge` and
 *   `readerWindowLayout.divisions.length > 0` (or `useMobileAdaptiveLayout()`
 *   width/height/hinge).
 * - `pageNumber`: 1-based logical page shown right now (null = omit "· p.N").
 *   Read at display time, so it reflects the page after the relayout.
 * - `enabled`: only the focused, ready reader shows it; geometry is still
 *   tracked while disabled so a change made elsewhere is never replayed.
 * - `topOffset`: distance from the top of the reader root (below the status
 *   bar / top chrome, inside the content safe area).
 * - `insets`: horizontal clearance (e.g. the vertical bar edge on the outer
 *   display), default 12pt each side.
 * - `strings`.
 *
 * Accessibility: VoiceOver/TalkBack users get one
 * `AccessibilityInfo.announceForAccessibility` (coalesced, so a flapping
 * hinge announces the final display once); the visual toast is hidden from
 * the accessibility tree so it is not read twice. Reduce Motion swaps the
 * slide for a plain cross-fade. Visible for 1.5 s.
 */
import { useEffect, useRef } from "react";
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
import type { WindowHingeStatus } from "@/lib/mobileWindowLayout";
import { mobileDuoHandoffMessage } from "@/lib/mobileDuoDisplayTransition";
import { useDuoDisplayHandoff } from "./useDuoDisplayHandoff";

const ANNOUNCE_COALESCE_MS = 250;
// Same light-on-dark pair as the reader connectivity notice.
const DARK_TITLE = "rgba(235,238,245,0.98)";

export function DuoDisplayHandoffToast({
  width,
  height,
  hinge,
  hasFold,
  pageNumber,
  enabled,
  topOffset,
  insets,
  strings,
}: {
  width: number;
  height: number;
  hinge: WindowHingeStatus | null | undefined;
  hasFold?: boolean;
  pageNumber: number | null;
  enabled: boolean;
  topOffset: number;
  insets?: { left: number; right: number };
  strings: MobileStrings;
}) {
  const { scheme, tokens } = useNemuTheme();
  const reducedMotion = useReducedMotion();
  const handoff = useDuoDisplayHandoff({ width, height, hinge, hasFold, enabled });
  const pageRef = useRef(pageNumber);
  useEffect(() => {
    pageRef.current = pageNumber;
  }, [pageNumber]);

  useEffect(() => {
    if (!handoff) return;
    const timer = setTimeout(() => {
      AccessibilityInfo.announceForAccessibility(
        mobileDuoHandoffMessage(strings.duo, handoff.display, pageRef.current),
      );
    }, ANNOUNCE_COALESCE_MS);
    return () => clearTimeout(timer);
  }, [handoff, strings.duo]);

  if (!handoff) return null;
  const dark = scheme === "dark";
  return (
    <Animated.View
      key={handoff.id}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      entering={reducedMotion ? FadeIn.duration(120) : FadeInDown.damping(18)}
      exiting={reducedMotion ? FadeOut.duration(120) : FadeOutUp.duration(160)}
      pointerEvents="none"
      style={[
        styles.host,
        { top: topOffset, left: insets?.left ?? 12, right: insets?.right ?? 12 },
      ]}
    >
      <MobileToastSurface
        backgroundColor={READER_CHROME_GLASS_TINT[scheme]}
        borderColor={READER_CHROME_GLASS_BORDER[scheme]}
        icon={handoff.display === "outer" ? "phone-portrait-outline" : "tablet-landscape-outline"}
        iconColor={tokens.mutedForeground}
        plain
        style={styles.surface}
        title={mobileDuoHandoffMessage(strings.duo, handoff.display, pageNumber)}
        titleColor={dark ? DARK_TITLE : tokens.foreground}
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
