import Ionicons from "@expo/vector-icons/Ionicons";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  type EntryExitAnimationFunction,
} from "react-native-reanimated";
import { NemuText, nemuFontWeight } from "@/design-system";
import { formatMobileString, type MobileStrings } from "@/lib/mobileI18n";
import { MOBILE_MOTION } from "@/lib/mobileMotion";
import {
  mobileReaderFilmstripItemSize,
  mobileReaderFilmstripOffset,
  mobileReaderFilmstripOrder,
  mobileReaderNotebookPaneMotion,
  mobileReaderPageRevealed,
  mobileReaderTrackpadLayout,
  mobileReaderTrackpadProgress,
  mobileReaderTrackpadStep,
  mobileReaderTrackpadSwipe,
  READER_FILMSTRIP_CAPTION,
  READER_NOTEBOOK_SWIPE_MIN,
  READER_FILMSTRIP_GAP,
  READER_NOTEBOOK_PAD_RADIUS,
  type MobileReaderNotebookPaneState,
  type MobileReaderNotebookReveal,
  type MobileReaderTrackpadSide,
} from "@/lib/mobileReaderNotebookPane";
import { mobileReaderAbsoluteRect } from "@/lib/mobileReaderPoseLayout";
import type { WindowLayoutRect } from "@/lib/mobileWindowLayout";
import { READER_CAPSULE_COLORS, ReaderCapsule } from "./ReaderCapsule";

type PaneState = Exclude<MobileReaderNotebookPaneState, "continuous">;

export type ReaderNotebookFilmstripProps = {
  pageCount: number;
  /** Current page, 0-based reading order. */
  currentIndex: number;
  /** Pages whose image may be shown (`mobileReaderNotebookReveal`). */
  revealed: MobileReaderNotebookReveal;
  /** A cached image for a revealed page; null when it is not on disk. Never called for unread pages. */
  thumbnailUri: (index: number) => string | null;
  onSelectPage: (index: number) => void;
};

export type ReaderNotebookPaneProps = {
  /** The bottom pane's content rect (reader-local, safe area removed). */
  pane: WindowLayoutRect;
  state: PaneState;
  reduceMotion: boolean;
  rtl: boolean;
  strings: MobileStrings;
  pageIndex: number;
  pageCount: number;
  /** "12 / 39"; null while the page list is unresolved. */
  pageLabel: string | null;
  onStep: (direction: "previous" | "next") => void;
  onExpand: () => void;
  onCollapse: () => void;
  /** Filmstrip header: Back, title and actions capsules. */
  filmstripHeader: ReactNode;
  /** Filmstrip scrubber capsule (previous chapter · slider · next chapter). */
  filmstripScrubber: ReactNode;
  filmstrip: ReaderNotebookFilmstripProps;
};

const PRIMARY = READER_CAPSULE_COLORS.primaryText;
const SECONDARY = READER_CAPSULE_COLORS.secondaryText;
const QUIET = "rgba(235,235,245,0.30)";
/** The pad: barely lifted off the black reader, so it reads as a surface without becoming a slab. */
const PAD_FILL = "rgba(255,255,255,0.035)";
const PAD_BORDER = "rgba(255,255,255,0.075)";
const PAD_PRESSED = "rgba(255,255,255,0.06)";
const SPRING = MOBILE_MOTION.settleSpring;

function stateEntering(from: PaneState | null, to: PaneState, reduceMotion: boolean): EntryExitAnimationFunction | FadeIn | undefined {
  const motion = mobileReaderNotebookPaneMotion({
    from,
    to,
    reduceMotion,
    fadeInMs: MOBILE_MOTION.fadeInMs,
    fadeOutMs: MOBILE_MOTION.fadeOutMs,
    reduceMotionFadeMs: MOBILE_MOTION.reduceMotionFadeMs,
  });
  if (motion.kind === "none") return undefined;
  if (motion.kind === "fade") return FadeIn.duration(motion.durationMs);
  const { dy, fadeInMs } = motion;
  return () => {
    "worklet";
    return {
      initialValues: { opacity: 0, transform: [{ translateY: dy }] },
      animations: {
        opacity: withTiming(1, { duration: fadeInMs, easing: Easing.out(Easing.cubic) }),
        transform: [{ translateY: withSpring(0, SPRING) }],
      },
    };
  };
}

/**
 * The notebook posture's bottom pane: the trackpad (B) or the filmstrip
 * console (A). The study desk (C) is the docked learning panel drawn by the
 * reader over this pane, so here it leaves the pane empty and dark.
 * State changes cross-fade with the settle spring; Reduce Motion fades.
 */
