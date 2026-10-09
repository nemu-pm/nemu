import { concentricMobileExploreRadius, MOBILE_EXPLORE_RADIUS as R } from "@/lib/mobileExploreRadius";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { PixelRatio, StyleSheet, useWindowDimensions, View, type ViewInstance } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useMangaChapterProgress } from "@/data/mobileHooks";
import { getEntryTitle, type InstalledSource, type LibraryEntry } from "@/data/schema";
import {
  createNemuShadowStyle,
  MobileCachedImage,
  nemuFontWeight,
  NemuPressable,
  NemuText,
  useMobilePageGutters,
  radius,
  useNemuTheme,
} from "@/design-system";
import { hapticSelection } from "@/lib/haptics";
import { stepMobileCarouselSwitch } from "@/lib/mobileCarouselActiveIndex";
import { getMobileChapterProgressAccessory } from "@/lib/mobileChapterProgress";
import type { MobileContinueReadingItem } from "@/lib/mobileContinueReading";
import {
  formatMobileExploreChapterLabel,
  formatMobileLastRead,
  formatMobileNewChapterCount,
  getMobileExploreNewChapters,
} from "@/lib/mobileContinueReadingCopy";
import {
  buildMobileCoverTintPalette,
  type MobileCoverRgb,
} from "@/lib/mobileCoverTint";
import { formatMobileString, type MobileStrings } from "@/lib/mobileI18n";
import { getMobileSourceReaderHref } from "@/lib/mobileSourceRoutes";
import {
  getMobileContinueCardGeometry,
  getMobileContinueCardVariant,
  MOBILE_CONTINUE_TALL_CARD,
  SINGLE_COVER_SHARE,
  type MobileContinueCardVariant,
} from "@/lib/mobileContinueCardGeometry";
import { useMobileContainerFold } from "@/lib/useMobileContainerFold";
import { useMobileCoverTint } from "@/lib/useMobileCoverTint";
import { ZoomSource } from "../../../modules/nemu-window-layout";
import { ExploreGradient } from "./ExploreGradient";
import { ExploreSharperCoverProbe } from "./ExploreSharperCoverProbe";
import { MobileExploreCoverPlaceholder } from "./MobileExploreCoverPlaceholder";
import {
  preferExploreDissolveTarget,
  registerExploreDissolveTarget,
  useExploreDissolveHidden,
} from "./mobileExploreDissolve";
import { MobileOdometerText } from "./MobileOdometerText";
import { ExploreRowFade } from "./ExploreRowFade";
import { useMobileExploreRowBleed } from "./useMobileExploreRowBleed";
import {
  getMobileCollectionFolderPeek,
  getMobileExploreSectionHeadingHeight,
  MOBILE_EXPLORE_SECTION_TITLE_MAX_SCALE,
} from "@/lib/mobileCollectionFolderGeometry";
import { useMobileExploreRestingFrame, useMobileExploreRestingTop } from "./useMobileExploreResting";
import {
  fitMobileRestingContent,
  getMobileExploreUnderPush,
  type MobileRestingBlock,
} from "@/lib/mobileExploreRestingFit";
import {
  mobileExploreSourceName,
  pushMobileExploreDetail,
  useMobileExploreEntryCover,
  withMobileExploreZoom,
} from "./mobileExploreCover";

/** Concentric with the iPhone display corners at this inset. */
const CARD_RADIUS = R.card;
const CARD_PADDING = 16;
/** Concentric with the card: its radius less the padding. */
const COVER_RADIUS = concentricMobileExploreRadius(CARD_RADIUS, CARD_PADDING);
/** Wide card: cover width as a share of the card; 2:3 portrait, the card's full height. */
const COVER_SHARE = 0.36;
/** Footer controls: 36 pt visible, 44 pt touch target with the hit slop. */
const CONTROL_SIZE = 36;
const CONTROL_HIT_SLOP = 4;
/** Tall card: padding of the text and footer under the cover. */
const TALL_PADDING = 16;
/** Tall card's Continue: a full-width white pill, as tall as a touch target. */
const TALL_CONTROL_SIZE = 44;
/** Card layout: the tall, cover-led card. */
const PREFERRED_CARD: MobileContinueCardVariant = "tall";
/** How dark a neighbouring card turns, per scheme: the active card leads. */
const NEIGHBOUR_DIM = { light: 0.12, dark: 0.3 } as const;
/** Cover-flow turn of a card one page away (degrees) and its scale. */
const CARD_TURN = 16;
const CARD_SIDE_SCALE = 0.92;
/**
 * Share of the card width a neighbour loses on its inner edge to the turn,
 * the scale and the perspective foreshortening (≈ 5 %) together.
 */
const CARD_SIDE_SHIFT =
  (1 - CARD_SIDE_SCALE * Math.cos((CARD_TURN * Math.PI) / 180) * 0.95) / 2;
const CARD_TEXT_MAX_SCALE = 1.3;
/** The wide card's spacer between the title and the chapter never closes below this (`copySpacer`). */
const WIDE_SPACER_MIN = 12;
/** How far the cover-colour wash reaches above the section (under the bar). */
const WASH_OVERSCAN = 320;
/** The page wash's cross-fade when the active card changes (one short step, never scroll-linked). */
const WASH_SWITCH_MS = 220;
/**
 * How far the cover window may give or take so the section after the cards
 * rests clear of the tab bar (share of the card width, tall card), and the
 * share of its natural height a wide card's cover window can give up.
 */
