import { MOBILE_EXPLORE_RADIUS as R } from "@/lib/mobileExploreRadius";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactElement, type ReactNode } from "react";
import {
  Image,
  PixelRatio,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewInstance,
  type ViewStyle,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type {
  MobileMangaDetailSurfaceAction,
  MobileMangaDetailSurfaceBadge,
  MobileMangaDetailSurfacePrimaryAction,
} from "@/components/MobileMangaDetailSurface";
import { MobileMangaDetailTagSheet } from "@/components/MobileMangaDetailTagSheet";
import {
  createNemuShadowStyle,
  MobileCachedImage,
  nemuFontWeight,
  NemuPressable,
  NemuText,
  useMobilePageBleedStyles,
  useMobilePageGutters,
  useNemuTheme,
} from "@/design-system";
import { buildMobileCoverMeshColors, buildMobileCoverMeshInkSecondary } from "@/lib/mobileCoverMesh";
import { buildMobileCoverTintPalette } from "@/lib/mobileCoverTint";
import { formatMobileString, type MobileStrings } from "@/lib/mobileI18n";
import { useMobileCoverRegionTints, useMobileCoverTint } from "@/lib/useMobileCoverTint";
import { ZoomSource, ZoomTarget } from "../../../modules/nemu-window-layout";
import { getMobileBooksHeroCoverWidth } from "./mobileExploreCover";
import { useMobileExploreRestingFrame, useMobileExploreRestingTop } from "./useMobileExploreResting";
import { fitMobileRestingContent, isMobileCompactHeight, type MobileRestingBlock } from "@/lib/mobileExploreRestingFit";
import { ExploreGlassButton, ExploreGlassChip, ExploreGlassIconButton } from "./ExploreGlass";
import { ExploreGradient } from "./ExploreGradient";
import RNCMaskedView from "@react-native-masked-view/masked-view";
import { MobileCoverMeshBackground } from "./MobileCoverMeshBackground";
import { ExploreCoverFallback } from "./ExploreCoverFallback";
import { ExploreDissolveTarget } from "./ExploreDissolveTarget";
import { MobileExploreCoverPlaceholder } from "./MobileExploreCoverPlaceholder";
import { MobileExploreConfetti } from "./MobileExploreConfetti";
import { MobileOdometerText } from "./MobileOdometerText";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
} from "react-native-reanimated";

type CoverSource = number | { uri: string; headers?: Record<string, string> };

// Its types are built against another copy of React's types.
const MaskedView = RNCMaskedView as unknown as ComponentType<{
  maskElement: ReactElement;
  children: ReactNode;
}>;

const COVER_RADIUS = R.cover;
const PANE_RADIUS = R.card;
const HERO_TEXT_MAX_SCALE = 1.4;
/** How far the cover colour reaches up under the bar and the bounce. */
const TINT_OVERSCAN = 1000;
const TINT_FADE = 64;
/**
 * The living page reaches this far up under the bar (it is in sight at rest
 * from about 120 pt above the hero), and blends into the plain page colour
 * over its top and bottom bands so it meets the solid overscan and the fade.
 */
const MESH_OVERSCAN = 260;
const MESH_TOP_BLEND = 120;
const MESH_BOTTOM_BLEND = 90;
const VISIBLE_TAGS = 8;
/**
 * How many tag chips the rail shows: all of them when only one more would
 * hide behind a "+1" chip (a chip that opens a sheet to show one tag is a
 * detour), else `VISIBLE_TAGS` and a "+N" chip for the rest.
 */
function shownTagCount(total: number): number {
  return total - VISIBLE_TAGS <= 1 ? total : VISIBLE_TAGS;
}
/** The description shows this many lines until "more" (a line or two over stay whole). */
const DESCRIPTION_LINES = 4;
const DESCRIPTION_SLACK = 2;
/** Fewest lines the synopsis gives up to when the tab bar would cut what is above it. */
const DESCRIPTION_MIN_LINES = 2;
const DESCRIPTION_LINE_HEIGHT = 22;
/** A cover shown narrower than this (a thumbnail, never blown up) sits beside the title. */
const HERO_COMPACT_COVER_BELOW = 120;
/** The smallest the hero cover gets on a short window, so the actions and facts rest clear. */
const COVER_MIN_WIDTH = 150;
/** Gap between the hero's blocks (`styles.root.gap`). */
const BLOCK_GAP = 16;
/** First-commit estimates of the blocks the cover's size depends on (scaled with the text). */
/** Narrowest pane content width that fits the four facts in one row. */
const PANE_FACTS_ROW_MIN_WIDTH = 340;
const ESTIMATE = { headText: 8 + 18 + 33 + 4 + 20, facts: 34, actions: 50 } as const;
/** The primary button's leading glyph (the source's icon, or play): larger than the label's cap height. */
const PRIMARY_GLYPH = 22;
/** A wide hero: actions and synopsis keep a readable measure, centred. */
const WIDE_COLUMN = 560;
/** Head padding, the cover → title gap and the title's first line. */
const TITLE_BELOW_COVER = 64;
/** Padding of the hero as a panel in the regular-width info pane. */
const PANE_PADDING = 16;
/**
 * The pane cover's top below the page's resting top (the split layout's top
 * padding and the pane's own 22 pt; measured on the Air in landscape).
 */