export function ReaderNotebookPane(props: ReaderNotebookPaneProps) {
  const { pane, state, reduceMotion } = props;
  const [shown, setShown] = useState<{ state: PaneState; from: PaneState | null }>({ state, from: null });
  if (shown.state !== state) setShown({ state, from: shown.state });
  const entering = stateEntering(shown.from, state, reduceMotion);
  const exiting = reduceMotion
    ? FadeOut.duration(MOBILE_MOTION.reduceMotionFadeMs)
    : FadeOut.duration(MOBILE_MOTION.fadeOutMs);

  return (
    <View pointerEvents="box-none" style={mobileReaderAbsoluteRect(pane)}>
      {state === "trackpad" ? (
        <Animated.View key="trackpad" entering={entering} exiting={exiting} style={StyleSheet.absoluteFill}>
          <ReaderNotebookTrackpad {...props} />
        </Animated.View>
      ) : state === "filmstrip" ? (
        <Animated.View key="filmstrip" entering={entering} exiting={exiting} style={StyleSheet.absoluteFill}>
          <ReaderNotebookFilmstripConsole {...props} />
        </Animated.View>
      ) : null}
    </View>
  );
}

// --- Handle ------------------------------------------------------------------

function ReaderNotebookHandle({
  direction,
  label,
  onPress,
  frame,
}: {
  direction: "up" | "down";
  label: string;
  onPress: () => void;
  frame: { handle: WindowLayoutRect; handleHit: WindowLayoutRect };
}) {
  const { handle, handleHit } = frame;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[mobileReaderAbsoluteRect(handleHit), styles.handleHit]}
    >
      <ReaderCapsule
        pointerEvents="box-none"
        style={[styles.handle, { width: handle.width, height: handle.height, marginTop: handle.y - handleHit.y }]}
      >
        <Ionicons name={direction === "up" ? "chevron-up" : "chevron-down"} size={16} color={PRIMARY} />
      </ReaderCapsule>
    </Pressable>
  );
}

// --- B · Trackpad ---------------------------------------------------------------

function ReaderNotebookTrackpad({
  pane,
  rtl,
  reduceMotion,
  strings,
  pageIndex,
  pageCount,
  pageLabel,
  onStep,
  onExpand,
}: ReaderNotebookPaneProps) {
  const layout = useMemo(() => mobileReaderTrackpadLayout(pane), [pane]);
  const progress = mobileReaderTrackpadProgress({ pageIndex, pageCount, rtl });
  // Like a trackpad, the pad also takes swipes: across turns the page the
  // way the pager would, up expands. Taps below the threshold stay taps.
  const swipe = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .minDistance(READER_NOTEBOOK_SWIPE_MIN)
        .onEnd((event) => {
          const action = mobileReaderTrackpadSwipe({ dx: event.translationX, dy: event.translationY, rtl });
          if (action === "expand") onExpand();
          else if (action) onStep(action);
        }),
    [onExpand, onStep, rtl],
  );
  return (
    <GestureDetector gesture={swipe}>
    <View
      accessibilityLabel={strings.duo.notebookTrackpad}
      style={StyleSheet.absoluteFill}
    >
      <View
        pointerEvents="none"
        style={[mobileReaderAbsoluteRect(layout.pad), styles.pad]}
      />
      {(["left", "right"] as const).map((side) => (
        <TrackpadHalf
          key={side}
          side={side}
          rect={layout.halves[side]}
          rtl={rtl}
          reduceMotion={reduceMotion}
          strings={strings}
          contentTop={layout.handleHit.y + layout.handleHit.height}
          contentBottom={layout.indicator.y}
          onStep={onStep}
        />
      ))}
      {/* A hairline between the halves, fading out toward the handle and the indicator. */}
      <View
        pointerEvents="none"
        style={[
          styles.divider,
          {
            left: layout.pad.x + layout.pad.width / 2,
            top: layout.handleHit.y + layout.handleHit.height + 18,
            height: Math.max(0, layout.indicator.y - (layout.handleHit.y + layout.handleHit.height) - 36),
          },
        ]}
      />
      <ReaderNotebookHandle
        direction="up"
        label={strings.duo.notebookShowFilmstrip}
        onPress={onExpand}
        frame={layout}
      />
      {pageLabel ? (
        <NemuText
          accessibilityLabel={pageLabel}
          pointerEvents="none"
          style={[mobileReaderAbsoluteRect(layout.indicator), styles.indicator]}
        >
          {pageLabel}
        </NemuText>
      ) : null}
      <View pointerEvents="none" style={[mobileReaderAbsoluteRect(layout.progress), styles.progressTrack]}>
        <View
          style={[
            styles.progressFill,
            { width: `${Math.round(progress.fraction * 1000) / 10}%` },
            progress.from === "right" ? { right: 0 } : { left: 0 },
          ]}
        />
      </View>
    </View>
    </GestureDetector>
  );
}