const TALL_ART_RANGE = [0.66, 1.15] as const;
const WIDE_ART_MIN_SHARE = 0.62;
/** The space between the library's sections (`exploreSections`). */
const SECTION_GAP = 28;
/** Cards → dots (with the dots' own height). The title above: `getMobileExploreSectionHeadingHeight`. */
const DOTS_BLOCK = 12 + 6;
/** First-frame estimate of the tall card's text and footer under the cover. */
const TALL_TEXT_ESTIMATE = 176;

type Props = {
  items: MobileContinueReadingItem[];
  /**
   * The section after the cards (the collection folders, or the titles'
   * header and first row of covers this tall), or null when nothing follows.
   */
  next?: { kind: "collections" } | { kind: "titles"; coverHeight: number } | null;
  installedSources: InstalledSource[];
  strings: MobileStrings;
  onMore: (entry: LibraryEntry) => void;
};

/**
 * Library "Continue Reading": paging cards in each cover's colour over a page
 * wash in the active card's colour. The active card is the one nearest its
 * resting place: the wash switches (one short cross-fade) and a selection
 * haptic ticks the instant a drag carries the row across the midpoint between
 * two cards, on the UI thread — not when the scroll settles. Tapping a card
 * zooms its cover into the title page; Continue opens the reader on the saved
 * page (zooming from the cover).
 *
 * The row sizes itself from its own measured frame and the fold that crosses
 * it (see `getMobileContinueCardGeometry`); a rotation or a fold change keeps
 * the active card in place.
 */