const PANE_TOP_BELOW_REST = 70;
const PANE_COVER_MIN_WIDTH = 52;
/** The add sheet's dismissal, before the In Library pill celebrates. */
const LIBRARY_BURST_DELAY_MS = 320;

const MANGA_STATUS_LABEL: Record<number, keyof MobileStrings["metadataEditor"]> = {
  1: "statusOngoing",
  2: "statusCompleted",
  3: "statusCancelled",
  4: "statusHiatus",
};

/** How many facts the hero's strip would show (it shows from two). */
function infoRowCount(...values: Array<string | number | null | undefined>): number {
  return values.filter((value) => value !== null && value !== undefined && value !== "" && value !== 0).length;
}

function isRemote(
  source: CoverSource | null | undefined,
): source is { uri: string; headers?: Record<string, string> } {
  return typeof source === "object" && source !== null && typeof source.uri === "string";
}


/**
 * Apple Books product-page hero for a manga (design-explore): the cover's
 * colour behind the whole metadata block, the cover centred with a heavy
 * shadow, title and meta, then Liquid Glass actions (a prominent glass
 * Continue / Start reading and glass secondary buttons), the description and
 * a rail of glass tag chips. In the regular-width info pane it is a rounded
 * tinted panel instead of a full-bleed wash.
 */
export function MobileMangaDetailBooksHero({
  title,
  authors,
  coverSource,
  underCover,
  onCoverError,
  onCoverLoad,
  status,
  badges,
  primaryAction,
  secondaryActions = [],
  tags,
  description,
  infoTitle,
  infoChapters,
  infoLatest,
  zoomId,
  readerZoomId,
  deferBody = false,
  dissolveId = null,
  pane = false,
  onTitleBottom,
  strings,
}: {
  title: string;
  authors?: string[];
  coverSource?: CoverSource | null;
  /**
   * The cover the tapped cell painted (the zoom's handoff). Kept under the
   * page's own cover while that one loads, when the page asks for it
   * differently (another size or source headers), so the landed cover is
   * never blank.
   */
  underCover?: { uri: string; headers?: Record<string, string> } | null;
  onCoverError?: () => void;
  onCoverLoad?: () => void;
  status?: number;
  badges: MobileMangaDetailSurfaceBadge[];
  primaryAction?: MobileMangaDetailSurfacePrimaryAction | null;
  secondaryActions?: MobileMangaDetailSurfaceAction[];
  tags?: string[];
  description?: string | null;
  /** Source the primary action opens (e.g. "MangaDex"). */
  infoTitle?: string | null;
  /** Chapters the source lists, and its newest chapter ("Ch.131"). */
  infoChapters?: number | null;
  infoLatest?: string | null;
  /** The cover zooms in from the library source with this id. */
  zoomId?: string | null;
  /** The cover is the zoom source for opening the reader. */
  readerZoomId?: string | null;
  /**
   * Only the cover, title and meta for now: the page is still zooming in, and
   * the actions, synopsis and chips mount once it has landed.
   */
  deferBody?: boolean;
  /** The library title whose removal turns the cover to dust (before the page closes). */
  dissolveId?: string | null;
  /** Regular-width info pane. */
  pane?: boolean;
  /** Where the title block ends, from the hero's top (the bar title appears once it scrolls away). */
  onTitleBottom?: (bottom: number) => void;
  strings: MobileStrings;
}) {
  const { scheme, tokens } = useNemuTheme();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const bleed = useMobilePageBleedStyles();
  const gutters = useMobilePageGutters();
  const [tagSheetOpen, setTagSheetOpen] = useState(false);
  const remoteCover = isRemote(coverSource) ? coverSource : null;
  const tint = useMobileCoverTint(remoteCover);
  const regionTints = useMobileCoverRegionTints(pane || deferBody ? null : remoteCover);
  const palette = buildMobileCoverTintPalette(tint, scheme);
  // Secondary text holds AA over every pool of the living page.
  const meshOn = !pane && !deferBody;
  const inkSecondary = meshOn
    ? buildMobileCoverMeshInkSecondary(tint, buildMobileCoverMeshColors(tint, regionTints, scheme), scheme)
    : palette.inkSecondary;
  // Everything is sized from the hero's own frame (a page column, a split
  // pane, one side of a fold), not from the window. Until it is measured the
  // page's content width stands in, which is what a full-width hero gets, so
  // the cover a zoom lands on does not change size after the first commit.
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null);
  const onRootLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    setMeasuredWidth((current) => (current === next ? current : next));
  }, []);
  const frameWidth =
    measuredWidth ?? Math.max(0, pane ? windowWidth * 0.4 : windowWidth - gutters.left - gutters.right);
  const contentWidth = Math.max(0, pane ? frameWidth - PANE_PADDING * 2 : frameWidth);
  const shortPane = pane && isMobileCompactHeight(windowHeight);
  // Four facts side by side only where each keeps room for its value at the
