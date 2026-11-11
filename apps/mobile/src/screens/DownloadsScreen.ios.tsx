import { Fragment, type ReactNode } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { Stack } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  NemuNativeSwitch,
  NemuPressable,
  NemuText,
  PageScaffold,
  nemuFontWeight,
  useMobilePageGutters,
  useNemuTheme,
} from "@/design-system";
import { ExploreSettingsActionGroup, ExploreSettingsFootnote } from "@/components/explore/ExploreSettingsActionGroup";
import { ExploreSettingsGlyph } from "@/components/explore/ExploreSettingsGlyph";
import { useMobileDownloadsPage } from "@/lib/downloads/useMobileDownloadsPage";
import { MOBILE_EXPLORE_GROUP_SHAPE, MOBILE_SETTINGS_GROUP_INSET } from "@/lib/mobileExploreRadius";
import { useMobileAdaptiveLayout } from "@/lib/MobileWindowLayoutContext";
import { getMobileReadableGutters } from "@/lib/mobileReadableWidth";
import { hapticSelection } from "@/lib/haptics";
import { MOBILE_SETTINGS_GLYPH } from "@/lib/mobileSettingsGlyph";
import { ContextMenuView } from "../../modules/nemu-window-layout";

type IoniconName = keyof typeof Ionicons.glyphMap;

/**
 * Settings > Downloads, in the Data Management page's cards: what the
 * downloads take up and the Wi-Fi-only switch; the queue (tap to pause or
 * resume, long press to cancel) with its bulk actions; the downloaded titles
 * (tap to open, long press to delete); and Delete All Downloads, red.
 */