export function MobileContinueReadingCarousel({
  items,
  next = null,
  installedSources,
  strings,
  onMore,
}: Props) {
  const { scheme, tokens } = useNemuTheme();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const variant = getMobileContinueCardVariant(PREFERRED_CARD, windowHeight, windowWidth);
  const bleed = useMobileExploreRowBleed();
  const pageGutters = useMobilePageGutters();
  const reducedMotion = useReducedMotion();
  const [tints, setTints] = useState<Record<string, MobileCoverRgb | null>>({});
  const count = items.length;
  // The row's own frame, and the active fold where it crosses that frame.
  const {
    ref: frameRef,
    onLayout: onFrameLayout,
    width: measuredFrameWidth,
    split: frameSplit,
    adaptive,
  } = useMobileContainerFold<ViewInstance>();
  const frameWidth = measuredFrameWidth ?? 0;
  const foldStart = frameSplit?.axis === "horizontal" ? frameSplit.gutter.start : null;
  const foldEnd = frameSplit?.axis === "horizontal" ? frameSplit.gutter.end : null;
  const preferEven = adaptive.hasFoldRegion;
  const gutterLeft = bleed.content.paddingLeft;
  const gutterRight = bleed.content.paddingRight;
  const geometry = useMemo(
    () =>
      getMobileContinueCardGeometry({
        frameWidth,
        gutterLeft,
        gutterRight,
        count,
        fold: foldStart !== null && foldEnd !== null ? { start: foldStart, end: foldEnd } : null,
        preferEven,
        variant,
      }),
    [count, foldEnd, foldStart, frameWidth, gutterLeft, gutterRight, preferEven, variant],
  );
  const { cardWidth, interval } = geometry;
  const turns = geometry.turns && !reducedMotion;

  // Resting content clears the tab bar (mobileExploreRestingFit): the
  // cover window gives up or takes height so the cards rest whole above the
  // bar and the next section either peeks with its heading and the top
  // of its row or starts under it. Never mid-card, never a bare heading.
  const rest = useMobileExploreRestingFrame();
  const sectionRef = useRef<ViewInstance>(null);
  const { top: restTop, onLayout: onRestLayout } = useMobileExploreRestingTop(sectionRef, rest.windowKey);
  // The tallest card's text sets the row's height (cards stretch to it): a
  // first card whose title sits in its window (a title card) has the
  // shortest text, and fitting to it alone let the row run 80 pt past the
  // fit at large text sizes, the next heading under the tab bar.
  const [textHeights, setTextHeights] = useState<Record<number, number>>({});
  const onCardText = useMemo(
    () =>
      Array.from({ length: count }, (_, index) => (height: number) => {
        setTextHeights((current) => (current[index] === height ? current : { ...current, [index]: height }));
      }),
    [count],
  );
  const measuredTexts = Object.entries(textHeights)
    .filter(([index]) => Number(index) < count)
    .map(([, height]) => height);
  const textHeight = measuredTexts.length ? Math.max(...measuredTexts) : null;
  const tall = variant === "tall";
  // Section headings grow with the text size (to their cap).
  const fontScale = PixelRatio.getFontScale();
  const titleBlock = getMobileExploreSectionHeadingHeight(fontScale);
  // How much of the next section must show above the tab bar when any of
  // it does: its heading and the top half of its row.
  const nextPeek =
    next === null
      ? null
      : next.kind === "collections"
        ? getMobileCollectionFolderPeek(windowWidth - pageGutters.left - pageGutters.right, fontScale)
        : { min: titleBlock + Math.round(next.coverHeight * 0.5), max: undefined };
  const coverShare = geometry.columns === 1 ? SINGLE_COVER_SHARE : COVER_SHARE;
  const naturalArt = tall
    ? Math.round(cardWidth * MOBILE_CONTINUE_TALL_CARD.artAspect)
    : Math.round(cardWidth * coverShare * 1.5);
  const artFit = (() => {
    if (cardWidth <= 0 || geometry.foldAligned) return null;
    const text = tall ? (textHeight ?? TALL_TEXT_ESTIMATE) : 0;
    const minArt = tall
      ? Math.round(cardWidth * TALL_ART_RANGE[0])
      : Math.max(textHeight ?? 0, Math.round(naturalArt * WIDE_ART_MIN_SHARE));
    const maxArt = tall ? Math.round(cardWidth * TALL_ART_RANGE[1]) : naturalArt;
    const dots = Math.max(1, count - geometry.columns + 1) > 1 ? DOTS_BLOCK : 0;
    // Tall: the cover window over the text. Wide: the cover beside the text, inside the card's padding.
    const card = tall ? naturalArt + text : Math.max(naturalArt, textHeight ?? 0) + CARD_PADDING * 2;
    const cards = titleBlock + card + dots;
    const blocks: MobileRestingBlock[] = [
      {
        key: "cards",
        gap: 0,
        height: cards,
        rests: "whole",
        shrink: { by: Math.max(0, naturalArt - minArt), order: 0 },
        grow: { by: Math.max(0, maxArt - naturalArt), order: 0 },
      },
    ];
    if (nextPeek !== null) {
      blocks.push({
        key: "next",
        gap: SECTION_GAP,
        height: 2000,
        rests: "peek",
        minVisible: nextPeek.min,
        maxVisible: nextPeek.max,
      });
    }
    const top = restTop ?? rest.topEstimate;
    const fit = fitMobileRestingContent({ top, edge: rest.edge, blocks });
    const nextGap = fit.gaps.next ?? SECTION_GAP;
    // A wide window's bars leave its sides open: a section dropped under the
    // edge goes under the window's bottom, not beside the tab bar.
    const under =
      nextPeek === null
        ? 0
        : getMobileExploreUnderPush({ top: top + fit.heights.cards! + nextGap, edge: rest.edge, windowWidth, windowHeight });
    return { art: naturalArt + (fit.heights.cards! - cards), push: nextGap - SECTION_GAP + under };
  })();
  const artHeight = artFit?.art ?? null;

  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollX = useSharedValue(0);
  // UI-thread state: the active card, and whether the scroll in progress
  // comes from the user's finger (a drag or the fling after it).
  const activeIndex = useSharedValue(0);
  const userDriven = useSharedValue(false);
  const tick = useCallback(() => {
    void hapticSelection();
  }, []);
  const onScroll = useAnimatedScrollHandler(
    {
      onBeginDrag: () => {
        userDriven.value = true;
      },
      onMomentumEnd: () => {
        userDriven.value = false;
      },
      onScroll: (event) => {
        const offset = event.contentOffset.x;
        scrollX.value = offset;
        const step = stepMobileCarouselSwitch(
          { index: activeIndex.value, userDriven: userDriven.value },
          offset,
          interval,
          count,
        );
        if (step.index !== activeIndex.value) {
          activeIndex.value = step.index;
        }
        if (step.tick) runOnJS(tick)();
      },
    },
    [count, interval, tick],
  );

  // The window changed under the row (rotation, fold, a bar moving): keep the
  // active card where it was. Not the user's scroll, so nothing ticks.
  const anchored = useRef({ interval, paddingLeft: geometry.paddingLeft });
  useLayoutEffect(() => {
    const previous = anchored.current;
    anchored.current = { interval, paddingLeft: geometry.paddingLeft };
    if (cardWidth <= 0 || previous.interval <= 1) return;
    if (previous.interval === interval && previous.paddingLeft === geometry.paddingLeft) return;
    userDriven.set(false);
    scrollRef.current?.scrollTo({ x: activeIndex.get() * interval, y: 0, animated: false });
  }, [activeIndex, cardWidth, geometry.paddingLeft, interval, scrollRef, userDriven]);
  // The list shrank under the active card.
  useEffect(() => {
    if (activeIndex.get() > Math.max(0, count - 1)) activeIndex.set(Math.max(0, count - 1));
  }, [activeIndex, count]);

  const reportTint = useCallback((id: string, tint: MobileCoverRgb | null) => {
    setTints((current) => (current[id] === tint ? current : { ...current, [id]: tint }));
  }, []);

  if (!items.length) return null;
  // One dot per resting position; none when every card is on screen at once.
  const restPositions = Math.max(1, count - geometry.columns + 1);

  return (
    <View
      ref={sectionRef}
      onLayout={onRestLayout}
      style={[styles.section, artFit && artFit.push > 0 ? { marginBottom: artFit.push } : null]}
    >
      <View
        pointerEvents="none"
        // The wash runs to both window edges, under a vertical system bar
        // too; only the cards keep out of that column.
        style={[styles.washFrame, { marginLeft: -pageGutters.left, marginRight: -pageGutters.right }]}
      >
        {items.map((item, index) => (
          <WashLayer
            key={item.entry.item.libraryItemId}
            index={index}
            reducedMotion={reducedMotion}
            activeIndex={activeIndex}
            colors={buildMobileCoverTintPalette(
              tints[item.entry.item.libraryItemId] ?? null,
              scheme,
            )}
          />
        ))}
      </View>

      <NemuText
        accessibilityRole="header"
        maxFontSizeMultiplier={MOBILE_EXPLORE_SECTION_TITLE_MAX_SCALE}
        color={tokens.foreground}
        style={styles.title}
      >
        {strings.designExplore.continueReadingTitle}
      </NemuText>

      <View
        ref={frameRef}
        onLayout={onFrameLayout}
        style={bleed.frame}
      >
        <ExploreRowFade bleed={bleed}>
        {cardWidth > 0 ? (
          <Animated.ScrollView
            ref={scrollRef}
            horizontal
            // Not a status-bar target: iOS scrolls to the top only when exactly one scroll view on screen asks to.
            scrollsToTop={false}
            decelerationRate="fast"
            disableIntervalMomentum={geometry.turns}
            snapToInterval={interval}
            snapToAlignment="start"
            showsHorizontalScrollIndicator={false}
            onScroll={onScroll}
            scrollEventThrottle={16}
            style={styles.scroller}
            contentContainerStyle={{
              paddingLeft: geometry.paddingLeft,
              paddingRight: geometry.paddingRight,
            }}
          >
            {items.map((item, index) => (
              <ContinueCard
                key={item.entry.item.libraryItemId}
                item={item}
                index={index}
                width={cardWidth}
                marginRight={index === items.length - 1 ? 0 : interval - cardWidth}
                interval={interval}
                scrollX={scrollX}
                turns={turns}
                variant={variant}
                coverShare={coverShare}
                artHeight={artHeight}
                onTextHeight={onCardText[index]}
                installedSources={installedSources}
                strings={strings}
                onMore={onMore}
                onTint={reportTint}
              />
            ))}
          </Animated.ScrollView>
        ) : (
          <View style={{ height: 1 }} />
        )}
        </ExploreRowFade>
      </View>

      {restPositions > 1 ? (
        <PageDots count={restPositions} interval={interval} scrollX={scrollX} />
      ) : null}
    </View>
  );
}

