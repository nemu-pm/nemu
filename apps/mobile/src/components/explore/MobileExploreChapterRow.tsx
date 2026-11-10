import { useMobileMangaDetailPane } from "@/components/MobileMangaDetailPaneContext";
import { MOBILE_EXPLORE_RADIUS as R } from "@/lib/mobileExploreRadius";
import { memo, useCallback, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { useMobileLanguageSettings } from "@/data/mobileHooks";
import type { ChapterSummary, LocalChapterProgress } from "@/data/schema";
import { nemuColorWithAlpha, nemuFontWeight, NemuPressable, NemuText, useNemuTheme } from "@/design-system";
import { formatChapterRowTitle } from "@/lib/formatChapter";
import { getMobileChapterPresentation } from "@/lib/mobileChapterPresentation";
import { resolveMobileShareUrl } from "@/lib/mobileChapterReadMarks";
import { formatMobileChapterProgressStatus, getMobileChapterProgressAccessory } from "@/lib/mobileChapterProgress";
import {
  getMobileExploreChapterRowDetail,
  getMobileExploreChapterRowSubtitle,
  mobileChapterVolumeHeaderShowsRange,
  type MobileChapterVolumeHeader,
} from "@/lib/mobileExploreChapterList";
import { formatMobileString, type MobileStrings } from "@/lib/mobileI18n";
import { formatMobileDetailDate } from "@/lib/mobileMangaDetailInfo";
import { useMobileReaderResumePosition } from "@/lib/useMobileReaderResumePosition";
import { ContextMenuView, type ContextMenuItem } from "../../../modules/nemu-window-layout";
import { MobileChapterDownloadGlyph } from "@/components/MobileChapterDownloadGlyph";
import { formatMobileChapterDownloadStatus } from "@/lib/downloads/mobileDownloadStatusLabel";
import { useMobileChapterDownloadStatus } from "@/lib/downloads/mobileDownloads";
import type { MobileDownloadMangaRef } from "@/lib/downloads/mobileDownloadTypes";

const GLYPH = 18;
const STROKE = 1.75;
/** Two lines of text, the row's padding and its rule: every row is this tall, whatever its second line has to say. */
const ROW_MIN_HEIGHT = 57 + StyleSheet.hairlineWidth;
const TEXT_MAX_SCALE = 1.6;

export type MobileExploreChapterAction =
  | "read"
  | "start"
  | "markRead"
  | "markUnread"
  | "markPreviousRead"
  | "share"
  | "copyLink"
  | "download"
  | "cancelDownload"
  | "removeDownload"
  /** Selection mode: the row was tapped. */
  | "toggleSelected";

const MENU_ACTIONS: readonly MobileExploreChapterAction[] = [
  "start",
  "markRead",
  "markUnread",
  "markPreviousRead",
  "share",
  "copyLink",
  "download",
  "cancelDownload",
  "removeDownload",
];

/**
 * One chapter in the design-explore list: a single column whose state reads
 * at a glance from a glyph before the title (one stroke weight throughout):
 * a ring that fills with the pages read for
 * one in progress, a check for a read one (whose title also steps back), a
 * lock for a locked one, nothing for a plain unread one. The chapter to read
 * next carries a soft tint and an "Up next" tag. A volume header sits above
 * the first chapter of each volume. The same two lines at any width: the title
 * with its tag, then the source's title and group with the reader's page. Long press: the system context menu with
 * Read / Continue and Read from the beginning (both open the reader), and
 * with `moreActions` Mark as Read (or as Unread once started), Mark Previous
 * as Read, Share and Copy Link. With `downloadManga` the row also shows the
 * chapter's download state on its trailing edge, and the menu downloads,
 * cancels or removes it. While the list is selecting chapters (`selected` is
 * a boolean) a tap toggles the row and the menu is off.
 */
export const MobileExploreChapterRow = memo(function MobileExploreChapterRow({
  chapter,
  progress,
  header,
  commonGroup,
  upNext,
  dropVolume,
  busy,
  strings,
  onAction,
  moreActions = false,
  downloadManga = null,
  selected = null,
}: {
  chapter: ChapterSummary;
  progress: LocalChapterProgress | undefined;
  header: MobileChapterVolumeHeader | null;
  /** The group every chapter of the list shares: left off this row. */
  commonGroup: string | null;
  upNext: boolean;
  /** The volume is in the header: the row says just the chapter. */
  dropVolume: boolean;
  busy: boolean;
  strings: MobileStrings;
  /** One stable handler for the list (rows are memoised). */
  onAction: (chapter: ChapterSummary, action: MobileExploreChapterAction) => void;
  /**
   * The long press also marks chapters read and shares the chapter's link
   * (where the page handles them; the link only when the source gives one).
   */
  moreActions?: boolean;
  /** The work the chapter belongs to, when its chapters can be downloaded. */
  downloadManga?: MobileDownloadMangaRef | null;
  /** Selection mode: whether this row is selected; null when not selecting. */
  selected?: boolean | null;
}) {
  const { tokens } = useNemuTheme();
  const { appLanguage } = useMobileLanguageSettings();
  const shareable = Boolean(resolveMobileShareUrl(chapter.url));
  const { chapterPalette } = useMobileMangaDetailPane();
  const selectedInk = upNext ? chapterPalette?.primaryInk : undefined;
  const foreground = selectedInk ?? chapterPalette?.ink ?? tokens.foreground;
  const secondary = selectedInk ?? chapterPalette?.inkSecondary ?? tokens.mutedForeground;
  const accent = selectedInk ?? chapterPalette?.ink ?? tokens.primary;
  const selection = chapterPalette?.primary ?? tokens.primarySoft;
  const presentation = getMobileChapterPresentation(chapter, progress);
  const download = useMobileChapterDownloadStatus(downloadManga, chapter.id);
  const selecting = selected !== null;
  // "Page X of Y" and the ring: the page the reader opens at (this device's
  // own spot when it holds one, else the synced high-water page).
  const localResume = useMobileReaderResumePosition(progress?.id);
  const accessory = getMobileChapterProgressAccessory(progress, { locked: presentation.isLocked, local: localResume });
  const ratio = accessory.status === "progress" ? accessory.ratio : null;
  const title = formatChapterRowTitle(chapter, strings, { dropVolume });
  // The source's title only when it adds something (not "第132话 (10p)" under
  // "Chapter 132"), and the group only when it is not the list's own.
  const subtitle = getMobileExploreChapterRowSubtitle(chapter, commonGroup);
  const disabled = presentation.isLocked || (busy && !selecting);
  const status = formatMobileChapterProgressStatus(accessory, strings);
  const detail = getMobileExploreChapterRowDetail({
    subtitle,
    status: accessory.status === "completed" ? null : status,
    date: formatMobileDetailDate(chapter.dateUploaded, appLanguage),
    completed: accessory.status === "completed" ? status : null,
  });
  const label = [
    title,
    detail.text,
    upNext ? strings.designExplore.chapterUpNext : null,
    presentation.isNew ? strings.common.new : null,
    detail.text === status ? null : status,
    formatMobileChapterDownloadStatus(download, strings),
  ]
    .filter(Boolean)
    .join(". ");
  const items = useMemo<ContextMenuItem[]>(() => {
    if (presentation.isLocked || selecting) return [];
    const started = presentation.isInProgress || presentation.isRead;
    const downloadItems: ContextMenuItem[] = !downloadManga
      ? []
      : download.kind === "downloaded"
        ? [{ id: "removeDownload", title: strings.downloads.removeDownload, systemImage: "trash", destructive: true }]
        : download.kind === "none"
          ? [{ id: "download", title: strings.downloads.downloadChapter, systemImage: "arrow.down.circle" }]
          : download.kind === "failed"
            ? [
                { id: "download", title: strings.downloads.retryDownload, systemImage: "arrow.clockwise" },
                { id: "cancelDownload", title: strings.downloads.cancelDownload, systemImage: "xmark.circle" },
              ]
            : [{ id: "cancelDownload", title: strings.downloads.cancelDownload, systemImage: "xmark.circle" }];
    return [
      {
        id: "read",
        title: presentation.isInProgress ? strings.designExplore.chapterContinue : strings.designExplore.chapterRead,
        systemImage: presentation.isInProgress ? "book" : "book.pages",
      },
      ...(started
        ? [{ id: "start", title: strings.designExplore.chapterReadFromStart, systemImage: "arrow.counterclockwise" }]
        : []),
      ...(moreActions
        ? [
            ...(presentation.isRead
              ? []
              : [{ id: "markRead", title: strings.designExplore.chapterMarkRead, systemImage: "checkmark.circle" }]),
            ...(started
              ? [{ id: "markUnread", title: strings.designExplore.chapterMarkUnread, systemImage: "circle" }]
              : []),
            {
              id: "markPreviousRead",
              title: strings.designExplore.chapterMarkPreviousRead,
              systemImage: "checkmark.circle.badge.plus",
            },
            ...(shareable
              ? [
                  { id: "share", title: strings.designExplore.menuShare, systemImage: "square.and.arrow.up" },
                  { id: "copyLink", title: strings.designExplore.menuCopyLink, systemImage: "link" },
                ]
              : []),
          ]
        : []),
      ...downloadItems,
    ];
  }, [
    download.kind,
    downloadManga,
    moreActions,
    presentation.isInProgress,
    presentation.isLocked,
    presentation.isRead,
    selecting,
    shareable,
    strings,
  ]);
  const press = useCallback(
    () => onAction(chapter, selecting ? "toggleSelected" : "read"),
    [chapter, onAction, selecting],
  );
  const menu = useCallback(
    (id: string) => {
      const action = MENU_ACTIONS.find((candidate) => candidate === id);
      onAction(chapter, action ?? "read");
    },
    [chapter, onAction],
  );
  const glyphColor = presentation.isRead || presentation.isLocked ? secondary : accent;

  return (
    <View>
      {header ? <MobileExploreChapterVolumeHeader header={header} strings={strings} /> : null}
      <ContextMenuView items={items} onMenuAction={menu} style={styles.menu}>
        <NemuPressable
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityHint={strings.designExplore.chapterRowHint}
          accessibilityState={selecting ? { disabled, selected: selected === true } : { disabled }}
          disabled={disabled}
          pressProfile="row"
          pressHighlight
          pressedScale={1}
          onPress={press}
          style={[
            styles.row,
            { borderRadius: R.row, borderCurve: "continuous" },
            upNext ? { backgroundColor: selection } : null,
          ]}
        >
          <View style={styles.glyph}>
            {selecting && !presentation.isLocked ? (
              <MobileChapterSelectionGlyph selected={selected === true} color={accent} ring={secondary} />
            ) : presentation.isLocked ? (
              <MobileChapterLockGlyph color={glyphColor} />
            ) : presentation.isRead ? (
              <MobileChapterCheckGlyph color={glyphColor} />
            ) : ratio !== null ? (
              <MobileChapterProgressGlyph color={glyphColor} track={nemuColorWithAlpha(glyphColor, 0.22)} ratio={ratio} />
            ) : null}
          </View>
          <View style={[styles.text, styles.textRow, { borderBottomColor: upNext && chapterPalette ? "transparent" : chapterPalette?.rule ?? tokens.border }]}>
            <View style={styles.textBody}>
            <View style={styles.titleLine}>
              <NemuText
                numberOfLines={1}
                maxFontSizeMultiplier={TEXT_MAX_SCALE}
                color={presentation.isRead || presentation.isLocked ? secondary : upNext || presentation.isInProgress ? accent : foreground}
                style={[styles.title, presentation.isRead ? styles.titleRead : null]}
              >
                {title}
              </NemuText>
              {upNext ? (
                <NemuText maxFontSizeMultiplier={1.3} color={accent} style={styles.newText}>
                  {strings.designExplore.chapterUpNext}
                </NemuText>
              ) : presentation.isNew ? (
                // Uploaded within the last 7 days and unread: a small tinted badge.
                <View style={[styles.newBadge, { backgroundColor: chapterPalette?.rule ?? tokens.primarySoft }]}>
                  <NemuText maxFontSizeMultiplier={1.3} color={accent} style={styles.newBadgeText}>
                    {strings.common.new}
                  </NemuText>
                </View>
              ) : null}
             </View>
            {detail.text || detail.status ? (
              <View style={styles.detailLine}>
                {detail.text ? (
                  <NemuText numberOfLines={1} maxFontSizeMultiplier={TEXT_MAX_SCALE} color={secondary} style={styles.detailText}>
                    {detail.text}
                  </NemuText>
                ) : null}
                {/* The page stays whole; a long title gives way to it. */}
                {detail.status ? (
                  <NemuText numberOfLines={1} maxFontSizeMultiplier={TEXT_MAX_SCALE} color={secondary} style={styles.detailStatus}>
                    {detail.text ? ` · ${detail.status}` : detail.status}
                  </NemuText>
                ) : null}
              </View>
            ) : null}
            </View>
            <View style={[styles.trail, download.kind !== "none" ? styles.trailWithDownload : null]} pointerEvents="none">
              <MobileChapterDownloadGlyph
                status={download}
                color={download.kind === "downloaded" ? nemuColorWithAlpha(secondary, 0.85) : accent}
                dangerColor={tokens.danger}
              />
              {!disabled && !selecting ? (
                <Ionicons name="chevron-forward" size={15} color={nemuColorWithAlpha(secondary, 0.7)} />
              ) : null}
             </View>
          </View>
        </NemuPressable>
      </ContextMenuView>
    </View>
  );
});

export function MobileExploreChapterVolumeHeader({ header, strings }: { header: MobileChapterVolumeHeader; strings: MobileStrings }) {
  const { tokens } = useNemuTheme();
  const { chapterPalette } = useMobileMangaDetailPane();
  const secondary = chapterPalette?.inkSecondary ?? tokens.mutedForeground;
  const title =
    header.volume !== null
      ? formatMobileString(strings.designExplore.chapterVolume, { volume: header.volume })
      : header.after
        ? formatMobileString(strings.designExplore.chapterAfterVolume, { volume: header.after })
        : strings.designExplore.chapterNoVolume;
  const range = mobileChapterVolumeHeaderShowsRange(header)
    ? formatMobileString(strings.designExplore.chapterRange, { from: header.from, to: header.to })
    : null;
  return (
    <View accessibilityRole="header" accessible style={styles.header}>
      <NemuText maxFontSizeMultiplier={TEXT_MAX_SCALE} color={chapterPalette?.ink ?? tokens.foreground} style={styles.headerTitle}>
        {title}
      </NemuText>
      {range ? (
        <NemuText maxFontSizeMultiplier={TEXT_MAX_SCALE} color={secondary} style={styles.headerRange}>
          {range}
        </NemuText>
      ) : null}
    </View>
  );
}

export function MobileChapterCheckGlyph({ color }: { color: string }) {
  return (
    <Svg width={GLYPH} height={GLYPH} viewBox="0 0 18 18">
      <Path d="M4.5 9.4 7.6 12.4 13.5 5.8" stroke={color} strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

/** Selection mode's leading mark: an empty ring, or a filled disc with a check. */
export function MobileChapterSelectionGlyph({ selected, color, ring }: { selected: boolean; color: string; ring: string }) {
  return (
    <Svg width={GLYPH + 2} height={GLYPH + 2} viewBox="0 0 20 20">
      {selected ? (
        <>
          <Circle cx={10} cy={10} r={9} fill={color} />
          <Path d="M5.8 10.2 8.6 13l5.6-6" stroke="#fff" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </>
      ) : (
        <Circle cx={10} cy={10} r={8.6} stroke={nemuColorWithAlpha(ring, 0.6)} strokeWidth={1.3} fill="none" />
      )}
    </Svg>
  );
}

export function MobileChapterLockGlyph({ color }: { color: string }) {
  return (
    <Svg width={GLYPH} height={GLYPH} viewBox="0 0 18 18">
      <Rect x={4.2} y={8} width={9.6} height={7} rx={1.8} stroke={color} strokeWidth={STROKE} fill="none" />
      <Path d="M6.4 8V6.2a2.6 2.6 0 0 1 5.2 0V8" stroke={color} strokeWidth={STROKE} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

/**
 * Pages read, as a pie that fills clockwise from the top inside a thin
 * outline: a static amount, never mistaken for an activity ring.
 */
export function MobileChapterProgressGlyph({ color, track, ratio }: { color: string; track: string; ratio: number }) {
  const shown = Math.max(0.08, Math.min(0.999, ratio));
  const angle = shown * Math.PI * 2;
  const r = 5;
  const x = 9 + r * Math.sin(angle);
  const y = 9 - r * Math.cos(angle);
  const large = shown > 0.5 ? 1 : 0;
  return (
    <Svg width={GLYPH} height={GLYPH} viewBox="0 0 18 18">
      <Circle cx={9} cy={9} r={7.25} stroke={color} strokeWidth={1.2} fill={track} />
      <Path d={`M9 9V${9 - r}A${r} ${r} 0 ${large} 1 ${x.toFixed(2)} ${y.toFixed(2)}Z`} fill={color} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  menu: {
    borderRadius: R.row,
  },
  row: {
    minHeight: ROW_MIN_HEIGHT,
    flexDirection: "row",
    alignItems: "stretch",
  },
  // The marker is centred on the whole row (title and subtitle), as the
  // chevron is: clear of the row's bottom rule, which only the text column draws.
  glyph: {
    width: 24,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: StyleSheet.hairlineWidth,
  },
  text: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    paddingVertical: 9,
    paddingRight: 10,
    marginLeft: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  textRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  textBody: {
    flex: 1,
    minWidth: 0,
  },
  trail: {
    minWidth: 32,
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  trailWithDownload: {
    paddingLeft: 8,
  },
  titleLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    flexShrink: 1,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: nemuFontWeight.semibold,
  },
  titleRead: {
    fontWeight: nemuFontWeight.regular,
  },
  detailLine: {
    flexDirection: "row",
    marginTop: 1,
  },
  detailText: {
    flexShrink: 1,
    fontSize: 13,
    lineHeight: 17,
  },
  detailStatus: {
    flexShrink: 0,
    fontSize: 13,
    lineHeight: 17,
  },
  newBadge: {
    borderRadius: R.row,
    paddingHorizontal: 7,
    paddingVertical: 1,
  },
  newBadgeText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: nemuFontWeight.bold,
    textTransform: "uppercase",
  },
  newText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: nemuFontWeight.semibold,
  },
  header: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingTop: 18,
    paddingBottom: 6,
  },
  headerTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: nemuFontWeight.bold,
  },
  headerRange: {
    fontSize: 13,
    lineHeight: 17,
  },
});
