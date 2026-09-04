import { useEffect, useRef, useState } from "react";
import { StyleSheet } from "react-native";
import Animated, {
  FadeInDown,
  FadeOutUp,
  useReducedMotion,
} from "react-native-reanimated";
import { useNemuTheme } from "@/design-system";
import { MobileToastSurface } from "@/components/MobileToast";
import {
  READER_CHROME_GLASS_BORDER,
  READER_CHROME_GLASS_TINT,
} from "./readerChromeGlass";
import type { MobileStrings } from "@/lib/mobileI18n";
import type { MobileConnectivityState } from "@/lib/useMobileConnectivity";

const SLOW_PAGE_THRESHOLD_MS = 8_000;

// The reader panel is a dark glass in dark mode and a near-white glass in
// light mode, so the notice cannot hardcode light-on-dark text.
const READER_NOTICE_DARK_TITLE = "rgba(235,238,245,0.98)";
const READER_NOTICE_DARK_DETAIL = "rgba(235,238,245,0.72)";

/**
 * Reader glass toast pinned under the top chrome: explains offline reading
 * (cached pages stay readable, retries resume automatically) and flags a
 * slow source once a page request has hung past 8s. It renders the shared
 * `MobileToastSurface` in its plain (reader-tinted) mode, so the geometry
 * mirrors both the app toast and the chrome panel — left/right 12, radius 22,
 * one glass border — and reads as a second row of the same surface.
 */
export function MobileReaderConnectivityNotice({
  topOffset,
  pageRequestPending,
  strings,
  connectivity,
}: {
  topOffset: number;
  pageRequestPending: boolean;
  strings: MobileStrings;
  connectivity: MobileConnectivityState;
}) {
  const { scheme, tokens } = useNemuTheme();
  const reducedMotion = useReducedMotion();
  const [slowLoading, setSlowLoading] = useState(false);
  const pendingSinceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!pageRequestPending || connectivity.offline) {
      pendingSinceRef.current = null;
      if (slowLoading) {
        const resetTimer = setTimeout(() => setSlowLoading(false), 0);
        return () => clearTimeout(resetTimer);
      }
      return;
    }
    if (pendingSinceRef.current === null) {
      pendingSinceRef.current = Date.now();
    }
    const startedAt = pendingSinceRef.current;
    const elapsed = Date.now() - startedAt;
    const remaining = SLOW_PAGE_THRESHOLD_MS - elapsed;
    if (remaining <= 0) {
      // Flip via the same async path as the timer to avoid a cascading
      // synchronous render straight out of the effect.
      const yieldTimer = setTimeout(() => setSlowLoading(true), 0);
      return () => clearTimeout(yieldTimer);
    }
    const timer = setTimeout(() => setSlowLoading(true), remaining);
    return () => clearTimeout(timer);
  }, [connectivity.offline, pageRequestPending, slowLoading]);

  if (connectivity.resolving) return null;

  if (!connectivity.offline && !slowLoading) return null;

  const offline = connectivity.offline;
  const dark = scheme === "dark";

  return (
    <Animated.View
      pointerEvents="box-none"
      entering={reducedMotion ? undefined : FadeInDown.damping(18)}
      exiting={reducedMotion ? undefined : FadeOutUp.duration(160)}
      style={[styles.host, { top: topOffset }]}
    >
      <MobileToastSurface
        backgroundColor={READER_CHROME_GLASS_TINT[scheme]}
        borderColor={READER_CHROME_GLASS_BORDER[scheme]}
        detail={offline ? strings.feedback.readerOfflineDetail : undefined}
        detailColor={dark ? READER_NOTICE_DARK_DETAIL : tokens.mutedForeground}
        icon={offline ? "cloud-offline-outline" : "hourglass-outline"}
        iconColor={offline ? tokens.warning : tokens.mutedForeground}
        plain
        title={
          offline
            ? strings.feedback.readerOfflineTitle
            : strings.feedback.readerSlowSource
        }
        titleColor={dark ? READER_NOTICE_DARK_TITLE : tokens.foreground}
        tone="warning"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: 12,
    right: 12,
    zIndex: 30,
    elevation: 30,
  },
});
