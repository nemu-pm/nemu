import { memo, useCallback, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  StyleSheet,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type ListRenderItemInfo,
} from "react-native";
import {
  MobileChapterCheckGlyph,
  MobileChapterLockGlyph,
  MobileChapterProgressGlyph,
  MobileExploreChapterVolumeHeader,
} from "@/components/explore/MobileExploreChapterRow";
import {
  nemuColorWithAlpha,
  nemuFontWeight,
  NemuPressable,
  NemuSheetScrollEdge,
  NemuText,
  useNemuTheme,
} from "@/design-system";
import type { ChapterSummary, LocalChapterProgress } from "@/data/schema";
import { formatChapterRowTitle } from "@/lib/formatChapter";
import { hapticError, hapticSelection } from "@/lib/haptics";
import { getMobileChapterPresentation } from "@/lib/mobileChapterPresentation";
import { formatMobileChapterProgressStatus, getMobileChapterProgressAccessory } from "@/lib/mobileChapterProgress";
import { getMobileExploreChapterRowSubtitle } from "@/lib/mobileExploreChapterList";
import { MOBILE_EXPLORE_RADIUS as R } from "@/lib/mobileExploreRadius";
import type { MobileStrings } from "@/lib/mobileI18n";
import {
  MOBILE_READER_CHAPTER_LIST_BOTTOM_PADDING,
  MOBILE_READER_CHAPTER_LIST_PADDING,
  MOBILE_READER_CHAPTER_LIST_TEXT_MAX_SCALE,
  mobileReaderChapterListInitialScroll,
  mobileReaderChapterListMetrics,
  mobileReaderChapterListOffsets,
  mobileReaderChapterListTapAction,
  type MobileReaderChapterList,
  type MobileReaderChapterListItem,
  type MobileReaderChapterListStartAt,
} from "@/lib/mobileReaderChapterList";
import { useMobileReaderResumePosition } from "@/lib/useMobileReaderResumePosition";

const LOCKED_OPACITY = 0.72;

/**
 * The reader's chapter list, in the sheet's body: the detail page's rows
 * (`MobileExploreChapterRow`'s glyphs, text and volume headers) without its
 * long-press menu, the open chapter tinted. Virtualised at a fixed row height,
 * it opens already scrolled to the open chapter, however long the list.
 */
export function ReaderChapterListBody({
  list,
  currentChapterId,
  progressById,
  strings,
  onClose,
  onSelectChapter,
}: {
  list: MobileReaderChapterList;
  currentChapterId: string;
  progressById: Record<string, LocalChapterProgress | undefined>;
  strings: MobileStrings;
  onClose: () => void;
  onSelectChapter: (chapter: ChapterSummary, startAt: MobileReaderChapterListStartAt) => void;
}) {
  const { tokens } = useNemuTheme();
  const { fontScale } = useWindowDimensions();
  const metrics = useMemo(() => mobileReaderChapterListMetrics(fontScale), [fontScale]);
  const { offsets, end } = useMemo(() => mobileReaderChapterListOffsets(list.items, metrics), [list.items, metrics]);
  // Known once the sheet has laid the body out; the list then mounts where it opens.
  const [viewportHeight, setViewportHeight] = useState(0);
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout;
    if (height > 0) setViewportHeight((current) => (current > 0 ? current : height));
  }, []);
  const initialScroll = useMemo(
    () => mobileReaderChapterListInitialScroll({ offsets, end, metrics, currentIndex: list.currentIndex, viewportHeight }),
    // Where this presentation opens: fixed once the list has mounted there.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viewportHeight > 0],
  );
  // `initialScrollIndex` opens on a row's top; the first layout settles on the exact place.
  const listRef = useRef<FlatList<MobileReaderChapterListItem>>(null);
  const settledRef = useRef(false);
  const settle = useCallback(() => {
    if (settledRef.current) return;
    settledRef.current = true;
    if (initialScroll.offset > 0) listRef.current?.scrollToOffset({ offset: initialScroll.offset, animated: false });
  }, [initialScroll.offset]);
  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({
      index,
      offset: offsets[index] ?? 0,
      length: list.items[index]?.kind === "header" ? metrics.headerHeight : metrics.rowHeight,
    }),
    [list.items, metrics, offsets],
  );
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<MobileReaderChapterListItem>) =>
      item.kind === "header" ? (
        <View style={{ height: metrics.headerHeight }}>
          <MobileExploreChapterVolumeHeader header={item.header} strings={strings} />
        </View>
      ) : (
        <ReaderChapterListRow
          chapter={item.chapter}
          progress={progressById[item.chapter.id]}
          current={item.chapter.id === currentChapterId}
          currentChapterId={currentChapterId}
          dropVolume={list.dropVolume}
          commonGroup={list.commonGroup}
          height={metrics.rowHeight}
          strings={strings}
          onClose={onClose}
          onSelectChapter={onSelectChapter}
        />
      ),
    [
      currentChapterId,
      list.commonGroup,
      list.dropVolume,
      metrics,
      onClose,
      onSelectChapter,
      progressById,
      strings,
    ],
  );

  if (list.items.length === 0) {
    return (
      <View style={styles.empty}>
        <NemuText color={tokens.mutedForeground} style={styles.emptyText}>
          {strings.reader.chapterListEmpty}
        </NemuText>
      </View>
    );
  }
  return (
    <View style={styles.body} onLayout={handleLayout}>
      {viewportHeight > 0 ? (
        <NemuSheetScrollEdge style={styles.body}>
          {(edge) => (
            <FlatList
              {...edge}
              // Android: inside a native sheet, hand the drag to the sheet at the top.
              nestedScrollEnabled
              style={styles.body}
              data={list.items}
              keyExtractor={itemKey}
              renderItem={renderItem}
              getItemLayout={getItemLayout}
              ref={listRef}
              onContentSizeChange={settle}
              initialScrollIndex={initialScroll.index}
              initialNumToRender={Math.ceil(viewportHeight / metrics.rowHeight) + 2}
              maxToRenderPerBatch={16}
              windowSize={9}
              contentContainerStyle={styles.content}
            />
          )}
        </NemuSheetScrollEdge>
      ) : null}
    </View>
  );
}

