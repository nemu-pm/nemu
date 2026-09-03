import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  FadeInDown,
  FadeOutUp,
  useReducedMotion,
} from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import { nemuFontWeight, useNemuTheme } from "@/design-system";
import {
  READER_CHROME_GLASS_BORDER,
  READER_CHROME_GLASS_TINT,
} from "./readerChromeGlass";
import type { MobileStrings } from "@/lib/mobileI18n";
import type { MobileConnectivityState } from "@/lib/useMobileConnectivity";

const SLOW_PAGE_THRESHOLD_MS = 8_000;

/**
 * Reader glass toast pinned under the top chrome: explains offline reading
 * (cached pages stay readable, retries resume automatically) and flags a
 * slow source once a page request has hung past 8s. Geometry mirrors the
 * chrome panel — left/right 12, radius 22, one glass border — so it reads as
 * a second row of the same surface, not another card.
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
  const { scheme } = useNemuTheme();
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

  return (
    <Animated.View
      pointerEvents="box-none"
      entering={reducedMotion ? undefined : FadeInDown.damping(18)}
      exiting={reducedMotion ? undefined : FadeOutUp.duration(160)}
      style={[styles.host, { top: topOffset }]}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
    >
      <View
        style={[
          styles.pill,
          {
            backgroundColor: READER_CHROME_GLASS_TINT[scheme],
            borderColor: READER_CHROME_GLASS_BORDER[scheme],
          },
        ]}
      >
        <Ionicons
          name={offline ? "cloud-offline-outline" : "hourglass-outline"}
          size={18}
          color={offline ? "#f0a63a" : "rgba(235,238,245,0.92)"}
        />
        <View style={styles.texts}>
          <Text style={styles.title} numberOfLines={1}>
            {offline
              ? strings.feedback.readerOfflineTitle
              : strings.feedback.readerSlowSource}
          </Text>
          {offline ? (
            <Text style={styles.detail} numberOfLines={1}>
              {strings.feedback.readerOfflineDetail}
            </Text>
          ) : null}
        </View>
      </View>
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
  pill: {
    borderRadius: 22,
    borderWidth: 0.5,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  texts: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  title: {
    color: "rgba(235,238,245,0.98)",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: nemuFontWeight.medium,
  },
  detail: {
    color: "rgba(235,238,245,0.72)",
    fontSize: 12,
    lineHeight: 16,
  },
});