function WashLayer({
  index,
  reducedMotion,
  activeIndex,
  colors,
}: {
  index: number;
  reducedMotion: boolean;
  activeIndex: SharedValue<number>;
  colors: ReturnType<typeof buildMobileCoverTintPalette>;
}) {
  // A discrete switch, on the UI thread: the wash is this card's colour from
  // the frame the card becomes the active one (mid-drag), shown as one short
  // cross-fade. It never follows the scroll offset itself.
  const style = useAnimatedStyle(() => {
    const opacity = activeIndex.value === index ? 1 : 0;
    return { opacity: reducedMotion ? opacity : withTiming(opacity, { duration: WASH_SWITCH_MS }) };
  });
  // Solid from under the bar down to the cards, then fading out over their
  // height, so the page is the cover's colour at the top and its own below.
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]}>
      <View style={[styles.washHold, { backgroundColor: colors.wash }]} />
      <ExploreGradient
        colors={[
          [colors.wash, 0],
          [colors.washSoft, 0.4],
          [colors.washFaint, 0.78],
          [colors.washClear, 1],
        ]}
        style={styles.washFade}
      />
    </Animated.View>
  );
}

/** Quiet page dots; the current one stretches as the cards move. */
function PageDots({
  count,
  interval,
  scrollX,
}: {
  count: number;
  interval: number;
  scrollX: SharedValue<number>;
}) {
  const { tokens } = useNemuTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.dots}
    >
      {Array.from({ length: count }, (_, index) => (
        <Dot key={index} index={index} interval={interval} scrollX={scrollX} color={tokens.foreground} />
      ))}
    </View>
  );
}

function Dot({
  index,
  interval,
  scrollX,
  color,
}: {
  index: number;
  interval: number;
  scrollX: SharedValue<number>;
  color: string;
}) {
  const style = useAnimatedStyle(() => {
    const distance = interval > 0 ? Math.abs(scrollX.value / interval - index) : index;
    const nearness = interpolate(distance, [0, 1], [1, 0], Extrapolation.CLAMP);
    return {
      width: 6 + nearness * 12,
      opacity: 0.22 + nearness * 0.5,
    };
  });
  return <Animated.View style={[styles.dot, { backgroundColor: color }, style]} />;
}