const TrackpadHalf = memo(function TrackpadHalf({
  side,
  rect,
  rtl,
  reduceMotion,
  strings,
  contentTop,
  contentBottom,
  onStep,
}: {
  side: MobileReaderTrackpadSide;
  rect: WindowLayoutRect;
  rtl: boolean;
  reduceMotion: boolean;
  strings: MobileStrings;
  contentTop: number;
  contentBottom: number;
  onStep: (direction: "previous" | "next") => void;
}) {
  const direction = mobileReaderTrackpadStep(side, rtl);
  const label = direction === "next" ? strings.reader.nextPage : strings.reader.previousPage;
  const highlight = useSharedValue(0);
  const nudge = useSharedValue(0);
  const highlightStyle = useAnimatedStyle(() => ({ opacity: highlight.value }));
  const glyphStyle = useAnimatedStyle(() => ({ transform: [{ translateX: nudge.value }] }));
  const outward = side === "left" ? -1 : 1;
  const press = useCallback(() => {
    if (!reduceMotion) {
      nudge.set(withSequence(
        withTiming(outward * 6, { duration: 90, easing: Easing.out(Easing.quad) }),
        withSpring(0, SPRING),
      ));
    }
    onStep(direction);
  }, [direction, nudge, onStep, outward, reduceMotion]);
  const radius = READER_NOTEBOOK_PAD_RADIUS;
  const glyphCenter = (contentTop + contentBottom) / 2 - rect.y;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPressIn={() => {
        highlight.set(withTiming(1, { duration: 60 }));
      }}
      onPressOut={() => {
        highlight.set(withTiming(0, { duration: reduceMotion ? 120 : 260, easing: Easing.out(Easing.cubic) }));
      }}
      onPress={press}
      style={mobileReaderAbsoluteRect(rect)}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: PAD_PRESSED },
          side === "left"
            ? { borderTopLeftRadius: radius, borderBottomLeftRadius: radius }
            : { borderTopRightRadius: radius, borderBottomRightRadius: radius },
          highlightStyle,
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[styles.halfGlyph, { top: glyphCenter - 30 }, glyphStyle]}
      >
        <Ionicons name={side === "left" ? "chevron-back" : "chevron-forward"} size={30} color={QUIET} />
        <NemuText style={styles.halfCaption}>{label}</NemuText>
      </Animated.View>
    </Pressable>
  );
});

// --- A · Filmstrip console ----------------------------------------------------------

function ReaderNotebookFilmstripConsole({
  pane,
  rtl,
  strings,
  onCollapse,
  filmstripHeader,
  filmstripScrubber,
  filmstrip,
}: ReaderNotebookPaneProps) {
  // The handle keeps the trackpad's position, so expand and collapse are one control.
  const layout = useMemo(() => mobileReaderTrackpadLayout(pane), [pane]);
  const top = layout.handleHit.y + layout.handleHit.height + 4;
  return (
    <View style={StyleSheet.absoluteFill}>
      <ReaderNotebookHandle
        direction="down"
        label={strings.duo.notebookHideFilmstrip}
        onPress={onCollapse}
        frame={layout}
      />
      <View pointerEvents="box-none" style={[styles.console, { top }]}>
        <View pointerEvents="box-none" style={styles.consoleHeader}>{filmstripHeader}</View>
        <ReaderNotebookFilmstrip {...filmstrip} rtl={rtl} strings={strings} />
        <View pointerEvents="box-none" style={styles.consoleScrubber}>{filmstripScrubber}</View>
      </View>
    </View>
  );
}