function itemKey(item: MobileReaderChapterListItem): string {
  return item.key;
}

const ReaderChapterListRow = memo(function ReaderChapterListRow({
  chapter,
  progress,
  current,
  currentChapterId,
  dropVolume,
  commonGroup,
  height,
  strings,
  onClose,
  onSelectChapter,
}: {
  chapter: ChapterSummary;
  progress: LocalChapterProgress | undefined;
  current: boolean;
  currentChapterId: string;
  dropVolume: boolean;
  commonGroup: string | null;
  height: number;
  strings: MobileStrings;
  onClose: () => void;
  onSelectChapter: (chapter: ChapterSummary, startAt: MobileReaderChapterListStartAt) => void;
}) {
  const { tokens } = useNemuTheme();
  const presentation = getMobileChapterPresentation(chapter, progress);
  // The page the reader opens at (this device's own spot when it holds one).
  const localResume = useMobileReaderResumePosition(progress?.id);
  const accessory = getMobileChapterProgressAccessory(progress, { locked: presentation.isLocked, local: localResume });
  const ratio = accessory.status === "progress" ? accessory.ratio : null;
  const title = formatChapterRowTitle(chapter, strings, { dropVolume });
  const subtitle = getMobileExploreChapterRowSubtitle(chapter, commonGroup);
  const status = formatMobileChapterProgressStatus(accessory, strings);
  const secondary = tokens.mutedForeground;
  const accent = current ? tokens.primary : tokens.foreground;
  const glyphColor = presentation.isRead || presentation.isLocked ? secondary : accent;
  const label = [
    title,
    subtitle,
    current ? strings.reader.chapterListCurrent : null,
    presentation.isNew ? strings.common.new : null,
    status,
  ]
    .filter(Boolean)
    .join(". ");
  const press = () => {
    const action = mobileReaderChapterListTapAction({
      chapter,
      completed: presentation.isRead,
      accessory,
      currentChapterId,
    });
    if (action.kind === "close") {
      onClose();
    } else if (action.kind === "locked") {
      void hapticError();
      // Dark like the sheet it is over (the system's alert takes the app's appearance).
      Alert.alert(strings.reader.chapterLockedTitle, strings.reader.chapterLockedDetail, undefined, {
        userInterfaceStyle: "dark",
      });
    } else {
      void hapticSelection();
      onSelectChapter(chapter, action.startAt);
    }
  };

  return (
    <NemuPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: current }}
      pressProfile="row"
      pressHighlight
      pressedScale={1}
      onPress={press}
      style={[
        styles.row,
        { height, opacity: presentation.isLocked ? LOCKED_OPACITY : 1, borderRadius: R.row, borderCurve: "continuous" },
        current ? { backgroundColor: tokens.primarySoft } : null,
      ]}
    >
      <View style={styles.glyph}>
        {presentation.isLocked ? (
          <MobileChapterLockGlyph color={glyphColor} />
        ) : presentation.isRead ? (
          <MobileChapterCheckGlyph color={glyphColor} />
        ) : ratio !== null ? (
          <MobileChapterProgressGlyph color={glyphColor} track={nemuColorWithAlpha(glyphColor, 0.22)} ratio={ratio} />
        ) : null}
      </View>
      <View style={[styles.text, { borderBottomColor: current ? "transparent" : tokens.border }]}>
        <View style={styles.titleLine}>
          <NemuText
            numberOfLines={1}
            maxFontSizeMultiplier={MOBILE_READER_CHAPTER_LIST_TEXT_MAX_SCALE}
            color={presentation.isRead || presentation.isLocked ? secondary : accent}
            style={[styles.title, presentation.isRead ? styles.titleRead : null]}
          >
            {title}
          </NemuText>
          {presentation.isNew ? (
            <View style={[styles.newBadge, { backgroundColor: tokens.primarySoft }]}>
              <NemuText maxFontSizeMultiplier={1.3} color={accent} style={styles.newBadgeText}>
                {strings.common.new}
              </NemuText>
            </View>
          ) : null}
        </View>
        {subtitle ? (
          <NemuText
            numberOfLines={1}
            maxFontSizeMultiplier={MOBILE_READER_CHAPTER_LIST_TEXT_MAX_SCALE}
            color={secondary}
            style={styles.subtitle}
          >
            {subtitle}
          </NemuText>
        ) : null}
      </View>
    </NemuPressable>
  );
});

const styles = StyleSheet.create({
  body: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 12,
    paddingTop: MOBILE_READER_CHAPTER_LIST_PADDING,
    paddingBottom: MOBILE_READER_CHAPTER_LIST_BOTTOM_PADDING,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  emptyText: {
    fontSize: 15,
    textAlign: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  glyph: {
    width: 28,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: StyleSheet.hairlineWidth,
  },
  text: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    paddingRight: 12,
    marginLeft: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
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
});
