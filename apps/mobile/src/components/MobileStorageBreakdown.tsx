import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";
import {
  NemuButton,
  NemuText,
  nemuFontWeight,
  radius,
  useNemuTheme,
} from "@/design-system";
import {
  formatMobileString,
  type MobileStrings,
} from "@/lib/mobileI18n";
import {
  clearMobileCoverImageCache,
  clearMobileReaderPageImageCache,
  getMobileImageCacheStats,
} from "@/lib/mobileImageCache";
import { getCachedSourcePackageStats } from "@/sources/sourcePackageCache";
import { getMobileReaderPageListCacheStats } from "@/sources/mobileReaderPageListCache";
import { useSkeletonPulse } from "@/lib/useSkeletonPulse";

/** Proportion-bar segments, in the mock's order: covers → pages → packages → other. */
const BAR_SEGMENTS = ["covers", "pages", "packages", "other"] as const;
type BarSegmentKey = (typeof BAR_SEGMENTS)[number];

const SKELETON_LINES = [0, 1, 2] as const;

function formatBytes(bytes: number, strings: MobileStrings): string {
  if (bytes < 1024) {
    return formatMobileString(strings.settings.storageUnitBytes, { value: bytes });
  }
  if (bytes < 1024 * 1024) {
    return formatMobileString(strings.settings.storageUnitKilobytes, {
      value: (bytes / 1024).toFixed(1),
    });
  }
  return formatMobileString(strings.settings.storageUnitMegabytes, {
    value: (bytes / (1024 * 1024)).toFixed(1),
  });
}

function formatCount(template: string, count: number): string {
  return formatMobileString(template, { count: count.toLocaleString() });
}

