import Ionicons from "@expo/vector-icons/Ionicons";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  Animated,
  FlatList,
  Pressable,
  StyleSheet,
  View,
  type GestureResponderEvent,
} from "react-native";
import { NemuText, nemuFontWeight, radius } from "@/design-system";
import { formatMobileString, type MobileStrings } from "@/lib/mobileI18n";
import {
  mobileReaderBookThumbnailFollowOffset,
  mobileReaderBookThumbnailLayout,
  READER_BOOK_THUMBNAIL_CURRENT_COLOR,
  READER_BOOK_THUMBNAIL_CURRENT_STROKE,
  READER_BOOK_THUMBNAIL_FOLLOW_RESUME_MS,
  READER_BOOK_THUMBNAIL_GAP,
  READER_BOOK_THUMBNAIL_RADIUS,
} from "@/lib/mobileReaderBookSidePane";
import {
  mobileReaderLivePageIndex,
  type MobileReaderLivePageStore,
} from "@/lib/mobileReaderLivePage";
import {
  mobileReaderPageRevealed,
  type MobileReaderNotebookPanePreference,
  type MobileReaderNotebookReveal,
} from "@/lib/mobileReaderNotebookPane";
import {
  mobileReaderAbsoluteRect,
  type MobileReaderBookSidePane,
} from "@/lib/mobileReaderPoseLayout";
import { MOBILE_READER_SCROLL_PLACEHOLDER_COLOR } from "@/lib/mobileReaderScrollPresentation";
import type { WindowLayoutRect } from "@/lib/mobileWindowLayout";
import { ReaderScreenStepGlyph } from "./ReaderScreenStepGlyph";

export type ReaderBookSidePaneProps = {
  /** Reader-local geometry (`MobileReaderPoseLayout.sidePane`). */
  layout: MobileReaderBookSidePane;
  /** The Laptop Mode setting: thumbnails (`filmstrip`) or page controls (`trackpad`). */
  content: MobileReaderNotebookPanePreference;
  /** The reader's black. */
  backgroundColor: string;
  strings: MobileStrings;
  /** `formatChapterTitle` of the chapter the thumbnails show. */
  chapterTitle: string | null;
  pageCount: number;
  /** Each page's height / width (`mobileReaderScrollPageRatios`). */
  thumbnailRatios: readonly number[];
  /**
   * Per page: identifies the image a thumbnail shows (it changes when a
   * processed file replaces a pending page); null while the page has nothing
   * to show yet (source processing pending) — no request is made then.
   */
  thumbnailKeys: readonly (string | null)[];
  /** Resolves a visible thumbnail through the reader's page cache (prefetch priority). */
  thumbnailUri: (index: number, signal: AbortSignal) => Promise<string | null>;
  revealed: MobileReaderNotebookReveal;
  spoilerSafe: boolean;
  /** The page under the strip's centre while it moves; `committedIndex` otherwise. */
  liveStore: MobileReaderLivePageStore;
  committedIndex: number;
  onSelectPage: (index: number) => void;
  onStep: (direction: "previous" | "next") => void;
  onToggleControls: () => void;
};

const TITLE_COLOR = "rgba(255,255,255,0.85)";
const QUIET = "rgba(235,235,245,0.30)";
/** A thumbnail not ready yet shows its page number in this. */
const PLACEHOLDER_NUMBER_COLOR = "rgba(255,255,255,0.45)";
/** A thumbnail's image fades in over its placeholder. */
const THUMBNAIL_FADE_MS = 150;
const CONTROL_FILL = "rgba(255,255,255,0.12)";
const CONTROL_GLYPH = "rgba(255,255,255,0.85)";
const THUMB_VIEWABILITY = { itemVisiblePercentThreshold: 1 };

function localRect(rect: WindowLayoutRect, origin: WindowLayoutRect) {
  return {
    position: "absolute" as const,
    left: rect.x - origin.x,
    top: rect.y - origin.y,
    width: rect.width,
    height: rect.height,
  };
}

/**
 * Book posture, scroll reading: the half beside the strip. Reader black;
 * any empty spot toggles the toolbar like a tap on the strip does.
 */
