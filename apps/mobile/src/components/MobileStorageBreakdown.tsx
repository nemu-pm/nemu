import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import {
  NemuPressable,
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

type StorageCategory = {
  key: string;
  label: string;
  bytes: number;
  entries: number;
  color: string;
};

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

export function MobileStorageBreakdown({ strings }: { strings: MobileStrings }) {
  const { tokens } = useNemuTheme();
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

  const categories = useMemo<StorageCategory[]>(
    () => [
      { key: "covers", label: strings.settings.storageCovers, ...stats.covers, color: tokens.primary },
      { key: "pages", label: strings.settings.storagePages, ...stats.pages, color: tokens.success },
      { key: "packages", label: strings.settings.storageSourcePackages, ...stats.packages, color: tokens.warning },
      { key: "other", label: strings.settings.storagePageLists, ...stats.other, color: tokens.mutedForeground },
      { key: "offline", label: strings.settings.storageOfflineChapters, bytes: 0, entries: 0, color: tokens.danger },
    ],
    [stats, strings, tokens],
  );
  const totalBytes = categories.reduce((total, category) => total + category.bytes, 0);
  const totalEntries = categories.reduce((total, category) => total + category.entries, 0);

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

  return (
    <View style={styles.stack}>
      <View style={styles.headingRow}>
        <View style={styles.headingText}>
          <Text style={[styles.title, { color: tokens.foreground }]}>
            {strings.settings.storageBreakdown}
          </Text>
          <Text style={[styles.subtitle, { color: tokens.mutedForeground }]}>
            {formatMobileString(strings.settings.storageTotal, {
              bytes: formatBytes(totalBytes, strings),
              entries: totalEntries,
            })}
          </Text>
        </View>
        {loading ? <ActivityIndicator size="small" color={tokens.primary} /> : null}
      </View>
      <View style={[styles.bar, { backgroundColor: tokens.muted }]}>
        {categories.filter((category) => category.bytes > 0).map((category) => (
          <View
            key={category.key}
            style={{
              flexGrow: category.bytes,
              flexBasis: 0,
              backgroundColor: category.color,
            }}
          />
        ))}
      </View>
      <View style={styles.legend}>
        {categories.map((category) => (
          <View key={category.key} style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: category.color }]} />
            <Text style={[styles.legendLabel, { color: tokens.foreground }]}>
              {category.label}
            </Text>
            <Text style={[styles.legendValue, { color: tokens.mutedForeground }]}>
              {formatBytes(category.bytes, strings)} · {category.entries}
            </Text>
          </View>
        ))}
      </View>
      <View style={styles.actions}>
        {(["covers", "pages"] as const).map((kind) => (
          <NemuPressable
            key={kind}
            accessibilityRole="button"
            disabled={Boolean(clearing)}
            onPress={() => void clear(kind)}
            pressProfile="row"
            style={[styles.action, { backgroundColor: tokens.muted }]}
          >
            {clearing === kind ? (
              <ActivityIndicator size="small" color={tokens.primary} />
            ) : (
              <Text style={[styles.actionText, { color: tokens.primary }]}>
                {kind === "covers"
                  ? strings.settings.clearCoverCache
                  : strings.settings.clearPageCache}
              </Text>
            )}
          </NemuPressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
  headingRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  headingText: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, lineHeight: 20, fontWeight: nemuFontWeight.semibold },
  subtitle: { marginTop: 2, fontSize: 12, lineHeight: 16 },
  bar: { height: 10, flexDirection: "row", overflow: "hidden", borderRadius: 5 },
  legend: { gap: 9 },
  legendRow: { minHeight: 22, flexDirection: "row", alignItems: "center", gap: 8 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { flex: 1, fontSize: 13, lineHeight: 18 },
  legendValue: { fontSize: 12, lineHeight: 16 },
  actions: { flexDirection: "row", gap: 8 },
  action: { minHeight: 40, flex: 1, alignItems: "center", justifyContent: "center", borderRadius: radius.lg, paddingHorizontal: 10 },
  actionText: { fontSize: 12, lineHeight: 16, fontWeight: nemuFontWeight.medium },
});
