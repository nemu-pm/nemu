import { ScrollView, StyleSheet, Switch, View } from "react-native";
import { Stack } from "expo-router";
import { NemuButton, NemuPressable, NemuText, nemuFontWeight, useNemuTheme } from "@/design-system";
import { useMobileDownloadsPage } from "@/lib/downloads/useMobileDownloadsPage";

/** Android / web: the same groups as the iOS list, as plain cards and buttons. */
export function DownloadsScreen() {
  const { tokens } = useNemuTheme();
  const page = useMobileDownloadsPage();
  const { strings } = page;
  const group = [styles.group, { backgroundColor: tokens.card, borderColor: tokens.border }];
  const muted = { color: tokens.mutedForeground };

  return (
    <View style={{ flex: 1, backgroundColor: tokens.background }}>
      <Stack.Screen
        options={{ title: strings.downloads.title, headerBackVisible: true, gestureEnabled: true, headerTitle: undefined }}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={group}>
          <View style={styles.row}>
            <NemuText style={{ color: tokens.foreground }}>{strings.downloads.storageUsed}</NemuText>
            <NemuText style={muted}>{page.totalLabel}</NemuText>
          </View>
          <View style={styles.row}>
            <NemuText style={[styles.flex, { color: tokens.foreground }]}>{strings.downloads.wifiOnly}</NemuText>
            <Switch
              accessibilityLabel={strings.downloads.wifiOnly}
              value={page.wifiOnly}
              onValueChange={page.setWifiOnly}
            />
          </View>
        </View>
        <NemuText variant="caption" style={muted}>
          {strings.downloads.wifiOnlyFooter}
        </NemuText>

        {page.empty ? (
          <View style={styles.empty}>
            <NemuText style={{ color: tokens.foreground }}>{strings.downloads.emptyTitle}</NemuText>
            <NemuText variant="caption" style={[styles.center, muted]}>
              {strings.downloads.emptyDescription}
            </NemuText>
          </View>
        ) : null}

        {page.queue.length > 0 ? (
          <>
            <NemuText style={[styles.heading, { color: tokens.foreground }]}>{strings.downloads.queueSection}</NemuText>
            <View style={group}>
              {page.queue.map((row) => (
                <NemuPressable
                  key={row.key}
                  accessibilityRole="button"
                  accessibilityLabel={`${row.title}. ${row.detail}`}
                  onPress={() => page.toggleJob(row)}
                  onLongPress={() => page.cancelJob(row.key)}
                  style={styles.jobRow}
                >
                  <NemuText numberOfLines={1} style={{ color: tokens.foreground }}>
                    {row.title}
                  </NemuText>
                  <NemuText
                    numberOfLines={1}
                    variant="caption"
                    style={{ color: row.status === "failed" ? tokens.danger : tokens.mutedForeground }}
                  >
                    {row.detail}
                  </NemuText>
                  {row.progress !== null ? (
                    <View style={[styles.track, { backgroundColor: tokens.border }]}>
                      <View
                        style={[styles.bar, { backgroundColor: tokens.primary, width: `${Math.round(row.progress * 100)}%` }]}
                      />
                    </View>
                  ) : null}
                </NemuPressable>
              ))}
            </View>
            {page.waiting ? (
              <NemuText variant="caption" style={muted}>
                {page.waiting}
              </NemuText>
            ) : null}
            <View style={styles.buttons}>
              {page.hasRunnable ? (
                <NemuButton label={strings.downloads.pauseAll} onPress={page.pauseAll} variant="secondary" />
              ) : null}
              {page.hasPaused ? (
                <NemuButton label={strings.downloads.resumeAll} onPress={page.resumeAll} variant="secondary" />
              ) : null}
              <NemuButton label={strings.downloads.cancelAll} onPress={page.cancelAll} variant="destructive" />
            </View>
          </>
        ) : null}

        {page.manga.length > 0 ? (
          <>
            <NemuText style={[styles.heading, { color: tokens.foreground }]}>
              {strings.downloads.downloadedSection}
            </NemuText>
            <View style={group}>
              {page.manga.map((item) => (
                <View key={item.key} style={styles.row}>
                  <NemuPressable
                    accessibilityRole="button"
                    accessibilityLabel={item.title}
                    onPress={() => page.openManga(item)}
                    style={styles.flex}
                  >
                    <NemuText numberOfLines={1} style={{ color: tokens.foreground }}>
                      {item.title}
                    </NemuText>
                    <NemuText variant="caption" style={muted}>
                      {`${page.formatChapterCount(item.chapterCount)} · ${page.formatBytes(item.bytes)}`}
                    </NemuText>
                  </NemuPressable>
                  <NemuButton
                    label={strings.downloads.delete}
                    onPress={() => page.deleteManga(item)}
                    variant="ghost"
                  />
                </View>
              ))}
            </View>
          </>
        ) : null}

        <NemuButton
          label={strings.downloads.deleteAll}
          disabled={page.empty}
          onPress={page.confirmDeleteAll}
          variant="destructive"
        />
        <NemuText variant="caption" style={muted}>
          {strings.downloads.localOnlyFooter}
        </NemuText>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  group: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14 },
  row: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  jobRow: { paddingVertical: 10, gap: 2 },
  flex: { flex: 1, minWidth: 0 },
  heading: { marginTop: 8, fontSize: 17, fontWeight: nemuFontWeight.semibold },
  track: { height: 3, borderRadius: 2, marginTop: 6, overflow: "hidden" },
  bar: { height: 3, borderRadius: 2 },
  buttons: { gap: 8 },
  empty: { alignItems: "center", gap: 6, paddingVertical: 24 },
  center: { textAlign: "center" },
});