export function ReaderBookSidePane(props: ReaderBookSidePaneProps) {
  const { layout, content, backgroundColor, strings, onToggleControls } = props;
  const frame = layout.frame;
  return (
    <View style={[mobileReaderAbsoluteRect(frame), { backgroundColor }]}>
      <Pressable
        accessible={false}
        onPress={onToggleControls}
        style={StyleSheet.absoluteFill}
      />
      {content === "filmstrip" ? (
        <>
          {props.chapterTitle ? (
            <NemuText
              accessibilityRole="header"
              numberOfLines={1}
              pointerEvents="none"
              style={[localRect(layout.header, frame), styles.title]}
            >
              {props.chapterTitle}
            </NemuText>
          ) : null}
          <ReaderBookThumbnailList {...props} />
        </>
      ) : (
        <>
          <ReaderBookStepButton
            rect={localRect(layout.pageUp, frame)}
            direction="up"
            label={strings.duo.bookScrollUp}
            onPress={() => props.onStep("previous")}
          />
          <ReaderBookStepButton
            rect={localRect(layout.pageDown, frame)}
            direction="down"
            label={strings.duo.bookScrollDown}
            onPress={() => props.onStep("next")}
          />
        </>
      )}
    </View>
  );
}

function ReaderBookStepButton({
  rect,
  direction,
  label,
  onPress,
}: {
  rect: ReturnType<typeof localRect>;
  direction: "up" | "down";
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [rect, styles.stepButton, pressed ? styles.stepButtonPressed : null]}
    >
      <ReaderScreenStepGlyph direction={direction} color={CONTROL_GLYPH} />
    </Pressable>
  );
}

// --- Thumbnails -------------------------------------------------------------------