export function DownloadsScreen() {
  const { tokens } = useNemuTheme();
  const page = useMobileDownloadsPage();
  const { strings } = page;
  const gutters = useMobilePageGutters();
  const { regularWidth, width } = useMobileAdaptiveLayout();
  const { fontScale } = useWindowDimensions();
  // The scaffold already pads by the page gutters; on a regular width the
  // cards keep to the readable column, as the Settings sections do.
  const readable = getMobileReadableGutters({ containerWidth: width, gutters, regularWidth, fontScale });
  const column = {
    paddingLeft: readable.paddingLeft - gutters.left,
    paddingRight: readable.paddingRight - gutters.right,
  };
  const running = (status: string) => status === "queued" || status === "downloading";

  return (
    <>
      <Stack.Screen
        options={{ title: strings.downloads.title, headerBackVisible: true, gestureEnabled: true, headerTitle: undefined }}
      />
      <PageScaffold nativeHeader>
        <View style={[styles.list, column]}>
          <View style={styles.wrap}>
            <Group>
              <Row first>
                <NemuText style={[styles.title, { color: tokens.foreground }]}>{strings.downloads.storageUsed}</NemuText>
                <NemuText style={[styles.detail, styles.digits, { color: tokens.mutedForeground }]}>
                  {page.totalLabel}
                </NemuText>
              </Row>
              <Row>
                <NemuText style={[styles.title, { color: tokens.foreground }]}>{strings.downloads.wifiOnly}</NemuText>
                <NemuNativeSwitch
                  accessibilityLabel={strings.downloads.wifiOnly}
                  value={page.wifiOnly}
                  onValueChange={(next) => {
                    void hapticSelection();
                    page.setWifiOnly(next);
                  }}
                />
              </Row>
            </Group>
            <ExploreSettingsFootnote>{strings.downloads.wifiOnlyFooter}</ExploreSettingsFootnote>
          </View>

          {page.empty ? (
            <Group>
              <View style={styles.empty}>
                <Ionicons name="arrow-down-circle-outline" size={28} color={tokens.mutedForeground} />
                <NemuText style={[styles.title, styles.center, { color: tokens.foreground }]}>
                  {strings.downloads.emptyTitle}
                </NemuText>
                <NemuText style={[styles.subtitle, styles.center, { color: tokens.mutedForeground }]}>
                  {strings.downloads.emptyDescription}
                </NemuText>
              </View>
            </Group>
          ) : null}

          {page.queue.length > 0 ? (
            <>
              <Group header={<GroupHeader icon="cloud-download-outline" title={strings.downloads.queueSection} />}>
                {page.queue.map((row, index) => (
                  <ContextMenuView
                    key={row.key}
                    items={[
                      running(row.status)
                        ? { id: "toggle", title: strings.downloads.pause, systemImage: "pause" }
                        : { id: "toggle", title: strings.downloads.resume, systemImage: "arrow.clockwise" },
                      { id: "cancel", title: strings.common.cancel, systemImage: "xmark", destructive: true },
                    ]}
                    onMenuAction={(id) => (id === "cancel" ? page.cancelJob(row.key) : page.toggleJob(row))}
                  >
                    <NemuPressable
                      accessibilityRole="button"
                      accessibilityLabel={`${row.title}. ${row.detail}`}
                      accessibilityHint={running(row.status) ? strings.downloads.pause : strings.downloads.resume}
                      pressedScale={1}
                      pressHighlight
                      onPress={() => page.toggleJob(row)}
                      style={styles.bleed}
                    >
                      {index > 0 ? <Separator /> : null}
                      <View style={styles.jobRow}>
                        <NemuText numberOfLines={1} style={[styles.title, { color: tokens.foreground }]}>
                          {row.title}
                        </NemuText>
                        <NemuText
                          numberOfLines={1}
                          style={[styles.subtitle, { color: row.status === "failed" ? tokens.danger : tokens.mutedForeground }]}
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
                      </View>
                    </NemuPressable>
                  </ContextMenuView>
                ))}
              </Group>
              <ExploreSettingsActionGroup
                actions={[
                  ...(page.hasRunnable ? [{ key: "pause-all", label: strings.downloads.pauseAll, onPress: page.pauseAll }] : []),
                  ...(page.hasPaused ? [{ key: "resume-all", label: strings.downloads.resumeAll, onPress: page.resumeAll }] : []),
                  { key: "cancel-all", label: strings.downloads.cancelAll, destructive: true, onPress: page.cancelAll },
                ]}
                footer={page.waiting ?? undefined}
              />
            </>
          ) : null}

          {page.manga.length > 0 ? (
            <Group header={<GroupHeader icon="folder-outline" title={strings.downloads.downloadedSection} />}>
              {page.manga.map((item, index) => (
                <ContextMenuView
                  key={item.key}
                  items={[{ id: "delete", title: strings.downloads.delete, systemImage: "trash", destructive: true }]}
                  onMenuAction={() => page.deleteManga(item)}
                >
                  <NemuPressable
                    accessibilityRole="button"
                    accessibilityLabel={item.title}
                    accessibilityValue={{ text: `${page.formatChapterCount(item.chapterCount)}, ${page.formatBytes(item.bytes)}` }}
                    hapticFeedback="press"
                    pressedScale={1}
                    pressHighlight
                    onPress={() => page.openManga(item)}
                    style={styles.bleed}
                  >
                    {index > 0 ? <Separator /> : null}
                    <View style={styles.mangaRow}>
                      <View style={styles.text}>
                        <NemuText numberOfLines={1} style={[styles.title, { color: tokens.foreground }]}>
                          {item.title}
                        </NemuText>
                        <NemuText style={[styles.subtitle, { color: tokens.mutedForeground }]}>
                          {page.formatChapterCount(item.chapterCount)}
                        </NemuText>
                      </View>
                      <NemuText style={[styles.detail, styles.digits, { color: tokens.mutedForeground }]}>
                        {page.formatBytes(item.bytes)}
                      </NemuText>
                      <Ionicons name="chevron-forward" size={16} color={tokens.mutedForeground} />
                    </View>
                  </NemuPressable>
                </ContextMenuView>
              ))}
            </Group>
          ) : null}

          <ExploreSettingsActionGroup
            actions={[{
              key: "delete-all",
              label: strings.downloads.deleteAll,
              destructive: true,
              disabled: page.empty,
              onPress: page.confirmDeleteAll,
            }]}
            footer={strings.downloads.localOnlyFooter}
          />
        </View>
      </PageScaffold>
    </>
  );
}