// one type size every fact shares; narrower, they stack 2 x 2 (never shrunk).
const paneFactColumns = PixelRatio.getFontScale() > 1.3 || contentWidth < PANE_FACTS_ROW_MIN_WIDTH ? 2 : 4;
  const rest = useMobileExploreRestingFrame();
  const rootRef = useRef<ViewInstance>(null);
  const { top: restTop, onLayout: onRestLayout } = useMobileExploreRestingTop(rootRef, rest.windowKey);
  const naturalCoverWidth = getMobileBooksHeroCoverWidth(contentWidth);
  const hasActions = Boolean(primaryAction || secondaryActions.length);
  // Resting content clears the tab bar (mobileExploreRestingFit). The
  // cover's size is the zoom's landing spot, so it comes from the window
  // alone, never from a later measurement: on a short window it gives up
  // height until the actions, the facts and two synopsis lines rest above the
  // tab bar.
  const coverWidth = (() => {
    if (pane) {
      // A short window (a phone in landscape): the cover above the title
      // leaves no room for the actions above the tab bar, so the
      // pane takes the small-cover head (cover beside the title), its cover
      // as tall as that head leaves room for with the actions under it.
      if (!shortPane) return naturalCoverWidth;
      const scale = rest.fontScale(HERO_TEXT_MAX_SCALE);
      // The facts rest above the tab bar too.
      const factsRoom = infoRowCount(infoTitle, infoChapters, infoLatest, status) >= 2 ? BLOCK_GAP + ESTIMATE.facts * scale * (paneFactColumns === 2 ? 2 : 1) + (paneFactColumns === 2 ? 8 : 0) : 0;
      const room =
        rest.edge -
        (rest.topEstimate + PANE_TOP_BELOW_REST) -
        BLOCK_GAP -
        ESTIMATE.actions * scale -
        factsRoom -
        PANE_PADDING;
      return Math.max(PANE_COVER_MIN_WIDTH, Math.min(HERO_COMPACT_COVER_BELOW - 1, Math.floor(room / 1.5)));
    }
    if (naturalCoverWidth <= COVER_MIN_WIDTH) return naturalCoverWidth;
    const scale = rest.fontScale(HERO_TEXT_MAX_SCALE);
    const naturalHeight = Math.round(naturalCoverWidth * 1.5);
    const minHeight = Math.round(COVER_MIN_WIDTH * 1.5);
    const blocks: MobileRestingBlock[] = [
      {
        key: "head",
        gap: 0,
        height: naturalHeight + ESTIMATE.headText * scale,
        rests: "whole",
        shrink: { by: naturalHeight - minHeight, order: 0 },
      },
    ];
    if (hasActions) blocks.push({ key: "actions", gap: BLOCK_GAP, height: ESTIMATE.actions * scale, rests: "whole" });
    blocks.push({ key: "facts", gap: BLOCK_GAP, height: ESTIMATE.facts * scale, rests: "whole" });
    if (description) {
      blocks.push({
        key: "synopsis",
        gap: BLOCK_GAP,
        height: DESCRIPTION_MIN_LINES * DESCRIPTION_LINE_HEIGHT * scale,
        rests: "whole",
      });
    }
    const fit = fitMobileRestingContent({ top: rest.topEstimate, edge: rest.edge, blocks });
    if (fit.mode !== "shrunk") return naturalCoverWidth;
    const shrunk = naturalHeight - (blocks[0]!.height - fit.heights.head!);
    return Math.max(COVER_MIN_WIDTH, Math.round(shrunk / 1.5));
  })();
  // The cover always fills its slot, whatever its pixels (the sharpest same-art
  // variant is picked upstream); only a short pane's small-cover head (cover
  // beside the title) comes from the window, never from the cover's pixels.
  const shownCoverWidth = coverWidth;
  const compactHead = shownCoverWidth < HERO_COMPACT_COVER_BELOW;
  const wide = !pane && contentWidth > WIDE_COLUMN;
  // The first title line ends this far below the hero's top.
  const titleBottom = compactHead
    ? Math.round(shownCoverWidth * 1.5) + 8
    : Math.round(shownCoverWidth * 1.5) + TITLE_BELOW_COVER;
  useEffect(() => {
    onTitleBottom?.(titleBottom);
  }, [onTitleBottom, titleBottom]);
  const column = pane ? null : styles.wideColumn;
  const statusKey = status != null ? MANGA_STATUS_LABEL[status] : undefined;
  const tagList = tags ?? [];
  // Genres live in the chips below the description, not here as well.
  const statusLabel = statusKey ? strings.metadataEditor[statusKey] : null;
  // Small labels over values, under the synopsis. With fewer than two facts
  // the status stays a line under the authors instead.
  const facts = [
    infoTitle ? { label: strings.designExplore.factSource, value: infoTitle } : null,
    infoChapters ? { label: strings.designExplore.factChapters, value: String(infoChapters) } : null,
    infoLatest ? { label: strings.designExplore.factLatest, value: infoLatest } : null,
    statusLabel ? { label: strings.designExplore.factStatus, value: statusLabel } : null,
  ].filter((fact): fact is { label: string; value: string } => fact !== null);
  const factsRow = facts.length >= 2;
  const factMinWidth = Math.floor(Math.min(contentWidth, WIDE_COLUMN) / Math.max(1, facts.length));
  const primaryUnavailable = Boolean(primaryAction && (primaryAction.disabled || !primaryAction.available));
  const primaryInk = primaryUnavailable ? inkSecondary : palette.primaryInk;
  const libraryAction = secondaryActions.find((action) => action.key === "library");
  const iconActions = secondaryActions.filter((action) => action !== libraryAction);
  const libraryAdded = libraryAction ? libraryAction.iconName !== "add-outline" : false;
  // The moment a title joins the library: the In Library pill pops and
  // confetti in the cover's colours bursts out of it.
  const [libraryBurst, setLibraryBurst] = useState(0);
  const wasAdded = useRef(libraryAdded);
  const hasLibraryAction = Boolean(libraryAction);
  useEffect(() => {
    const added = hasLibraryAction && libraryAdded && !wasAdded.current;
    wasAdded.current = libraryAdded;
    if (!added) return undefined;
    // After the add sheet has gone, so the moment plays on the page itself.
    const timer = setTimeout(() => setLibraryBurst((value) => value + 1), LIBRARY_BURST_DELAY_MS);
    return () => clearTimeout(timer);
  }, [hasLibraryAction, libraryAdded]);

  // The measured fit, once the body is on screen: the synopsis ends on a
  // whole line above the tab bar (it gives lines down to two), and a block
  // the tab bar would still cut drops under it by a slightly wider gap.
  const [blockHeights, setBlockHeights] = useState<Record<string, number>>({});
  const measureBlock = useCallback((key: string) => (event: LayoutChangeEvent) => {
    const height = Math.round(event.nativeEvent.layout.height);
    setBlockHeights((current) => (current[key] === height ? current : { ...current, [key]: height }));
  }, []);
  const onHeadLayout = useMemo(() => measureBlock("head"), [measureBlock]);
  const onActionsLayout = useMemo(() => measureBlock("actions"), [measureBlock]);
  const onFactsLayout = useMemo(() => measureBlock("facts"), [measureBlock]);
  const onTagsLayout = useMemo(() => measureBlock("tags"), [measureBlock]);
  const [synopsisMeasure, setSynopsisMeasure] = useState<{ lines: number; lineHeight: number } | null>(null);
  const onSynopsisMeasure = useCallback((next: { lines: number; lineHeight: number }) => {
    setSynopsisMeasure((current) =>
      current && current.lines === next.lines && current.lineHeight === next.lineHeight ? current : next,
    );
  }, []);
  const synopsisNatural = synopsisMeasure
    ? synopsisMeasure.lines <= DESCRIPTION_LINES + DESCRIPTION_SLACK
      ? synopsisMeasure.lines
      : DESCRIPTION_LINES
    : DESCRIPTION_LINES;
  const hasTags = Boolean(badges.length || tagList.length);
  const restingFit = (() => {
    if (pane || deferBody || restTop === null) return null;
    const order: [string, boolean][] = [
      ["head", true],
      ["actions", hasActions],
      ["facts", factsRow],
      ["synopsis", Boolean(description)],
      ["tags", hasTags],
    ];
    const blocks: MobileRestingBlock[] = [];
    for (const [key, present] of order) {
      if (!present) continue;
      if (key === "synopsis") {
        if (!synopsisMeasure) return null;
        const lineHeight = synopsisMeasure.lineHeight;
        blocks.push({
          key,
          gap: BLOCK_GAP,
          height: synopsisNatural * lineHeight,
          rests: "whole",
          shrink:
            synopsisNatural > DESCRIPTION_MIN_LINES
              ? { by: (synopsisNatural - DESCRIPTION_MIN_LINES) * lineHeight, step: lineHeight, order: 0 }
              : undefined,
        });
        continue;
      }
      const height = blockHeights[key];
      if (height === undefined) return null;
      blocks.push({ key, gap: key === "head" ? 0 : BLOCK_GAP, height, rests: "whole" });
    }
    return fitMobileRestingContent({ top: restTop, edge: rest.edge, blocks });
  })();
  const synopsisLines =
    restingFit && synopsisMeasure && restingFit.heights.synopsis !== undefined
      ? Math.max(DESCRIPTION_MIN_LINES, Math.round(restingFit.heights.synopsis / synopsisMeasure.lineHeight))
      : synopsisNatural;
  const pushStyle = (key: string) => {
    const gap = restingFit?.gaps[key];
    return gap !== undefined && gap > BLOCK_GAP ? { marginTop: gap - BLOCK_GAP } : null;
  };

  // Confetti in the cover's own colours at card strength (its main colour and
  // its quarters), plus gold and one more accent that reads on the page:
  // white on a dark page, coral on a light one (white vanishes there).
  const confettiColors = [
    palette.card,
    ...(regionTints ?? []).map((rgb) => buildMobileCoverTintPalette(rgb, scheme).card),
    scheme === "dark" ? "#ffffff" : "#ff6b5e",
    "#ffc83d",
    palette.card,
  ];

  const coverView = (
    <View
      style={[
        styles.cover,
        {
          width: shownCoverWidth,
          height: Math.round(shownCoverWidth * 1.5),
          backgroundColor: palette.actionSoft,
          // A soft glow in the cover's colour rather than a grey drop shadow.
          ...createNemuShadowStyle({ color: palette.glow, offsetY: 16, radius: 34, elevation: 12 }),
        },
      ]}
    >
      <View style={styles.coverClip}>
        {remoteCover && underCover && !sameMobileExploreCoverRequest(underCover, remoteCover) ? (
          <MobileCachedImage
            uriOwnership="source"
            cacheKind="cover"
            source={underCover}
            fadeIn={false}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        {remoteCover ? (
          <MobileCachedImage
            uriOwnership="source"
            cacheKind="cover"
            source={remoteCover}
            // No fade: the cover sits inside the native zoom views, where the
            // native-driven opacity animation can be lost and leave a loaded
            // cover invisible.
            fadeIn={false}
            onError={onCoverError ? () => onCoverError() : undefined}
            onLoad={onCoverLoad ? () => onCoverLoad() : undefined}
            fallback={<ExploreCoverFallback title={title} width={shownCoverWidth} color={palette.actionSoft} />}
            style={styles.coverImage}
          />
        ) : coverSource ? (
          <Image source={coverSource} style={styles.coverImage} />
        ) : (
          <MobileExploreCoverPlaceholder title={title} width={shownCoverWidth} />
        )}
      </View>
    </View>
  );
  const dissolvable = dissolveId ? <ExploreDissolveTarget id={dissolveId} preferred>{coverView}</ExploreDissolveTarget> : coverView;
  let cover: ReactNode = readerZoomId ? (
    <ZoomSource zoomId={readerZoomId} style={compactHead ? styles.zoomBoxCompact : styles.zoomBox}>
      {dissolvable}
    </ZoomSource>
  ) : (
    dissolvable
  );
  if (zoomId) {
    cover = (
      <ZoomTarget zoomId={zoomId} style={compactHead ? styles.zoomBoxCompact : styles.zoomBox}>
        {cover}
      </ZoomTarget>
    );
  }
  // The genres close the page's content; the two-column pane centres them under the synopsis.
  const tagsNode =
    badges.length || tagList.length ? (
        <ScrollView
          horizontal
          // Not a status-bar target: iOS scrolls to the top only when exactly one scroll view on screen asks to.
          scrollsToTop={false}
          showsHorizontalScrollIndicator={false}
          style={[pane ? null : bleed.frame, pushStyle("tags")]}
          onLayout={onTagsLayout}
          contentContainerStyle={[pane ? null : bleed.content, styles.tags, wide || pane ? styles.tagsCentred : null]}
        >
          {badges.map((badge) => (
            <ExploreGlassChip key={badge.key} label={badge.label} ink={palette.ink} selected={badge.tone === "primary"} />
          ))}
          {tagList.slice(0, shownTagCount(tagList.length)).map((tag, index) => (
            <ExploreGlassChip key={`${index}:${tag}`} label={tag} ink={palette.ink} />
          ))}
          {tagList.length > shownTagCount(tagList.length) ? (
            <ExploreGlassChip
              label={`+${tagList.length - VISIBLE_TAGS}`}
              ink={palette.ink}
              accessibilityLabel={formatMobileString(strings.common.moreTags, {
                count: tagList.length - VISIBLE_TAGS,
              })}
              accessibilityHint={strings.common.tagsSheetHint}
              onPress={() => setTagSheetOpen(true)}
            />
          ) : null}
        </ScrollView>
    ) : null;

  return (
    <View
      ref={rootRef}
      onLayout={(event) => {
        onRootLayout(event);
        onRestLayout();
      }}
      style={[
        styles.root,
        pane ? [styles.paneRoot, shortPane ? styles.paneRootShort : null, { backgroundColor: palette.page }] : null,
        // While the body is held back the hero still fills the screen, so the
        // page that zooms in is the cover's colour from top to bottom rather
        // than a tinted block that ends under the title.
        deferBody && !pane ? { minHeight: windowHeight } : null,
      ]}
    >
      {pane ? null : (
        <>
          {/* The page colour runs to both window edges, under a vertical
              system bar as well; only content keeps out of that column. */}
          <View
            pointerEvents="none"
            style={[
              styles.tint,
              { left: -gutters.left, right: -gutters.right, backgroundColor: palette.page },
            ]}
          />
          <ExploreGradient
            pointerEvents="none"
            colors={[palette.page, palette.pageClear]}
            style={[styles.tintFade, { left: -gutters.left, right: -gutters.right }]}
          />
          {/* Mounted once the zoom has landed, so the push carries no canvas. */}
          {deferBody ? null : (
            <MobileCoverMeshBackground
              main={tint}
              regions={regionTints}
              scheme={scheme}
              topBlend={MESH_TOP_BLEND}
              bottomBlend={MESH_BOTTOM_BLEND}
              landingKey="landed"
              style={[styles.mesh, { left: -gutters.left, right: -gutters.right }]}
            />
          )}
        </>
      )}

      <View style={[styles.head, compactHead ? [styles.headCompact, column] : null]} onLayout={onHeadLayout}>
        {cover}
        <View style={compactHead ? styles.titleBlockCompact : styles.titleBlock}>
          <NemuText
            accessibilityRole="header"
            maxFontSizeMultiplier={HERO_TEXT_MAX_SCALE}
            numberOfLines={compactHead ? 2 : 3}
            color={palette.ink}
            style={[styles.title, compactHead ? styles.titleCompact : null]}
          >
            {title}
          </NemuText>
          {authors?.length ? (
            <NemuText
              maxFontSizeMultiplier={HERO_TEXT_MAX_SCALE}
              numberOfLines={2}
              color={inkSecondary}
              style={[styles.authors, compactHead ? styles.leading : null]}
            >
              {authors.join(", ")}
            </NemuText>
          ) : null}
          {statusLabel && !factsRow ? (
            <NemuText
              maxFontSizeMultiplier={HERO_TEXT_MAX_SCALE}
              numberOfLines={1}
              color={inkSecondary}
              style={[styles.meta, compactHead ? styles.leading : null]}
            >
              {statusLabel}
            </NemuText>
          ) : null}
        </View>
      </View>

      {deferBody ? null : (
        <>
      {primaryAction || secondaryActions.length ? (
        <View style={[styles.actionsBlock, column, pushStyle("actions")]} onLayout={onActionsLayout}>
          <View style={styles.actions}>
            {iconActions.map((action) => (
              <ExploreGlassIconButton
                key={action.key}
                icon={action.iconName}
                accessibilityLabel={action.accessibilityLabel}
                accessibilityHint={action.accessibilityHint}
                busy={action.busy}
                disabled={action.disabled}
                ink={action.key === "remove" ? tokens.danger : palette.ink}
                onPress={action.onPress}
              />
            ))}
            {libraryAction ? (
              <LibraryPop
                // One view per state, each with its whole flex set: switching
                // a layout prop off on the same animated view left the pill's
                // old flex in place after remove + re-add (250 / 120 pt
                // instead of two equal capsules, Continue cut short).
                key={libraryAdded ? "added" : "add"}
                burstKey={libraryBurst}
                colors={confettiColors}
                // Saved: a compact pill, so Continue keeps its full label.
                style={libraryAdded ? styles.compactButton : styles.flexButton}
              >
              <ExploreGlassButton
                label={libraryAdded ? strings.designExplore.inLibrary : strings.designExplore.addToLibrary}
                icon={libraryAdded ? "checkmark" : "add"}
                accessibilityLabel={libraryAction.accessibilityLabel}
                accessibilityHint={libraryAction.accessibilityHint}
                busy={libraryAction.busy}
                disabled={libraryAction.disabled}
                ink={palette.ink}
                onPress={libraryAction.onPress}
              />
              </LibraryPop>
            ) : null}
            {primaryAction ? (
              <ExploreGlassButton
                prominent
                // The cover's own colour at strength, on the page's lighter
                // (light mode) or deeper (dark mode) shade of it; never so
                // pale or grey that it reads as disabled (`palette.primary`).
                tint={palette.primary}
                ink={primaryInk}
                // Paired with Add to Library (two equal capsules): the short label.
                label={
                  libraryAction && !libraryAdded
                    ? (primaryAction.compactLabel ?? primaryAction.label)
                    : primaryAction.label
                }
                // A narrow pane: the short label rather than a cut one.
                shortLabel={primaryAction.compactLabel}
                accessibilityLabel={primaryAction.accessibilityLabel}
                accessibilityHint={primaryAction.accessibilityHint}
                busy={primaryAction.busy}
                disabled={primaryAction.disabled || !primaryAction.available}
                iconNode={
                  primaryAction.iconUri ? (
                    <MobileCachedImage
                      uriOwnership="source"
                      source={{ uri: primaryAction.iconUri }}
                      fallback={<Ionicons name="play" size={PRIMARY_GLYPH} color={primaryInk} />}
                      style={styles.primaryIcon}
                    />
                  ) : (
                    <Ionicons name="play" size={PRIMARY_GLYPH} color={primaryInk} />
                  )
                }
                onPress={primaryAction.onPress}
                style={styles.flexButton}
              />
            ) : null}
          </View>
        </View>
      ) : null}

      {factsRow && pane ? (
        <View style={[styles.facts, { flexWrap: "wrap", rowGap: 8 }, pushStyle("facts")]} onLayout={onFactsLayout}>
          {facts.map((fact, index) => (
            <View
              key={fact.label}
              accessible
              accessibilityLabel={`${fact.label}, ${fact.value}`}
              style={[
                styles.fact,
                { width: `${100 / paneFactColumns}%`, flexGrow: 0, minWidth: 0 },
                index % paneFactColumns > 0 ? [styles.factDivided, { borderLeftColor: palette.rule }] : null,
              ]}
            >
              <NemuText
                numberOfLines={1}
                maxFontSizeMultiplier={HERO_TEXT_MAX_SCALE}
                color={inkSecondary}
                style={styles.factLabel}
              >
                {fact.label}
              </NemuText>
              <NemuText
                maxFontSizeMultiplier={HERO_TEXT_MAX_SCALE}
                color={palette.ink}
                style={[styles.factValue, { textAlign: "center", width: "100%" }]}
              >
                {fact.value}
              </NemuText>
            </View>
          ))}
        </View>
      ) : factsRow ? (
        // An info strip: each fact at least an equal share of the column,
        // wider when its value needs it, and the strip scrolls sideways
        // instead of cutting a long source name or chapter label short.
        <ScrollView
          horizontal
          // Not a status-bar target: iOS scrolls to the top only when exactly one scroll view on screen asks to.
          scrollsToTop={false}
          showsHorizontalScrollIndicator={false}
          // On a phone the strip runs to the screen edges (a fixed `width:
          // 100%` column kept it at the gutter, cutting the last value with
          // a hard edge); a wide window centres it in the column instead.
          style={[wide ? column : pane ? null : bleed.frame, pushStyle("facts")]}
          onLayout={onFactsLayout}
          contentContainerStyle={[styles.facts, pane || wide ? null : bleed.content]}
        >
          {facts.map((fact, index) => (
            <View
              key={fact.label}
              accessible
              accessibilityLabel={`${fact.label}, ${fact.value}`}
              style={[
                styles.fact,
                { minWidth: factMinWidth },
                index > 0 ? [styles.factDivided, { borderLeftColor: palette.rule }] : null,
              ]}
            >
              <NemuText
                numberOfLines={1}
                maxFontSizeMultiplier={HERO_TEXT_MAX_SCALE}
                color={inkSecondary}
                style={styles.factLabel}
              >
                {fact.label}
              </NemuText>
              {/* Turns over when the value changes (another source picked, a refresh). */}
              <MobileOdometerText
                value={fact.value}
                maxFontSizeMultiplier={HERO_TEXT_MAX_SCALE}
                color={palette.ink}
                style={styles.factValue}
              />
            </View>
          ))}
        </ScrollView>
      ) : null}

      {description ? (
        <HeroDescription
          key={description}
          style={[column, pushStyle("synopsis")]}
          value={description}
          lines={synopsisLines}
          onMeasure={onSynopsisMeasure}
          ink={inkSecondary}
          moreInk={palette.ink}
          strings={strings}
        />
      ) : null}

      {tagsNode}

      {tagList.length ? (
        <MobileMangaDetailTagSheet
          visible={tagSheetOpen}
          tags={tagList}
          strings={strings}
          onClose={() => setTagSheetOpen(false)}
        />
      ) : null}
        </>
      )}
    </View>
  );
}

/** Wraps the library pill: a pop and a burst of confetti when `burstKey` changes. */
function LibraryPop({
  burstKey,
  colors,
  style,
  children,
}: {
  burstKey: number;
  colors: readonly string[];
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const first = useRef(burstKey);
  useEffect(() => {
    if (burstKey === first.current || reducedMotion) return;
    // A squash and one small rise (damping ratio ≈ 0.5, peak ≈ 1.08): the
    // earlier 0.15 ratio swung the pill to 1.3× over its neighbour.
    scale.value = withSequence(
      withSpring(0.9, { damping: 30, stiffness: 900 }),
      withSpring(1.06, { damping: 22, stiffness: 520 }),
      withSpring(1, { damping: 26, stiffness: 300 }),
    );
  }, [burstKey, reducedMotion, scale]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={[style, popStyle]}>
      {children}
      {/* Drawn in a window-level layer, over everything below the pill. */}
      <MobileExploreConfetti burstKey={burstKey} colors={colors} />
    </Animated.View>
  );
}

/**
 * The synopsis, in the hero's ink. A long one shows its first lines with a
 * trailing "more" that fades in over the last line; tapping it opens the rest
 * (and tapping again folds it back).
 */
function HeroDescription({
  value,
  ink,
  moreInk,
  strings,
  style,
  lines,
  onMeasure,
}: {
  style?: StyleProp<ViewStyle>;
  value: string;
  ink: string;
  moreInk: string;
  strings: MobileStrings;
  /** Lines shown until "more" (the hero's resting fit picks them). */
  lines: number;
  /** The synopsis' full line count and line height at this width. */
  onMeasure: (measure: { lines: number; lineHeight: number }) => void;
}) {
  const [lineCount, setLineCount] = useState<number | null>(null);
  const [lineHeight, setLineHeight] = useState(DESCRIPTION_LINE_HEIGHT);
  const [moreWidth, setMoreWidth] = useState(44);
  const [expanded, setExpanded] = useState(false);
  const collapsible = lineCount !== null && lineCount > lines;
  const clamped = collapsible && !expanded;
  const text = (
    <NemuText
      // Until measured, hold the collapsed height so a long synopsis never
      // flashes open and shut.
      numberOfLines={lineCount === null ? lines : undefined}
      color={ink}
      style={styles.description}
    >
      {value}
    </NemuText>
  );
  return (
    <View style={style}>
      {/* Unclamped twin, never seen: counts the synopsis' lines at this width. */}
      <NemuText
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        onTextLayout={(event) => {
          const measured = event.nativeEvent.lines;
          setLineCount(measured.length);
          setLineHeight(measured[0]?.height ?? DESCRIPTION_LINE_HEIGHT);
          onMeasure({
            lines: measured.length,
            lineHeight: Math.round(measured[0]?.height ?? DESCRIPTION_LINE_HEIGHT),
          });
        }}
        style={[styles.description, styles.descriptionMeasure]}
      >
        {value}
      </NemuText>
      {collapsible ? (
        <NemuPressable
          accessibilityRole="button"
          accessibilityLabel={value}
          accessibilityHint={expanded ? strings.common.collapse : strings.common.expand}
          accessibilityState={{ expanded }}
          hapticFeedback="press"
          pressedScale={1}
          onPress={() => setExpanded((current) => !current)}
        >
          {clamped ? (
            // The last line's trailing end fades out through a mask on the
            // text itself, so whatever is behind it (the drifting living
            // page) shows through; a painted fade was one solid colour and
            // read as a dark block over the moving pools.
            <MaskedView
              maskElement={
                <View style={styles.maskFill}>
                  <View style={{ height: (lines - 1) * lineHeight, backgroundColor: "#000" }} />
                  <View style={[styles.maskLine, { height: lineHeight }]}>
                    <View style={styles.maskSolid} />
                    <ExploreGradient direction="right" colors={["#000000", "rgba(0,0,0,0)"]} style={styles.moreFade} />
                    <View style={{ width: moreWidth }} />
                  </View>
                </View>
              }
            >
              <NemuText numberOfLines={lines} color={ink} style={styles.description}>
                {value}
              </NemuText>
            </MaskedView>
          ) : (
            text
          )}
          {clamped ? (
            <View pointerEvents="none" style={styles.more}>
              <NemuText
                color={moreInk}
                style={styles.moreText}
                onLayout={(event) => setMoreWidth(Math.ceil(event.nativeEvent.layout.width))}
              >
                {strings.designExplore.descriptionMore}
              </NemuText>
            </View>
          ) : null}
        </NemuPressable>
      ) : (
        text
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 16,
    paddingBottom: 8,
  },
  // A phone in landscape: tighter spacing between head, actions and facts.
  paneRootShort: {
    gap: 10,
  },
  paneRoot: {
    borderRadius: PANE_RADIUS,
    borderCurve: "continuous",
    padding: PANE_PADDING,
    paddingTop: 22,
  },
  tint: {
    position: "absolute",
    top: -TINT_OVERSCAN,
    bottom: 0,
  },
  mesh: {
    position: "absolute",
    top: -MESH_OVERSCAN,
    bottom: 0,
  },
  tintFade: {
    position: "absolute",
    bottom: -TINT_FADE,
    height: TINT_FADE,
  },
  head: {
    alignItems: "center",
    paddingTop: 8,
    gap: 18,
  },
  // A small cover beside the title, both on the leading edge.
  headCompact: {
    flexDirection: "row",
    // Title and author, as one group, centred against the cover.
    alignItems: "center",
    alignSelf: "stretch",
    gap: 16,
  },
  zoomBox: {
    alignSelf: "center",
  },
  zoomBoxCompact: {
    alignSelf: "flex-start",
  },
  // Explicit size (not aspectRatio): the zoom views are sized by their content.
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
  titleBlock: {
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
  },
  titleBlockCompact: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  titleCompact: {
    fontSize: 24,
    lineHeight: 29,
    textAlign: "left",
  },
  leading: {
    textAlign: "left",
  },
  title: {
    fontSize: 28,
    lineHeight: 33,
    fontWeight: nemuFontWeight.bold,
    letterSpacing: -0.3,
    textAlign: "center",
  },
  authors: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: nemuFontWeight.regular,
    textAlign: "center",
  },
  meta: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: nemuFontWeight.medium,
    textAlign: "center",
  },
  description: {
    fontSize: 15,
    lineHeight: DESCRIPTION_LINE_HEIGHT,
  },
  descriptionMeasure: {
    position: "absolute",
    left: 0,
    right: 0,
    opacity: 0,
  },
  // Sits on the last collapsed line's trailing end.
  more: {
    position: "absolute",
    right: 0,
    bottom: 0,
    flexDirection: "row",
  },
  moreFade: {
    width: 40,
  },
  maskFill: {
    flex: 1,
  },
  maskLine: {
    flexDirection: "row",
  },
  maskSolid: {
    flex: 1,
    backgroundColor: "#000",
  },
  moreText: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: nemuFontWeight.semibold,
    paddingLeft: 2,
  },
  actionsBlock: {
    gap: 12,
  },
  facts: {
    flexDirection: "row",
    flexGrow: 1,
  },
  fact: {
    flexGrow: 1,
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 6,
  },
  // A hairline rule between facts.
  factDivided: {
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
  factLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: nemuFontWeight.medium,
  },
  factValue: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: nemuFontWeight.semibold,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  compactButton: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "auto",
  },
  flexButton: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
  },
  primaryIcon: {
    width: PRIMARY_GLYPH,
    height: PRIMARY_GLYPH,
    borderRadius: R.thumb,
  },
  tags: {
    gap: 8,
  },
  tagsCentred: {
    flexGrow: 1,
    justifyContent: "center",
  },
  wideColumn: {
    width: "100%",
    maxWidth: WIDE_COLUMN,
    alignSelf: "center",
  },
});

function sameMobileExploreCoverRequest(
  a: { uri: string; headers?: Record<string, string> },
  b: { uri: string; headers?: Record<string, string> },
): boolean {
  return a.uri === b.uri && JSON.stringify(a.headers ?? {}) === JSON.stringify(b.headers ?? {});
}
