import { MOBILE_EXPLORE_RADIUS as R } from "@/lib/mobileExploreRadius";
import { memo, useCallback, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import type { ChapterSummary, LocalChapterProgress } from "@/data/schema";
import { nemuColorWithAlpha, nemuFontWeight, NemuPressable, NemuText, useNemuTheme } from "@/design-system";
import { formatChapterTitle } from "@/lib/formatChapter";
import { getMobileChapterPresentation } from "@/lib/mobileChapterPresentation";
import { formatMobileChapterProgressStatus, getMobileChapterProgressAccessory } from "@/lib/mobileChapterProgress";
import { getMobileExploreChapterRowSubtitle, type MobileChapterVolumeHeader } from "@/lib/mobileExploreChapterList";
import { formatMobileString, type MobileStrings } from "@/lib/mobileI18n";
import { ContextMenuView, type ContextMenuItem } from "../../../modules/nemu-window-layout";

const GLYPH = 18;
const STROKE = 1.75;
const ROW_MIN_HEIGHT = 56;
const TEXT_MAX_SCALE = 1.6;

export type MobileExploreChapterAction = "read" | "start";

/**
 * One chapter in the design-explore list: a single column whose state reads
 * at a glance from a glyph before the title (one stroke weight throughout):
 * a filled dot for a new chapter, a ring that fills with the pages read for
 * one in progress, a check for a read one (whose title also steps back), a
 * lock for a locked one, nothing for a plain unread one. The chapter to read
 * next carries a soft tint and an "Up next" tag. A volume header sits above
 * the first chapter of each volume. Long press: the system context menu with
 * Read / Continue and Read from the beginning (both open the reader; neither
 * writes anything new).
 */
export const MobileExploreChapterRow = memo(function MobileExploreChapterRow({
  chapter,
  progress,
  header,
  commonGroup,
  caption,
  upNext,
  dropVolume,
  busy,
  strings,
  onAction,
}: {
  chapter: ChapterSummary;
  progress: LocalChapterProgress | undefined;
  header: MobileChapterVolumeHeader | null;
  /** The group most of the list shares: named once in `caption`, not on this row. */
  commonGroup: string | null;
  /** First row only: the line above the list naming that group. */
  caption?: string | null;
  upNext: boolean;
  /** The volume is in the header: the row says just the chapter. */
  dropVolume: boolean;
  busy: boolean;
  strings: MobileStrings;
  /** One stable handler for the list (rows are memoised). */
  onAction: (chapter: ChapterSummary, action: MobileExploreChapterAction) => void;
}) {
  const { tokens } = useNemuTheme();
  const presentation = getMobileChapterPresentation(chapter, progress);
  const accessory = getMobileChapterProgressAccessory(progress, { locked: presentation.isLocked });
  const ratio = accessory.status === "progress" ? accessory.ratio : null;
  const shown = dropVolume ? { ...chapter, volumeNumber: undefined } : chapter;
  const title = formatChapterTitle(shown, strings);
  // The source's title only when it adds something (not "第132话 (10p)" under
  // "Chapter 132"), and the group only when it is not the list's own.
  const subtitle = getMobileExploreChapterRowSubtitle(chapter, commonGroup);
  const disabled = presentation.isLocked || busy;
  const status = formatMobileChapterProgressStatus(accessory, strings);
  const label = [
    title,
    subtitle,
    upNext ? strings.designExplore.chapterUpNext : null,
    presentation.isNew ? strings.common.new : null,
    status,
  ]
    .filter(Boolean)
    .join(". ");
  const items = useMemo<ContextMenuItem[]>(() => {
    if (presentation.isLocked) return [];
    const started = presentation.isInProgress || presentation.isRead;
    return [
      {
        id: "read",
        title: presentation.isInProgress ? strings.designExplore.chapterContinue : strings.designExplore.chapterRead,
        systemImage: presentation.isInProgress ? "book" : "book.pages",
      },
      ...(started
        ? [{ id: "start", title: strings.designExplore.chapterReadFromStart, systemImage: "arrow.counterclockwise" }]
        : []),
    ];
  }, [presentation.isInProgress, presentation.isLocked, presentation.isRead, strings]);
  const press = useCallback(() => onAction(chapter, "read"), [chapter, onAction]);
  const menu = useCallback(
    (id: string) => onAction(chapter, id === "start" ? "start" : "read"),
    [chapter, onAction],
  );
  const glyphColor = presentation.isRead || presentation.isLocked ? tokens.mutedForeground : tokens.primary;

  return (
    <View>
      {caption ? (
        <NemuText
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          numberOfLines={1}
          color={tokens.mutedForeground}
          style={styles.caption}
        >
          {caption}
        </NemuText>
      ) : null}
      {header ? <VolumeHeader header={header} strings={strings} /> : null}
      <ContextMenuView items={items} onMenuAction={menu} style={styles.menu}>
        <NemuPressable
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityHint={strings.designExplore.chapterRowHint}
          accessibilityState={{ disabled }}
          disabled={disabled}
          pressProfile="row"
          pressHighlight
          pressedScale={1}
          onPress={press}
          style={[
            styles.row,
            { borderRadius: R.row, borderCurve: "continuous" },
            upNext ? { backgroundColor: tokens.primarySoft } : null,
          ]}
        >
          <View style={styles.glyph}>
            {presentation.isLocked ? (
              <LockGlyph color={glyphColor} />
            ) : presentation.isRead ? (
              <CheckGlyph color={glyphColor} />
            ) : ratio !== null ? (
              <RingGlyph color={glyphColor} track={nemuColorWithAlpha(glyphColor, 0.22)} ratio={ratio} />
            ) : (
              // Every unread chapter carries the one dot; a new one a touch larger.
              <View style={[styles.dot, presentation.isNew ? styles.dotNew : null, { backgroundColor: glyphColor }]} />
            )}
          </View>
          <View style={[styles.text, styles.textRow, { borderBottomColor: tokens.border }]}>
            <View style={styles.textBody}>
            <View style={styles.titleLine}>
              <NemuText
                numberOfLines={1}
                maxFontSizeMultiplier={TEXT_MAX_SCALE}
                color={presentation.isRead || presentation.isLocked ? tokens.mutedForeground : upNext || presentation.isInProgress ? tokens.primary : tokens.foreground}
                style={[styles.title, presentation.isRead ? styles.titleRead : null]}
              >
                {title}
              </NemuText>
              {upNext ? (
                <NemuText maxFontSizeMultiplier={1.3} color={tokens.primary} style={styles.newText}>
                  {strings.designExplore.chapterUpNext}
                </NemuText>
              ) : presentation.isNew ? (
                // Uploaded within the last 7 days and unread: a small tinted badge.
                <View style={[styles.newBadge, { backgroundColor: tokens.primarySoft }]}>
                  <NemuText maxFontSizeMultiplier={1.3} color={tokens.primary} style={styles.newBadgeText}>
                    {strings.common.new}
                  </NemuText>
                </View>
              ) : null}
             </View>
            {subtitle ? (
              <NemuText
                numberOfLines={1}
                maxFontSizeMultiplier={TEXT_MAX_SCALE}
                color={tokens.mutedForeground}
                style={styles.subtitle}
              >
                {subtitle}
              </NemuText>
            ) : null}
            </View>
            <View style={styles.trail} pointerEvents="none">
              {!disabled ? (
                <Ionicons name="chevron-forward" size={15} color={nemuColorWithAlpha(tokens.mutedForeground, 0.7)} />
              ) : null}
             </View>
          </View>
        </NemuPressable>
      </ContextMenuView>
    </View>
  );
});

function VolumeHeader({ header, strings }: { header: MobileChapterVolumeHeader; strings: MobileStrings }) {
  const { tokens } = useNemuTheme();
  const title =
    header.volume !== null
      ? formatMobileString(strings.designExplore.chapterVolume, { volume: header.volume })
      : header.after
        ? formatMobileString(strings.designExplore.chapterAfterVolume, { volume: header.after })
        : strings.designExplore.chapterNoVolume;
  const range =
    header.from !== null && header.to !== null && header.from !== header.to
      ? formatMobileString(strings.designExplore.chapterRange, { from: header.from, to: header.to })
      : null;
  return (
    <View accessibilityRole="header" accessible style={styles.header}>
      <NemuText maxFontSizeMultiplier={TEXT_MAX_SCALE} color={tokens.foreground} style={styles.headerTitle}>
        {title}
      </NemuText>
      {range ? (
        <NemuText maxFontSizeMultiplier={TEXT_MAX_SCALE} color={tokens.mutedForeground} style={styles.headerRange}>
          {range}
        </NemuText>
      ) : null}
    </View>
  );
}

function CheckGlyph({ color }: { color: string }) {
  return (
    <Svg width={GLYPH} height={GLYPH} viewBox="0 0 18 18">
      <Path d="M4.5 9.4 7.6 12.4 13.5 5.8" stroke={color} strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

function LockGlyph({ color }: { color: string }) {
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
function RingGlyph({ color, track, ratio }: { color: string; track: string; ratio: number }) {
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
  dot: {
    width: 7,
    height: 7,
    borderRadius: 7 / 2,
  },
  dotNew: {
    width: 8,
    height: 8,
    borderRadius: 8 / 2,
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
    width: 32,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
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
  subtitle: {
    marginTop: 1,
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
  // On the titles' edge (past the state glyph column), as a line about them.
  caption: {
    paddingTop: 4,
    paddingBottom: 2,
    paddingLeft: 30,
    paddingRight: 8,
    fontSize: 13,
    lineHeight: 17,
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