/** A card of the Data Management page; a heading (glyph and title) above its rows when given. */
function Group({ header, children }: { header?: ReactNode; children: ReactNode }) {
  const { tokens } = useNemuTheme();
  return (
    <View
      style={[
        styles.group,
        header ? styles.headedGroup : null,
        { backgroundColor: tokens.card, borderColor: tokens.cardBorder },
      ]}
    >
      {header ? (
        <Fragment>
          {header}
          <View style={styles.headedRows}>{children}</View>
        </Fragment>
      ) : (
        children
      )}
    </View>
  );
}

function GroupHeader({ icon, title }: { icon: IoniconName; title: string }) {
  const { tokens } = useNemuTheme();
  return (
    <View style={styles.header}>
      <View style={styles.headerGlyph}>
        <ExploreSettingsGlyph name={icon} />
      </View>
      <NemuText accessibilityRole="header" style={[styles.headerTitle, { color: tokens.foreground }]}>
        {title}
      </NemuText>
    </View>
  );
}

function Row({ first = false, children }: { first?: boolean; children: ReactNode }) {
  return (
    <View>
      {first ? null : <Separator />}
      <View style={styles.row}>{children}</View>
    </View>
  );
}

/** A hairline on the card's inset, above a row. */
function Separator() {
  const { tokens } = useNemuTheme();
  return <View style={[styles.separator, { backgroundColor: tokens.border }]} />;
}

const styles = StyleSheet.create({
  list: { gap: 16, paddingTop: 8 },
  wrap: { gap: 8 },
  group: {
    ...MOBILE_EXPLORE_GROUP_SHAPE,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  headedGroup: { paddingTop: 12 },
  headedRows: { marginTop: 4 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: MOBILE_SETTINGS_GROUP_INSET,
  },
  // The glyph itself, not its box, sits on the group's inset, as the Settings card headings do.
  headerGlyph: { marginLeft: -(MOBILE_SETTINGS_GLYPH.box - MOBILE_SETTINGS_GLYPH.size) / 2 },
  headerTitle: { flex: 1, fontSize: 15, lineHeight: 20, fontWeight: nemuFontWeight.semibold },
  row: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: MOBILE_SETTINGS_GROUP_INSET,
    paddingVertical: 8,
  },
  bleed: { overflow: "hidden" },
  jobRow: { gap: 2, paddingHorizontal: MOBILE_SETTINGS_GROUP_INSET, paddingVertical: 12 },
  mangaRow: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: MOBILE_SETTINGS_GROUP_INSET,
    paddingVertical: 10,
  },
  separator: {
    position: "absolute",
    top: 0,
    left: MOBILE_SETTINGS_GROUP_INSET,
    right: 0,
    height: StyleSheet.hairlineWidth,
  },
  text: { flex: 1, minWidth: 0, gap: 2 },
  title: { flexShrink: 1, fontSize: 16, lineHeight: 21, fontWeight: nemuFontWeight.medium },
  subtitle: { fontSize: 13, lineHeight: 17 },
  detail: { fontSize: 15, lineHeight: 20 },
  digits: { fontVariant: ["tabular-nums"] },
  track: { height: 3, borderRadius: 2, marginTop: 6, overflow: "hidden" },
  bar: { height: 3, borderRadius: 2 },
  empty: { alignItems: "center", gap: 6, paddingVertical: 24, paddingHorizontal: MOBILE_SETTINGS_GROUP_INSET },
  center: { textAlign: "center" },
});