function ReaderNotebookFilmstrip({
  pageCount,
  currentIndex,
  revealed,
  thumbnailUri,
  onSelectPage,
  rtl,
  strings,
}: ReaderNotebookFilmstripProps & { rtl: boolean; strings: MobileStrings }) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize((current) => (Math.abs(current.width - width) < 0.5 && Math.abs(current.height - height) < 0.5 ? current : { width, height }));
  }, []);
  const item = mobileReaderFilmstripItemSize(size.height);
  const order = useMemo(() => mobileReaderFilmstripOrder(pageCount, rtl), [pageCount, rtl]);
  const listRef = useRef<FlatList<number>>(null);
  const placedRef = useRef(false);
  const padding = 16;
  useEffect(() => {
    if (!(size.width > 0) || pageCount <= 0) return;
    const offset = mobileReaderFilmstripOffset({
      index: currentIndex,
      count: pageCount,
      stride: item.stride,
      itemWidth: item.width,
      viewportWidth: size.width,
      padding,
      rtl,
    });
    listRef.current?.scrollToOffset({ offset, animated: placedRef.current });
    placedRef.current = true;
  }, [currentIndex, item.stride, item.width, pageCount, rtl, size.width]);

  const renderItem = useCallback(
    ({ item: index }: { item: number }) => (
      <FilmstripThumb
        index={index}
        width={item.width}
        height={item.height}
        current={index === currentIndex}
        revealed={mobileReaderPageRevealed(index, revealed)}
        thumbnailUri={thumbnailUri}
        strings={strings}
        onSelectPage={onSelectPage}
      />
    ),
    [currentIndex, item.height, item.width, onSelectPage, revealed, strings, thumbnailUri],
  );

  return (
    <View accessibilityLabel={strings.duo.notebookFilmstrip} onLayout={onLayout} style={styles.filmstrip}>
      {size.height > 0 ? (
        <FlatList
          ref={listRef}
          horizontal
          data={order}
          keyExtractor={(index) => String(index)}
          renderItem={renderItem}
          extraData={revealed}
          getItemLayout={(_, position) => ({ length: item.stride, offset: padding + item.stride * position, index: position })}
          ItemSeparatorComponent={FilmstripGap}
          contentContainerStyle={styles.filmstripContent}
          showsHorizontalScrollIndicator={false}
          initialNumToRender={12}
          windowSize={5}
          style={styles.filmstripList}
        />
      ) : null}
    </View>
  );
}

function FilmstripGap() {
  return <View style={styles.filmstripGap} />;
}

const FilmstripThumb = memo(function FilmstripThumb({
  index,
  width,
  height,
  current,
  revealed,
  thumbnailUri,
  strings,
  onSelectPage,
}: {
  index: number;
  width: number;
  height: number;
  current: boolean;
  revealed: boolean;
  thumbnailUri: (index: number) => string | null;
  strings: MobileStrings;
  onSelectPage: (index: number) => void;
}) {
  const page = index + 1;
  // Spoiler-safe: an unread page never asks for (or decodes) its image.
  const uri = revealed ? thumbnailUri(index) : null;
  const label = revealed
    ? formatMobileString(strings.reader.pageTitle, { page })
    : formatMobileString(strings.duo.filmstripUnreadPage, { page });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: current }}
      onPress={() => onSelectPage(index)}
      style={[styles.thumbColumn, { width }]}
    >
      <View
        style={[
          styles.thumb,
          { width, height },
          current ? styles.thumbCurrent : null,
          uri ? null : styles.thumbPlaceholder,
        ]}
      >
        {uri ? (
          <Image source={{ uri }} resizeMode="cover" fadeDuration={0} style={styles.thumbImage} />
        ) : (
          <NemuText style={[styles.thumbNumber, { color: revealed ? SECONDARY : QUIET }]}>{page}</NemuText>
        )}
      </View>
      <NemuText
        numberOfLines={1}
        style={[styles.thumbCaption, { color: current ? PRIMARY : QUIET }]}
      >
        {uri ? page : " "}
      </NemuText>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  pad: {
    borderRadius: READER_NOTEBOOK_PAD_RADIUS,
    backgroundColor: PAD_FILL,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PAD_BORDER,
  },
  divider: {
    position: "absolute",
    width: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  handleHit: {
    alignItems: "center",
    zIndex: 2,
  },
  handle: {
    alignItems: "center",
    justifyContent: "center",
  },
  halfGlyph: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 60,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  halfCaption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: nemuFontWeight.medium,
    color: QUIET,
  },
  indicator: {
    textAlign: "center",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: nemuFontWeight.semibold,
    fontVariant: ["tabular-nums"],
    color: SECONDARY,
  },
  progressTrack: {
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.10)",
    overflow: "hidden",
  },
  progressFill: {
    position: "absolute",
    top: 0,
    bottom: 0,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.72)",
  },
  console: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    gap: 14,
    paddingBottom: 14,
  },
  consoleHeader: {
    paddingHorizontal: 16,
  },
  consoleScrubber: {
    alignItems: "center",
    paddingHorizontal: 16,
  },
  filmstrip: {
    flex: 1,
    minHeight: 0,
  },
  filmstripList: {
    flexGrow: 0,
  },
  filmstripContent: {
    paddingHorizontal: 16,
  },
  filmstripGap: {
    width: READER_FILMSTRIP_GAP,
  },
  thumbColumn: {
    alignItems: "center",
    gap: 4,
  },
  thumb: {
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbCurrent: {
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.92)",
  },
  thumbPlaceholder: {
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  thumbImage: {
    ...StyleSheet.absoluteFill,
  },
  thumbNumber: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: nemuFontWeight.semibold,
    fontVariant: ["tabular-nums"],
  },
  thumbCaption: {
    height: READER_FILMSTRIP_CAPTION - 4,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: nemuFontWeight.medium,
    fontVariant: ["tabular-nums"],
  },
});