function ReaderBookThumbnailList({
  layout,
  strings,
  pageCount,
  thumbnailRatios,
  thumbnailKeys,
  thumbnailUri,
  revealed,
  spoilerSafe,
  liveStore,
  committedIndex,
  onSelectPage,
  onToggleControls,
}: ReaderBookSidePaneProps) {
  const live = useSyncExternalStore(liveStore.subscribe, liveStore.get, liveStore.get);
  const currentIndex = mobileReaderLivePageIndex(live, committedIndex);
  const width = layout.thumbnailSize;
  const viewportHeight = layout.list.height;
  const ratios = useMemo(
    () => Array.from({ length: Math.max(0, pageCount) }, (_, index) => thumbnailRatios[index] ?? Number.NaN),
    [pageCount, thumbnailRatios],
  );
  const geometry = useMemo(() => mobileReaderBookThumbnailLayout(ratios, width), [ratios, width]);
  const data = useMemo(() => Array.from({ length: Math.max(0, pageCount) }, (_, index) => index), [pageCount]);

  // The resolver changes whenever the page list does (a page finishing its
  // processing); thumbnails only re-request when their own key changes.
  const thumbnailUriRef = useRef(thumbnailUri);
  useEffect(() => {
    thumbnailUriRef.current = thumbnailUri;
  }, [thumbnailUri]);
  const resolve = useCallback(
    (index: number, signal: AbortSignal) => thumbnailUriRef.current(index, signal),
    [],
  );

  const [visible, setVisible] = useState<ReadonlySet<number>>(() => new Set([committedIndex]));
  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: { item: number }[] }) => {
    setVisible(new Set(viewableItems.map((entry) => entry.item)));
  }, []);

  // Follow the current page, except while the list is in the reader's hands:
  // a drag pauses it until 1.5s after the list comes to rest.
  const listRef = useRef<FlatList<number>>(null);
  const placedRef = useRef(false);
  const pausedRef = useRef(false);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [resumed, setResumed] = useState(0);
  const clearResume = useCallback(() => {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = null;
  }, []);
  const scheduleResume = useCallback(() => {
    clearResume();
    resumeTimerRef.current = setTimeout(() => {
      resumeTimerRef.current = null;
      pausedRef.current = false;
      setResumed((value) => value + 1);
    }, READER_BOOK_THUMBNAIL_FOLLOW_RESUME_MS);
  }, [clearResume]);
  useEffect(() => clearResume, [clearResume]);
  useEffect(() => {
    if (pausedRef.current || !(viewportHeight > 0) || geometry.heights.length === 0) return;
    const offset = mobileReaderBookThumbnailFollowOffset(geometry, currentIndex, viewportHeight);
    listRef.current?.scrollToOffset({ offset, animated: placedRef.current });
    placedRef.current = true;
  }, [currentIndex, geometry, resumed, viewportHeight]);

  const getItemLayout = useCallback(
    (_: ArrayLike<number> | null | undefined, index: number) => ({
      index,
      length: (geometry.heights[index] ?? 0) + READER_BOOK_THUMBNAIL_GAP,
      offset: (geometry.offsets[index] ?? 0) - READER_BOOK_THUMBNAIL_GAP,
    }),
    [geometry],
  );
  const renderItem = useCallback(
    ({ item: index }: { item: number }) => (
      <ReaderBookThumbnail
        index={index}
        rowWidth={layout.list.width}
        width={width}
        height={geometry.heights[index] ?? 0}
        cropped={geometry.cropped[index] ?? false}
        current={index === currentIndex}
        revealed={!spoilerSafe || mobileReaderPageRevealed(index, revealed)}
        visible={visible.has(index)}
        imageKey={thumbnailKeys[index] ?? null}
        resolve={resolve}
        strings={strings}
        onSelectPage={onSelectPage}
        onToggleControls={onToggleControls}
      />
    ),
    [
      currentIndex,
      geometry,
      layout.list.width,
      onSelectPage,
      onToggleControls,
      resolve,
      revealed,
      spoilerSafe,
      strings,
      thumbnailKeys,
      visible,
      width,
    ],
  );

  return (
    <View
      accessibilityLabel={strings.duo.notebookFilmstrip}
      style={localRect(layout.list, layout.frame)}
    >
      <FlatList
        ref={listRef}
        data={data}
        extraData={currentIndex}
        keyExtractor={(index) => String(index)}
        renderItem={renderItem}
        getItemLayout={getItemLayout}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={THUMB_VIEWABILITY}
        onScrollBeginDrag={() => {
          pausedRef.current = true;
          clearResume();
        }}
        onScrollEndDrag={scheduleResume}
        onMomentumScrollBegin={() => {
          if (pausedRef.current) clearResume();
        }}
        onMomentumScrollEnd={() => {
          if (pausedRef.current) scheduleResume();
        }}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        scrollsToTop={false}
        initialNumToRender={3}
        maxToRenderPerBatch={3}
        windowSize={3}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

type ThumbnailPreview = { key: string; uri: string | null; failed: boolean };

const ReaderBookThumbnail = memo(function ReaderBookThumbnail({
  index,
  rowWidth,
  width,
  height,
  cropped,
  current,
  revealed,
  visible,
  imageKey,
  resolve,
  strings,
  onSelectPage,
  onToggleControls,
}: {
  index: number;
  rowWidth: number;
  width: number;
  height: number;
  cropped: boolean;
  current: boolean;
  revealed: boolean;
  visible: boolean;
  imageKey: string | null;
  resolve: (index: number, signal: AbortSignal) => Promise<string | null>;
  strings: MobileStrings;
  onSelectPage: (index: number) => void;
  onToggleControls: () => void;
}) {
  const page = index + 1;
  const [retry, setRetry] = useState(0);
  const requestKey = imageKey === null ? null : `${imageKey}\u0001${retry}`;
  const [preview, setPreview] = useState<ThumbnailPreview | null>(null);
  const shown = preview && preview.key === requestKey ? preview : null;
  useEffect(() => {
    // Never resolve a hidden spoiler, an offscreen cell or a page whose
    // processed file is not there yet: nothing heavier than the visible
    // thumbnails is ever asked for.
    if (!revealed || !visible || requestKey === null) return;
    if (preview?.key === requestKey && (preview.uri || preview.failed)) return;
    const controller = new AbortController();
    void resolve(index, controller.signal).then(
      (uri) => {
        if (!controller.signal.aborted) setPreview({ key: requestKey, uri, failed: !uri });
      },
      () => {
        if (!controller.signal.aborted) setPreview({ key: requestKey, uri: null, failed: true });
      },
    );
    return () => controller.abort();
    // `preview` is read only to skip a finished request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, requestKey, resolve, revealed, visible]);
  const failed = revealed && shown?.failed === true;
  const label = formatMobileString(
    failed ? strings.duo.filmstripPreviewFailed : revealed ? strings.reader.pageTitle : strings.duo.filmstripUnreadPage,
    { page },
  );
  const left = Math.max(0, (rowWidth - width) / 2);
  const uri = revealed && visible ? (shown?.uri ?? null) : null;
  // The image fades in over the placeholder once it has decoded; a new image
  // (a recycled row, a retry) starts from the placeholder again.
  const fade = useRef(new Animated.Value(0)).current;
  const [loadedUri, setLoadedUri] = useState<string | null>(null);
  useEffect(() => {
    if (uri !== null && uri === loadedUri) return;
    fade.stopAnimation();
    fade.setValue(0);
  }, [fade, loadedUri, uri]);
  const onImageLoad = useCallback(() => {
    if (uri === null) return;
    setLoadedUri(uri);
    Animated.timing(fade, {
      toValue: 1,
      duration: THUMBNAIL_FADE_MS,
      useNativeDriver: true,
    }).start();
  }, [fade, uri]);
  const placeholderOpacity = useMemo(
    () => fade.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
    [fade],
  );
  // One row per page across the whole list width: the thumbnail selects its
  // page, the margins and the gap above it toggle the toolbar.
  const onPress = (event: GestureResponderEvent) => {
    const { locationX, locationY } = event.nativeEvent;
    const onThumb =
      locationX >= left && locationX <= left + width
      && locationY >= READER_BOOK_THUMBNAIL_GAP && locationY <= READER_BOOK_THUMBNAIL_GAP + height;
    if (!onThumb) {
      onToggleControls();
      return;
    }
    if (failed) setRetry((value) => value + 1);
    else onSelectPage(index);
  };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: current }}
      onPress={onPress}
      style={{ width: rowWidth, height: height + READER_BOOK_THUMBNAIL_GAP, paddingTop: READER_BOOK_THUMBNAIL_GAP }}
    >
      <View style={[styles.thumb, { marginLeft: left, width, height }]}>
        {failed || !revealed ? (
          <Ionicons name={failed ? "reload-outline" : "eye-off-outline"} size={22} color={QUIET} />
        ) : (
          // Not ready yet (still processing, offscreen or loading): the page
          // number on the reader's page-placeholder grey, in the page's own
          // shape, so nothing moves when the image arrives.
          <Animated.Text
            allowFontScaling={false}
            numberOfLines={1}
            style={[styles.placeholderNumber, { opacity: placeholderOpacity }]}
          >
            {page}
          </Animated.Text>
        )}
        {uri && !failed ? (
          <Animated.Image
            key={uri}
            source={{ uri }}
            resizeMode={cropped ? "cover" : "contain"}
            fadeDuration={0}
            onLoad={onImageLoad}
            onError={() => setPreview({ key: requestKey ?? "", uri: null, failed: true })}
            style={[StyleSheet.absoluteFill, { opacity: fade }]}
          />
        ) : null}
        {current ? <View pointerEvents="none" style={styles.thumbCurrent} /> : null}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  title: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: nemuFontWeight.semibold,
    color: TITLE_COLOR,
  },
  listContent: {
    paddingBottom: READER_BOOK_THUMBNAIL_GAP,
  },
  thumb: {
    borderRadius: READER_BOOK_THUMBNAIL_RADIUS,
    overflow: "hidden",
    backgroundColor: MOBILE_READER_SCROLL_PLACEHOLDER_COLOR,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderNumber: {
    fontSize: 13,
    lineHeight: 16,
    fontVariant: ["tabular-nums"],
    color: PLACEHOLDER_NUMBER_COLOR,
  },
  thumbCurrent: {
    ...StyleSheet.absoluteFill,
    borderRadius: READER_BOOK_THUMBNAIL_RADIUS,
    borderWidth: READER_BOOK_THUMBNAIL_CURRENT_STROKE,
    borderColor: READER_BOOK_THUMBNAIL_CURRENT_COLOR,
  },
  stepButton: {
    borderRadius: radius.pill,
    backgroundColor: CONTROL_FILL,
    alignItems: "center",
    justifyContent: "center",
  },
  stepButtonPressed: {
    opacity: 0.6,
  },
});