export function MobileStorageBreakdown({
  strings,
  clearAllBusy = false,
  onClearAllCache,
}: {
  strings: MobileStrings;
  /** Mirrors the Settings screen's clear-cache mutation so the rows refresh on completion. */
  clearAllBusy?: boolean;
  onClearAllCache?: () => void;
}) {
  const { tokens, reduceMotion } = useNemuTheme();
  const skeletonOpacity = useSkeletonPulse(reduceMotion === true);
  const [stats, setStats] = useState({
    covers: { bytes: 0, entries: 0 },
    pages: { bytes: 0, entries: 0 },
    packages: { bytes: 0, entries: 0 },
    other: { bytes: 0, entries: 0 },
  });
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState<"covers" | "pages" | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [images, packages, other] = await Promise.all([
        getMobileImageCacheStats(),
        getCachedSourcePackageStats(),
        getMobileReaderPageListCacheStats(),
      ]);
      setStats({ ...images, packages, other });
    } catch {
      // Storage usage is diagnostic; a transient filesystem read must not
      // take down the Settings screen.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // The clear-all-cache flow lives in the Settings screen; re-read the
  // breakdown as soon as that mutation settles so the numbers stay honest.
  const previousClearAllBusy = useRef(clearAllBusy);
  useEffect(() => {
    const wasBusy = previousClearAllBusy.current;
    previousClearAllBusy.current = clearAllBusy;
    if (wasBusy && !clearAllBusy) void refresh();
  }, [clearAllBusy, refresh]);

  const segmentColors = useMemo<
    Record<BarSegmentKey, { color: string; opacity: number }>
  >(
    () => ({
      covers: { color: tokens.primary, opacity: 1 },
      pages: { color: tokens.primary, opacity: 0.55 },
      packages: { color: tokens.success, opacity: 1 },
      other: { color: tokens.mutedForeground, opacity: 1 },
    }),
    [tokens],
  );

  const legendLabels: Record<BarSegmentKey, string> = {
    covers: strings.settings.storageCovers,
    pages: strings.settings.storagePages,
    packages: strings.settings.storageSourcePackages,
    other: strings.settings.storagePageLists,
  };

  const totalBytes = BAR_SEGMENTS.reduce(
    (total, key) => total + stats[key].bytes,
    0,
  );

  const rows = [
    {
      key: "covers",
      label: strings.settings.storageRowCovers,
      value: `${formatBytes(stats.covers.bytes, strings)} · ${formatCount(
        strings.settings.storageCountImages,
        stats.covers.entries,
      )}`,
    },
    {
      key: "pages",
      label: strings.settings.storageRowPages,
      value: `${formatBytes(stats.pages.bytes, strings)} · ${formatCount(
        strings.settings.storageCountPages,
        stats.pages.entries,
      )}`,
    },
    {
      key: "packages",
      label: strings.settings.storageSourcePackages,
      value: `${formatBytes(stats.packages.bytes, strings)} · ${formatCount(
        strings.settings.storageCountPackages,
        stats.packages.entries,
      )}`,
    },
    {
      key: "offline",
      label: strings.settings.storageOfflineChapters,
      value: formatCount(
        strings.settings.storageCountChapters,
        stats.other.entries,
      ),
    },
    {
      key: "other",
      label: strings.settings.storageRowOther,
      value: formatBytes(stats.other.bytes, strings),
    },
  ];

  const clear = async (kind: "covers" | "pages") => {
    if (clearing) return;
    setClearing(kind);
    try {
      if (kind === "covers") await clearMobileCoverImageCache();
      else await clearMobileReaderPageImageCache();
      await refresh();
    } catch {
      // Keep the current diagnostic snapshot when a recoverable clear fails.
    } finally {
      setClearing(null);
    }
  };

  const actionsDisabled = Boolean(clearing) || clearAllBusy;

  return (
    <View>
      <View style={[styles.bar, { backgroundColor: tokens.muted }]}>
        {BAR_SEGMENTS.filter((key) => stats[key].bytes > 0).map((key) => (
          <View
            key={key}
            style={{
              flexGrow: stats[key].bytes,
              flexBasis: 0,
              backgroundColor: segmentColors[key].color,
              opacity: segmentColors[key].opacity,
            }}
          />
        ))}
      </View>

      <View style={styles.legend}>
        {BAR_SEGMENTS.map((key) => (
          <View key={key} style={styles.legendItem}>
            <View
              style={[
                styles.legendSwatch,
                {
                  backgroundColor: segmentColors[key].color,
                  opacity: segmentColors[key].opacity,
                },
              ]}
            />
            <NemuText
              color={tokens.mutedForeground}
              numberOfLines={1}
              style={styles.legendLabel}
              variant="caption"
            >
              {legendLabels[key]}
            </NemuText>
          </View>
        ))}
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: tokens.card, borderColor: tokens.border },
        ]}
      >
        {loading
          ? SKELETON_LINES.map((line) => (
              <View
                key={line}
                style={[styles.row, { borderBottomColor: tokens.border }]}
              >
                <Animated.View
                  style={[
                    styles.skeletonLine,
                    styles.skeletonLabel,
                    { backgroundColor: tokens.muted, opacity: skeletonOpacity },
                  ]}
                />
                <Animated.View
                  style={[
                    styles.skeletonLine,
                    styles.skeletonValue,
                    { backgroundColor: tokens.muted, opacity: skeletonOpacity },
                  ]}
                />
              </View>
            ))
          : rows.map((row) => (
              <View
                key={row.key}
                style={[styles.row, { borderBottomColor: tokens.border }]}
              >
                <NemuText
                  color={tokens.foreground}
                  numberOfLines={1}
                  style={styles.rowLabel}
                >
                  {row.label}
                </NemuText>
                <NemuText
                  color={tokens.mutedForeground}
                  style={styles.rowValue}
                >
                  {row.value}
                </NemuText>
              </View>
            ))}
        <View style={[styles.row, styles.totalRow]}>
          <NemuText color={tokens.foreground} style={styles.totalLabel}>
            {strings.settings.storageTotalLabel}
          </NemuText>
          <NemuText color={tokens.foreground} style={styles.totalValue}>
            {formatBytes(totalBytes, strings)}
          </NemuText>
        </View>
      </View>

      <View style={styles.actions}>
        <NemuButton
          accessibilityLabel={strings.settings.clearPageCache}
          containerStyle={styles.blockButtonContainer}
          disabled={actionsDisabled}
          label={formatMobileString(strings.settings.clearPageCacheWithSize, {
            bytes: formatBytes(stats.pages.bytes, strings),
          })}
          loading={clearing === "pages"}
          onPress={() => void clear("pages")}
          size="lg"
          style={styles.blockButton}
          variant="outline"
        />
        <NemuButton
          accessibilityLabel={strings.settings.clearCoverCache}
          containerStyle={styles.blockButtonContainer}
          disabled={actionsDisabled}
          label={formatMobileString(strings.settings.clearCoverCacheWithSize, {
            bytes: formatBytes(stats.covers.bytes, strings),
          })}
          loading={clearing === "covers"}
          onPress={() => void clear("covers")}
          size="lg"
          style={styles.blockButton}
          variant="outline"
        />
        {onClearAllCache ? (
          <NemuButton
            accessibilityLabel={strings.settings.clearAllCaches}
            containerStyle={styles.blockButtonContainer}
            disabled={actionsDisabled}
            hapticFeedback="warning"
            label={strings.settings.clearAllCaches}
            loading={clearAllBusy}
            onPress={onClearAllCache}
            size="lg"
            style={styles.blockButton}
            textStyle={{ color: tokens.danger }}
            variant="ghost"
          />
        ) : null}
      </View>

      <NemuText
        color={tokens.mutedForeground}
        style={styles.footnote}
        variant="caption"
      >
        {strings.settings.storageFootnote}
      </NemuText>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 8,
    flexDirection: "row",
    overflow: "hidden",
    borderRadius: 4,
  },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 14,
    marginTop: 6,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  legendSwatch: {
    width: 8,
    height: 8,
    borderRadius: 2,
  },
  legendLabel: {
    fontSize: 11,
    lineHeight: 15,
  },
  card: {
    marginTop: 14,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
  },
  row: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
  },
  rowLabel: {
    flexShrink: 1,
    minWidth: 0,
  },
  rowValue: {
    fontVariant: ["tabular-nums"],
  },
  totalRow: {
    borderBottomWidth: 0,
  },
  totalLabel: {
    fontWeight: nemuFontWeight.semibold,
  },
  totalValue: {
    fontWeight: nemuFontWeight.semibold,
    fontVariant: ["tabular-nums"],
  },
  skeletonLine: {
    height: 13,
    borderRadius: radius.sm,
  },
  skeletonLabel: {
    width: "38%",
  },
  skeletonValue: {
    width: "30%",
  },
  actions: {
    gap: 8,
    marginTop: 16,
  },
  blockButtonContainer: {
    alignSelf: "stretch",
  },
  blockButton: {
    width: "100%",
  },
  footnote: {
    marginTop: 12,
  },
});