const ContinueCard = memo(function ContinueCard({
  item,
  index,
  width,
  marginRight,
  interval,
  scrollX,
  turns,
  variant,
  coverShare,
  artHeight,
  onTextHeight,
  installedSources,
  strings,
  onMore,
  onTint,
}: {
  item: MobileContinueReadingItem;
  /** Height of the cover window from the row's resting fit (null: natural). */
  artHeight: number | null;
  /** Reports the height of the text beside or under the cover. */
  onTextHeight?: (height: number) => void;
  index: number;
  width: number;
  marginRight: number;
  interval: number;
  scrollX: SharedValue<number>;
  turns: boolean;
  variant: MobileContinueCardVariant;
  /** Cover width over the card width (wide card). */
  coverShare: number;
  installedSources: InstalledSource[];
  strings: MobileStrings;
  onMore: (entry: LibraryEntry) => void;
  onTint: (id: string, tint: MobileCoverRgb | null) => void;
}) {
  const { scheme } = useNemuTheme();
  const { entry, source, chapter } = item;
  const tall = variant === "tall";
  // "Read 3 h ago" is relative to when the card appeared, not every render.
  const [now] = useState(() => Date.now());
  const id = entry.item.libraryItemId;
  const title = getEntryTitle(entry);
  const zoomId = `continue:${id}`;
  const cover = useMobileExploreEntryCover(entry, installedSources);
  const tint = useMobileCoverTint(cover, `item:${id}`);
  // The card turns to dust if the title is removed from its ••• menu.
  const cardRef = useRef<ViewInstance>(null);
  useEffect(() => registerExploreDissolveTarget(id, cardRef), [id]);
  const dissolving = useExploreDissolveHidden(id);
  const openMore = useCallback(() => {
    preferExploreDissolveTarget(id, cardRef);
    onMore(entry);
  }, [entry, id, onMore]);
  const palette = useMemo(() => buildMobileCoverTintPalette(tint, scheme), [scheme, tint]);
  // The parent only uses the tint for the page wash behind the cards. A
  // layout effect, so a persisted tint reaches the wash before first paint.
  useLayoutEffect(() => {
    onTint(id, tint);
  }, [id, onTint, tint]);
  const chapterProgress = useMangaChapterProgress(
    source.registryId,
    source.sourceId,
    source.sourceMangaId,
  );
  const savedChapter = chapterProgress.data[chapter.id] ?? null;
  const accessory = getMobileChapterProgressAccessory(savedChapter);
  const ratio = accessory.status === "progress" ? accessory.ratio : null;
  const percent = ratio !== null ? Math.round(ratio * 100) : null;
  const chapterLabel =
    formatMobileExploreChapterLabel(chapter, strings) ?? strings.library.progressInProgress;
  const chapterTitle = savedChapter?.chapterTitle ?? chapter.title ?? null;
  const showChapterTitle = Boolean(chapterTitle && chapterTitle !== chapterLabel);
  // Without a chapter title the line names the newest chapter instead, so the
  // card always says where the series stands.
  const latestLabel = item.latestChapter
    ? formatMobileExploreChapterLabel(item.latestChapter, strings)
    : null;
  const secondLine = showChapterTitle
    ? chapterTitle
    : latestLabel && latestLabel !== chapterLabel
      ? formatMobileString(strings.designExplore.latestChapterLine, { chapter: latestLabel })
      : null;
  // Only chapters released since the user last looked (the shelf's rule).
  const newChapters = getMobileExploreNewChapters(entry.sources, {
    sourceId: source.id,
    lastReadNumber: chapter.chapterNumber,
  });
  const newCount = newChapters?.count ?? null;
  const lastRead = formatMobileLastRead(item.lastReadAt, now, strings);
  const sourceName = mobileExploreSourceName(source, installedSources);
  const authors = (
    entry.item.overrides?.metadata?.authors ?? entry.item.metadata.authors ?? []
  ).join(", ");
  // Wide: the cover beside the text. Tall: the cover across the card's top,
  // its upper part in a window (2:3 covers; the top carries the title and the
  // faces), the progress line along the window's foot.
  const coverWidth = tall ? width : Math.round(width * coverShare);
  const coverHeight = Math.round(coverWidth * 1.5);
  const windowHeight =
    artHeight ?? (tall ? Math.round(width * MOBILE_CONTINUE_TALL_CARD.artAspect) : coverHeight);
  const dim = NEIGHBOUR_DIM[scheme];
  // Every cover fills its slot edge to edge, whatever its pixels: the sharpest
  // same-art variant is picked upstream (ExploreSharperCoverProbe), never a
  // letterboxed thumbnail.
  const sideCoverWidth = coverWidth;
  // Wide: the cover stands whole unless the row's resting fit gives it less
  // height (a short window); then its foot is trimmed by a window, as in the
  // tall card, never squeezed.
  const sideWindowHeight = Math.min(Math.round(sideCoverWidth * 1.5), artHeight ?? Number.POSITIVE_INFINITY);
  const cardStyle = useAnimatedStyle(() => {
    if (!turns || interval <= 0) return { transform: [] };
    const position = scrollX.value / interval - index;
    const clamped = Math.max(-1, Math.min(1, position));
    return {
      transform: [
        { perspective: 900 },
        // Pull a turned, scaled-down neighbour back toward the active card
        // so it still peeks past the screen edge.
        { translateX: clamped * width * CARD_SIDE_SHIFT },
        { rotateY: `${clamped * CARD_TURN}deg` },
        { scale: interpolate(Math.abs(clamped), [0, 1], [1, CARD_SIDE_SCALE]) },
      ],
    };
  });
  // Neighbours sit a step back in the shade; the card coming to rest lights up.
  const dimStyle = useAnimatedStyle(() => {
    if (!turns || interval <= 0) return { opacity: 0 };
    const distance = Math.min(1, Math.abs(scrollX.value / interval - index));
    return { opacity: distance * dim };
  });
  // Only the card at rest glows; a neighbour's glow fades as it turns away.
  const glowStyle = useAnimatedStyle(() => {
    if (!turns || interval <= 0) return { shadowOpacity: 1 };
    const distance = Math.min(1, Math.abs(scrollX.value / interval - index));
    return { shadowOpacity: 1 - distance };
  });

  // Wide card: the text's natural height (above + spacer minimum + below).
  const wideText = useRef<{ top: number | null; bottom: number | null }>({ top: null, bottom: null });
  const reportWideText = useCallback(
    (part: "top" | "bottom", height: number) => {
      wideText.current[part] = Math.round(height);
      const { top, bottom } = wideText.current;
      if (top !== null && bottom !== null) onTextHeight?.(top + WIDE_SPACER_MIN + bottom);
    },
    [onTextHeight],
  );
  const resume = useCallback(() => {
    router.push(
      withMobileExploreZoom(
        getMobileSourceReaderHref({
          registryId: source.registryId,
          sourceId: source.sourceId,
          mangaId: source.sourceMangaId,
          chapter,
          mangaTitle: title,
        }),
        zoomId,
      ),
    );
  }, [chapter, source.registryId, source.sourceId, source.sourceMangaId, title, zoomId]);
  const accessibilitySummary = [
    title,
    chapterLabel,
    percent !== null ? formatMobileString(strings.designExplore.percentRead, { percent }) : null,
    newChapters
      ? newCount
        ? formatMobileString(strings.designExplore.newChapterCount, { count: newCount })
        : strings.common.new
      : null,
    lastRead,
  ]
    .filter(Boolean)
    .join(", ");

  const progressLine =
    ratio !== null ? (
      <View style={styles.coverProgress}>
        <View style={[styles.coverProgressFill, { width: `${Math.round(ratio * 100)}%` }]} />
      </View>
    ) : null;
  const titleBlock = (
    <>
      <NemuText
        numberOfLines={1}
        maxFontSizeMultiplier={CARD_TEXT_MAX_SCALE}
        color={palette.cardInkSecondary}
        style={styles.eyebrow}
      >
        {sourceName.toLocaleUpperCase()}
      </NemuText>
      <NemuText
        numberOfLines={2}
        maxFontSizeMultiplier={CARD_TEXT_MAX_SCALE}
        color={palette.cardInk}
        style={tall ? styles.tallTitle : styles.cardTitle}
      >
        {title}
      </NemuText>
    </>
  );

  const coverArt = (
      <ZoomSource
        zoomId={zoomId}
        style={[
          tall ? null : styles.cover,
          { width: sideCoverWidth, height: tall ? windowHeight : sideWindowHeight, backgroundColor: palette.actionSoft },
        ]}
      >
        <View style={tall ? styles.tallCoverClip : styles.coverClip}>
          {/* Explicit size: in the tall card the cover is taller than its window and hangs from its top. */}
          <View style={{ width: sideCoverWidth, height: tall ? Math.max(coverHeight, windowHeight) : Math.round(sideCoverWidth * 1.5) }}>
            {cover ? (
              <MobileCachedImage
                uriOwnership="source"
                cacheKind="cover"
                source={cover}
                // No fade inside the native zoom source.
                fadeIn={false}
                fallback={<MobileExploreCoverPlaceholder title={title} width={sideCoverWidth} />}
                style={styles.coverImage}
              />
            ) : (
              <MobileExploreCoverPlaceholder title={title} width={sideCoverWidth} />
            )}
          </View>
          {/* Progress through the chapter, along the cover's foot. */}
          {progressLine}
        </View>
      </ZoomSource>
  );

  const newBadge = newChapters ? (
    <View style={[styles.newBadge, { backgroundColor: palette.actionSoft }]}>
      {/* Turns over when a refresh brings chapters or reading clears some. */}
      <MobileOdometerText
        value={
          newCount
            ? formatMobileString(strings.designExplore.newChapterCount, {
                count: formatMobileNewChapterCount(newCount),
              })
            : strings.common.new
        }
        maxFontSizeMultiplier={CARD_TEXT_MAX_SCALE}
        color={palette.cardInk}
        style={styles.newBadgeText}
      />
    </View>
  ) : null;

  const moreButton = (
    <NemuPressable
      accessibilityRole="button"
      accessibilityLabel={strings.designExplore.moreActions}
      hapticFeedback="press"
      pressProfile="icon"
      hitSlop={tall ? 0 : CONTROL_HIT_SLOP}
      onPress={openMore}
      style={[tall ? styles.tallMore : styles.more, { backgroundColor: palette.actionSoft }]}
    >
      <Ionicons name="ellipsis-horizontal" size={tall ? 22 : 19} color={palette.cardInk} />
    </NemuPressable>
  );

  const continueButton = (
    <NemuPressable
      accessibilityRole="button"
      accessibilityLabel={`${strings.designExplore.continueAction}, ${chapterLabel}`}
      accessibilityHint={strings.designExplore.resumeHint}
      hapticFeedback="press"
      pressProfile="tab"
      hitSlop={tall ? 0 : CONTROL_HIT_SLOP}
      onPress={resume}
      containerStyle={styles.tallResumeContainer}
      style={[tall ? styles.tallResume : styles.resume, { backgroundColor: palette.action }]}
    >
      <Ionicons name="play" size={tall ? 18 : 16} color={palette.actionInk} />
      <NemuText
        numberOfLines={1}
        maxFontSizeMultiplier={CARD_TEXT_MAX_SCALE}
        color={palette.actionInk}
        style={tall ? styles.tallResumeText : styles.resumeText}
      >
        {strings.designExplore.continueAction}
      </NemuText>
    </NemuPressable>
  );

  const body = tall ? (
    <>
      {coverArt}
      <View
        style={styles.tallText}
        onLayout={onTextHeight ? (event) => onTextHeight(Math.round(event.nativeEvent.layout.height)) : undefined}
      >
        {titleBlock}
        <View style={styles.tallChapterRow}>
          {/* Turns over to the next chapter on the way back from the reader. */}
          <View style={styles.chapterSlot}>
            <MobileOdometerText
              value={chapterLabel}
              maxFontSizeMultiplier={CARD_TEXT_MAX_SCALE}
              color={palette.cardInk}
              style={styles.chapter}
            />
          </View>
          {newBadge}
          <NemuText
            numberOfLines={1}
            maxFontSizeMultiplier={CARD_TEXT_MAX_SCALE}
            color={palette.cardInkSecondary}
            style={styles.tallLastRead}
          >
            {lastRead ?? ""}
          </NemuText>
        </View>
        {secondLine ? (
          <NemuText
            numberOfLines={1}
            maxFontSizeMultiplier={CARD_TEXT_MAX_SCALE}
            color={palette.cardInkSecondary}
            style={styles.meta}
          >
            {secondLine}
          </NemuText>
        ) : null}
        <View style={styles.copySpacer} />
        <View style={styles.tallFooter}>
          {continueButton}
          {moreButton}
        </View>
      </View>
    </>
  ) : (
    <View style={styles.cardBody}>
      {coverArt}
      {/* The column stretches to the card, so its own height says nothing
          about what the text needs: the text above and below the spacer is
          measured instead, and the cover window may shrink to that. */}
      <View style={styles.copy}>
        <View onLayout={onTextHeight ? (event) => reportWideText("top", event.nativeEvent.layout.height) : undefined}>
          {titleBlock}
          {authors ? (
            <NemuText
              numberOfLines={1}
              maxFontSizeMultiplier={CARD_TEXT_MAX_SCALE}
              color={palette.cardInkSecondary}
              style={styles.meta}
            >
              {authors}
            </NemuText>
          ) : null}
        </View>
        <View style={styles.copySpacer} />
        <View onLayout={onTextHeight ? (event) => reportWideText("bottom", event.nativeEvent.layout.height) : undefined}>
          <View style={styles.chapterRow}>
            {/* Turns over to the next chapter on the way back from the reader. */}
            <View style={styles.chapterSlot}>
              <MobileOdometerText
                value={chapterLabel}
                maxFontSizeMultiplier={CARD_TEXT_MAX_SCALE}
                color={palette.cardInk}
                style={styles.chapter}
              />
            </View>
            {newBadge}
            <NemuText
              numberOfLines={1}
              maxFontSizeMultiplier={CARD_TEXT_MAX_SCALE}
              color={palette.cardInkSecondary}
              style={styles.tallLastRead}
            >
              {lastRead ?? ""}
            </NemuText>
          </View>
          {secondLine ? (
            <NemuText
              numberOfLines={1}
              maxFontSizeMultiplier={CARD_TEXT_MAX_SCALE}
              color={palette.cardInkSecondary}
              style={styles.meta}
            >
              {secondLine}
            </NemuText>
          ) : null}
          {/* The controls close the text column, level with the cover's foot. */}
          <View style={styles.footer}>
            {continueButton}
            {moreButton}
        </View>
        </View>
      </View>
    </View>
  );

  return (
    <Animated.View style={[{ width, marginRight }, cardStyle]}>
      <Animated.View
        style={[
          styles.cardShadow,
          // Opaque, so the glow is drawn from the card's outline.
          { backgroundColor: palette.card, opacity: dissolving ? 0 : 1 },
          createNemuShadowStyle({ color: palette.cardGlow, offsetY: 12, radius: 24, elevation: 10 }),
          glowStyle,
        ]}
      >
        <View ref={cardRef} style={[styles.cardFill, { backgroundColor: palette.card }]}>
          {/* A thumbnail cover looks for a sharper one on the title's other sources. */}
          <ExploreSharperCoverProbe entry={entry} installedSources={installedSources} />
          <NemuPressable
            accessibilityRole="button"
            accessibilityLabel={accessibilitySummary}
            accessibilityHint={strings.designExplore.openDetailsHint}
            // The card is one accessibility element, so its nested buttons are
            // offered as custom actions (VoiceOver's Actions rotor).
            accessibilityActions={[
              { name: "resume", label: strings.designExplore.continueAction },
              { name: "more", label: strings.designExplore.moreActions },
            ]}
            onAccessibilityAction={(event) => {
              if (event.nativeEvent.actionName === "resume") resume();
              else if (event.nativeEvent.actionName === "more") openMore();
            }}
            hapticFeedback="press"
            pressedScale={0.985}
            onPress={() => pushMobileExploreDetail(entry, cover, zoomId, source.id)}
            onLongPress={openMore}
            containerStyle={styles.cardPressContainer}
            style={tall ? styles.tallCard : styles.card}
          >
            {body}
          </NemuPressable>
          {/* The lit rim, over everything (the cover runs to the edge in the tall card). */}
          <View pointerEvents="none" style={[styles.rim, { borderColor: palette.cardRim }]} />
          <Animated.View pointerEvents="none" style={[styles.dim, dimStyle]} />
        </View>
      </Animated.View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  // Title → cards → dots on one 12 pt step.
  section: {
    gap: 12,
  },
  washFrame: {
    position: "absolute",
    top: -WASH_OVERSCAN,
    bottom: -80,
    left: 0,
    right: 0,
  },
  // Solid down to the cards' top edge (the title and its 12 pt step)…
  washHold: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: WASH_OVERSCAN + 40,
  },
  // …then fading out over the cards to the page below them.
  washFade: {
    position: "absolute",
    top: WASH_OVERSCAN + 40,
    bottom: 0,
    left: 0,
    right: 0,
  },
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: nemuFontWeight.bold,
    letterSpacing: 0,
  },
  // The card shadows reach past the row; do not clip them.
  scroller: {
    overflow: "visible",
  },
  // Cards in a row share the tallest card's height.
  cardShadow: {
    flex: 1,
    borderRadius: CARD_RADIUS,
    borderCurve: "continuous",
  },
  // Solid, in the cover's colour: it must not pick up what passes behind it.
  cardFill: {
    flex: 1,
    borderRadius: CARD_RADIUS,
    borderCurve: "continuous",
    overflow: "hidden",
  },
  cardPressContainer: {
    flex: 1,
  },
  rim: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: CARD_RADIUS,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  dim: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "#000000",
  },
  tallCard: {
    flex: 1,
  },
  // The cover runs to the card's edges; the card's corners round it.
  tallCoverClip: {
    flex: 1,
    overflow: "hidden",
  },
  tallText: {
    flex: 1,
    paddingHorizontal: TALL_PADDING,
    paddingTop: 14,
    paddingBottom: TALL_PADDING,
  },
  tallTitle: {
    fontSize: 18,
    lineHeight: 23,
    fontWeight: nemuFontWeight.bold,
    letterSpacing: 0,
  },
  tallChapterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  tallLastRead: {
    flex: 1,
    textAlign: "right",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: nemuFontWeight.regular,
  },
  tallFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  tallResumeContainer: {
    flex: 1,
  },
  tallResume: {
    height: TALL_CONTROL_SIZE,
    borderRadius: TALL_CONTROL_SIZE / 2,
    borderCurve: "continuous",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
  },
  tallMore: {
    width: TALL_CONTROL_SIZE,
    height: TALL_CONTROL_SIZE,
    borderRadius: TALL_CONTROL_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  // Stretched to the row's height: with a small cover (never blown up) the
  // cover no longer sets it, and the controls still close the card's foot.
  card: {
    flex: 1,
    padding: CARD_PADDING,
    gap: 12,
  },
  cardBody: {
    flex: 1,
    flexDirection: "row",
    gap: 14,
  },
  // Explicit size, no aspectRatio: the zoom source is sized by its style.
  cover: {
    borderRadius: COVER_RADIUS,
    borderCurve: "continuous",
  },
  coverClip: {
    flex: 1,
    borderRadius: COVER_RADIUS,
    borderCurve: "continuous",
    overflow: "hidden",
  },
  coverImage: {
    width: "100%",
    height: "100%",
  },
  coverProgress: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  coverProgressFill: {
    height: "100%",
    backgroundColor: "#ffffff",
  },
  // Hangs from the cover: the eyebrow's cap height sits on the cover's top
  // edge (the negative margin takes up the line box's own leading) and the
  // controls end level with its foot.
  copy: {
    flex: 1,
    minWidth: 0,
    marginTop: -3,
  },
  eyebrow: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: nemuFontWeight.semibold,
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 19,
    lineHeight: 24,
    fontWeight: nemuFontWeight.bold,
    letterSpacing: 0,
  },
  meta: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: nemuFontWeight.regular,
  },
  copySpacer: {
    flex: 1,
    minHeight: WIDE_SPACER_MIN,
  },
  chapterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  chapterSlot: {
    flexShrink: 1,
  },
  chapter: {
    flexShrink: 1,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: nemuFontWeight.semibold,
  },
  newBadge: {
    borderRadius: radius.pill,
    borderCurve: "continuous",
    paddingHorizontal: 7,
    minHeight: 20,
    justifyContent: "center",
  },
  newBadgeText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: nemuFontWeight.semibold,
    fontVariant: ["tabular-nums"],
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
  },
  more: {
    width: CONTROL_SIZE,
    height: CONTROL_SIZE,
    borderRadius: CONTROL_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  resume: {
    minHeight: CONTROL_SIZE,
    borderRadius: CONTROL_SIZE / 2,
    borderCurve: "continuous",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingLeft: 14,
    paddingRight: 16,
  },
  resumeText: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: nemuFontWeight.semibold,
  },
  // The tall card's 44 pt Continue: body size, as the title page's.
  tallResumeText: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: nemuFontWeight.semibold,
  },
  dots: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    // Clears the card's shadow.
    marginTop: 6,
    height: 6,
  },
  dot: {
    height: 6,
    borderRadius: 6 / 2,
  },
});
