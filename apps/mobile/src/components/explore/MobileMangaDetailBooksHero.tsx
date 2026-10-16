import { MOBILE_EXPLORE_RADIUS as R } from "@/lib/mobileExploreRadius";
import {
  MobileMangaDetailTopHeaderContext,
  MobileMangaDetailWashContext,
  useMobileMangaDetailPane,
} from "@/components/MobileMangaDetailPaneContext";
import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType, type ReactElement, type ReactNode } from "react";
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
import { MobileMangaDetailDescriptionSheet } from "@/components/MobileMangaDetailDescriptionSheet";
import { MobileMangaDetailInfoSheet } from "@/components/MobileMangaDetailInfoSheet";
import {
  createNemuShadowStyle,
  MobileCachedImage,
  nemuFontWeight,
  NemuPressable,
  NemuText,
  radius,
  spacing,
  useMobilePageBleedStyles,
  useMobilePageGutters,
  useNemuTheme,
} from "@/design-system";
import { buildMobileCoverMeshColors, buildMobileCoverMeshInkSecondary } from "@/lib/mobileCoverMesh";
import { buildMobileCoverTintPalette } from "@/lib/mobileCoverTint";
import type { MobileStrings } from "@/lib/mobileI18n";
import {
  buildMobileDetailInfoRows,
  buildMobileDetailMetaCandidates,
  fitMobileDetailFacts,
  guessMobileDetailFactsLayout,
  pickMobileDetailMetaLine,
  withoutMobileDescriptionLicence,
} from "@/lib/mobileMangaDetailInfo";
import { useMobileCoverRegionTints, useMobileCoverTint } from "@/lib/useMobileCoverTint";
import { ConcentricView, ZoomSource, ZoomTarget } from "../../../modules/nemu-window-layout";
import { getMobileBooksHeroCoverWidth } from "./mobileExploreCover";
import { useMobileExploreRestingFrame, useMobileExploreRestingTop } from "./useMobileExploreResting";
import { fitMobileRestingContent, isMobileCompactHeight, MOBILE_RESTING, type MobileRestingBlock } from "@/lib/mobileExploreRestingFit";
import { ExploreGlassButton, ExploreGlassChip, ExploreGlassIconButton, ExploreLibraryGlyph } from "./ExploreGlass";
import { useMobileAdaptiveLayout } from "@/lib/MobileWindowLayoutContext";
import { ExploreGradient } from "./ExploreGradient";
import RNCMaskedView from "@react-native-masked-view/masked-view";
import { MobileCoverMeshBackground } from "./MobileCoverMeshBackground";
import { ExploreCoverFallback } from "./ExploreCoverFallback";
import { ExploreDissolveTarget } from "./ExploreDissolveTarget";
import { ExploreRailFade } from "./ExploreSourceHome";
import { MobileExploreCoverPlaceholder } from "./MobileExploreCoverPlaceholder";
import { MobileExploreConfetti } from "./MobileExploreConfetti";
import { MobileOdometerText } from "./MobileOdometerText";
import { useSkeletonPulse } from "@/lib/useSkeletonPulse";
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
const TINT_FADE = 40;
/**
 * The living page reaches this far up under the bar (it is in sight at rest
 * from about 120 pt above the hero), and blends into the plain page colour
 * over its top and bottom bands so it meets the solid overscan and the fade.
 */
const MESH_OVERSCAN = 260;
const MESH_TOP_BLEND = 120;
const MESH_BOTTOM_BLEND = 90;
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
/**
 * The wide page's hero column: the synopsis lines its cover leaves room for
 * (a real paragraph, not two lines), and the smallest the cover gets for them.
 */
const COLUMN_PARAGRAPH_LINES = 5;
const COLUMN_COVER_MIN_WIDTH = 120;
/** The hero column's action row at most (pt): the Duo inner display's column. */
const COLUMN_ACTIONS_MAX_WIDTH = 360;
/** `styles.head.paddingTop`: the cover's top below the hero's. */
const HEAD_PADDING_TOP = 8;
/** First-commit estimates of the blocks the cover's size depends on (scaled with the text). */
const ESTIMATE = { headText: 8 + 18 + 33 + 4 + 20, facts: 34, actions: 50 } as const;
/** The primary button's leading glyph (the source's icon, or play): larger than the label's cap height. */
const PRIMARY_GLYPH = 22;
/** The Continue capsule in the wide header (pt): about a phone portrait's button. */
const TOP_PRIMARY_MAX_WIDTH = 340;
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
/** The glass capsule and chip heights (ExploreGlass), for the loading bars. */
const ACTION_HEIGHT = 46;
/** The gap between the hero's action buttons (styles.actions). */
const ACTION_GAP = 10;
const CHIP_HEIGHT = 32;
/** The ⓘ that opens the 作品信息 sheet. */
const INFO_GLYPH = 20;
/** `styles.titleBlock`'s side padding. */
const TITLE_BLOCK_PADDING = 12;
/** The ⓘ's box and its gap from the text before it (styles.infoButton, styles.metaRow). */
const INFO_ROOM = INFO_GLYPH + 4 + 6;
/** The ⓘ's box and its gap after the facts (styles.infoButton, styles.factsWithInfo). */
const FACTS_INFO_ROOM = INFO_GLYPH + 4 + 4;
/** How far a long fact value in half the row shrinks before it is cut. */
const FACT_VALUE_MIN_SCALE = 0.75;
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
  infoLatestNumber,
  infoLanguages,
  infoLicense,
  infoAdded,
  infoLastRead,
  zoomId,
  readerZoomId,
  deferBody = false,
  dissolveId = null,
  pane: paneProp = false,
  placeholder = false,
  pending = false,
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
  /** The newest chapter's number alone ("Ch.131"), for a meta line with no room for its volume or title. */
  infoLatestNumber?: string | null;
  /**
   * What only the 作品信息 sheet shows: the languages the source lists the
   * title in, its content licence, and when it was added and last read
   * (formatted).
   */
  infoLanguages?: string[] | null;
  infoLicense?: string | null;
  infoAdded?: string | null;
  infoLastRead?: string | null;
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
  /**
   * The page is still loading (nothing known yet): the same hero, laid out as
   * if a synopsis, actions and every fact were coming, with quiet bars in
   * place of the text, so the cover and the blocks stay put when it lands.
   */
  placeholder?: boolean;
  /** The details are still loading (what is shown came from the listing). */
  pending?: boolean;
  /** Where the title block ends, from the hero's top (the bar title appears once it scrolls away). */
  onTitleBottom?: (bottom: number) => void;
  strings: MobileStrings;
}) {
  const { reduceMotion, scheme, tokens } = useNemuTheme();
  const pulse = useSkeletonPulse(reduceMotion === true, placeholder);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const bleed = useMobilePageBleedStyles();
  const { verticalBarSide } = useMobileAdaptiveLayout();
  const gutters = useMobilePageGutters();
  // The wide two-column page: the hero stands in the leading column as the
  // phone's stacked hero (no panel, no wash of its own: the page behind both
  // columns is the cover's colour, painted from what the hero publishes).
  const detailPane = useMobileMangaDetailPane();
  const inColumn = detailPane.role === "leading" && detailPane.columns === true;
  const pane = paneProp && !inColumn;
  const publishWash = useContext(MobileMangaDetailWashContext);
  const topHeader = useContext(MobileMangaDetailTopHeaderContext);
  const top = topHeader !== null && !pane && !inColumn;
  const [infoSheetOpen, setInfoSheetOpen] = useState(false);
  const remoteCover = isRemote(coverSource) ? coverSource : null;
  const tint = useMobileCoverTint(remoteCover);
  const regionTints = useMobileCoverRegionTints(pane || deferBody ? null : remoteCover);
  const palette = buildMobileCoverTintPalette(tint, scheme);
  // Secondary text holds AA over every pool of the living page.
  const meshOn = !pane && !deferBody && !placeholder;
  const inkSecondary = meshOn
    ? buildMobileCoverMeshInkSecondary(tint, buildMobileCoverMeshColors(tint, regionTints, scheme), scheme)
    : palette.inkSecondary;
  // The two-column page paints the cover's colour behind both columns.
  useLayoutEffect(() => {
    if (!inColumn || !publishWash) return undefined;
    publishWash({ tint, regions: regionTints, mesh: meshOn });
    return () => publishWash(null);
  }, [inColumn, meshOn, publishWash, regionTints, tint]);
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
    measuredWidth ??
    (inColumn && detailPane.columnContentWidth !== undefined
      ? detailPane.columnContentWidth
      : Math.max(0, pane ? windowWidth * 0.4 : windowWidth - gutters.left - gutters.right));
  const contentWidth = Math.max(0, pane ? frameWidth - PANE_PADDING * 2 : frameWidth);
  const shortPane = pane && isMobileCompactHeight(windowHeight);
  const topCoverWidth = Math.round(Math.min(230, Math.max(150, contentWidth * 0.24)));
  const topTextWidth = contentWidth - topCoverWidth - 28;
  // The facts sit side by side when every cell's natural width fits the row,
  // else 2 x 2 (measured below); this guess stands in until then and sizes
  // the cover. (The wide page's hero column shows them as one meta line.)
  const factsGuess = guessMobileDetailFactsLayout({
    width: top ? topTextWidth : contentWidth,
    fontScale: PixelRatio.getFontScale(),
  });
  const paneFactColumns = factsGuess === "grid" ? 2 : 4;
  /** The facts and genres wrap in their column rather than run to the window edges. */
  const grid = pane || top || inColumn;
  const rest = useMobileExploreRestingFrame();
  const rootRef = useRef<ViewInstance>(null);
  const { top: restTop, onLayout: onRestLayout } = useMobileExploreRestingTop(rootRef, rest.windowKey);
  const naturalCoverWidth = getMobileBooksHeroCoverWidth(contentWidth);
  const hasActions = placeholder || Boolean(primaryAction || secondaryActions.length);
  // While the details load, the cover is sized for the page most titles land
  // as (a synopsis and every fact), so it does not resize when they arrive.
  const sizing = placeholder || pending;
  const sizedFacts = sizing ? 4 : infoRowCount(infoTitle, infoChapters, infoLatest, status);
  const sizedSynopsis = sizing || Boolean(description);
  // The hero column's blocks under the cover, estimated (the same at loading
  // and loaded, and whether or not the synopsis is open).
  const columnTop = detailPane.columnTop ?? rest.topEstimate;
  // The facts sit in the head as one meta line under the authors.
  const columnFactsEstimate = (scale: number) => (sizedFacts < 2 ? 0 : 4 + 18 * scale);
  const columnBlocks = (synopsisLines: number) => {
    const scale = rest.fontScale(HERO_TEXT_MAX_SCALE);
    return (
      ESTIMATE.headText * scale +
      (hasActions ? BLOCK_GAP + ESTIMATE.actions * scale : 0) +
      columnFactsEstimate(scale) +
      (sizedSynopsis ? BLOCK_GAP + synopsisLines * DESCRIPTION_LINE_HEIGHT * scale : 0) +
      (badges.length ? BLOCK_GAP + CHIP_HEIGHT * scale : 0)
    );
  };
  // Resting content clears the tab bar (mobileExploreRestingFit). The
  // cover's size is the zoom's landing spot, so it comes from the window
  // alone, never from a later measurement: on a short window it gives up
  // height until the actions, the facts and two synopsis lines rest above the
  // tab bar.
  const coverWidth = (() => {
    if (top) return topCoverWidth;
    if (pane) {
      // A short window (a phone in landscape): the cover above the title
      // leaves no room for the actions above the tab bar, so the
      // pane takes the small-cover head (cover beside the title), its cover
      // as tall as that head leaves room for with the actions under it.
      if (!shortPane) return naturalCoverWidth;
      const scale = rest.fontScale(HERO_TEXT_MAX_SCALE);
      // The facts rest above the tab bar too.
      const factsRoom = sizedFacts >= 2 ? BLOCK_GAP + ESTIMATE.facts * scale * (paneFactColumns === 2 ? 2 : 1) + (paneFactColumns === 2 ? 8 : 0) : 0;
      const room =
        rest.edge -
        (rest.topEstimate + PANE_TOP_BELOW_REST) -
        BLOCK_GAP -
        ESTIMATE.actions * scale -
        factsRoom -
        PANE_PADDING;
      return Math.max(PANE_COVER_MIN_WIDTH, Math.min(HERO_COMPACT_COVER_BELOW - 1, Math.floor(room / 1.5)));
    }
    if (naturalCoverWidth <= (inColumn ? COLUMN_COVER_MIN_WIDTH : COVER_MIN_WIDTH)) return naturalCoverWidth;
    const scale = rest.fontScale(HERO_TEXT_MAX_SCALE);
    if (inColumn) {
      // The wide page's hero column holds still, as a whole: the cover takes
      // what is left once the title, actions, facts, a paragraph of synopsis
      // and the row of genres rest above the window's bottom.
      const room = rest.edge - MOBILE_RESTING.margin - columnTop - HEAD_PADDING_TOP - columnBlocks(COLUMN_PARAGRAPH_LINES);
      return Math.max(COLUMN_COVER_MIN_WIDTH, Math.min(naturalCoverWidth, Math.floor(room / 1.5)));
    }
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
    blocks.push({
      key: "facts",
      gap: BLOCK_GAP,
      height: (factsGuess === "grid" ? ESTIMATE.facts * 2 + 8 : ESTIMATE.facts) * scale,
      rests: "whole",
    });
    if (sizedSynopsis) {
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
  const compactHead = top || (!inColumn && shownCoverWidth < HERO_COMPACT_COVER_BELOW);
  const wide = !pane && !top && !inColumn && contentWidth > WIDE_COLUMN;
  // Align the cover with the chapter pane instead of centering a short
  // summary vertically in a tall portrait column.
  const columnOffset = 0;
  // The first title line ends this far below the hero's top.
  const titleBottom =
    columnOffset +
    (compactHead ? Math.round(shownCoverWidth * 1.5) + 8 : Math.round(shownCoverWidth * 1.5) + TITLE_BELOW_COVER);
  useEffect(() => {
    if (!top) onTitleBottom?.(titleBottom);
  }, [onTitleBottom, titleBottom, top]);
  const onTopTitleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { y, height } = event.nativeEvent.layout;
      onTitleBottom?.(Math.round(y + height) + 8);
    },
    [onTitleBottom],
  );
  const column = pane || top ? null : styles.wideColumn;
  const statusKey = status != null ? MANGA_STATUS_LABEL[status] : undefined;
  const tagList = tags ?? [];
  // Genres live in the 作品信息 sheet, not on the page.
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
  /** The facts stand as their own block; the hero column puts them in the head as one line. */
  const factsBlock = factsRow && !inColumn;
  const columnMeta = inColumn && factsRow;
  // Everything the hero leaves out, in the 作品信息 sheet the ⓘ beside the facts opens.
  const infoRows = buildMobileDetailInfoRows(
    {
      status: statusLabel,
      latest: infoLatest,
      source: infoTitle,
      languages: infoLanguages,
      authors,
      license: infoLicense,
      tags: tagList,
      added: infoAdded,
      lastRead: infoLastRead,
    },
    strings,
  );
  const hasInfo = infoRows.length > 0;
  const openInfo = useCallback(() => setInfoSheetOpen(true), []);
  const infoButton = hasInfo ? (
    <HeroInfoButton
      ink={inkSecondary}
      label={strings.designExplore.infoSheetTitle}
      hint={strings.designExplore.infoButtonHint}
      onPress={openInfo}
    />
  ) : null;
  // The hero column's meta line: the longest of these that stays on one line
  // at its width and text size (each measured, never seen), ending with the
  // first genre only when the whole line fits.
  const metaGenre = infoRows.find((row) => row.key === "genre")?.chips?.[0] ?? null;
  const metaCandidates = columnMeta
    ? buildMobileDetailMetaCandidates(
        {
          status: statusLabel,
          completed: statusKey === "statusCompleted",
          latest: infoLatest,
          latestNumber: infoLatestNumber,
          chapters: infoChapters,
          genre: metaGenre,
        },
        strings,
      )
    : [];
  // The line's room is the column's, less the title block's padding (the
  // block itself is only as wide as its widest line, centred in the head).
  const [metaLineCounts, setMetaLineCounts] = useState<Record<string, number>>({});
  const metaTextWidth = Math.max(0, Math.floor(contentWidth - TITLE_BLOCK_PADDING * 2 - (infoButton ? INFO_ROOM : 0)));
  const metaKey = (candidate: string) => `${metaTextWidth}:${candidate}`;
  const metaLine = pickMobileDetailMetaLine(
    metaCandidates,
    metaCandidates.map((candidate) => metaLineCounts[metaKey(candidate)]),
    { hasGenre: Boolean(metaGenre) },
  );
  // The sheet has the licence: the synopsis on the page leaves out the line that restates it.
  const pageDescription = description && infoLicense ? withoutMobileDescriptionLicence(description) : description;
  // Each fact cell's natural width (label or value, whichever is wider),
  // measured off screen, against the row's own width less the ⓘ.
  const [factCellWidths, setFactCellWidths] = useState<Record<string, number>>({});
  const [factsBlockWidth, setFactsBlockWidth] = useState<number | null>(null);
  const factCellKey = (fact: { label: string; value: string }) => `${fact.label}\u0000${fact.value}`;
  const factsLayout = fitMobileDetailFacts({
    cellWidths: facts.map((fact) => factCellWidths[factCellKey(fact)]),
    available: factsBlockWidth === null ? null : factsBlockWidth - (infoButton ? FACTS_INFO_ROOM : 0),
    guess: factsGuess,
  });
  const primaryUnavailable = Boolean(primaryAction && (primaryAction.disabled || !primaryAction.available));
  const primaryInk = primaryUnavailable ? inkSecondary : palette.primaryInk;
  // Library entries expose collection management here; both entry paths use
  // the same saved-state control and geometry.
  const libraryAction = secondaryActions.find((action) => action.key === "library" || action.key === "collections");
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
  // Beside the round tick, Continue keeps the width it has beside Add to
  // Library: half the row less half the gap, in points from the row's own
  // measured width (a % basis doesn't resolve here and collapsed it).
  const [actionsRowWidth, setActionsRowWidth] = useState<number | null>(null);
  const onActionsRowLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    setActionsRowWidth((current) => (current === next ? current : next));
  }, []);
  const halfActionWidth = actionsRowWidth ? Math.floor((actionsRowWidth - ACTION_GAP) / 2) : null;
  const onFactsHeight = useMemo(() => measureBlock("facts"), [measureBlock]);
  const onFactsLayout = useCallback(
    (event: LayoutChangeEvent) => {
      onFactsHeight(event);
      const next = Math.round(event.nativeEvent.layout.width);
      setFactsBlockWidth((current) => (current === next ? current : next));
    },
    [onFactsHeight],
  );
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
  // Only the badges ("Updated") stay on the page as chips; the genres are in the info sheet.
  const hasTags = badges.length > 0;
  const restingFit = (() => {
    if (pane || top || inColumn || deferBody || restTop === null) return null;
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
  // The hero column: the synopsis fills what the column has left under the
  // blocks above it and the genre row (more for the rest), from the column's
  // top and its blocks' sizes (estimated until measured).
  const columnSynopsisLines = (() => {
    if (!inColumn || !synopsisMeasure) return null;
    const scale = rest.fontScale(HERO_TEXT_MAX_SCALE);
    const height = (key: string, estimate: number) => blockHeights[key] ?? estimate;
    const used =
      height("head", Math.round(coverWidth * 1.5) + ESTIMATE.headText * scale) +
      (hasActions ? BLOCK_GAP + height("actions", ESTIMATE.actions * scale) : 0) +
      (factsBlock ? BLOCK_GAP + height("facts", columnFactsEstimate(scale) - BLOCK_GAP) : 0) +
      (hasTags ? BLOCK_GAP + height("tags", CHIP_HEIGHT * scale) : 0) +
      BLOCK_GAP;
    // The column's own top, not a measurement: the first layout happens
    // before UIKit applies the bar inset, so a measured top is off by it.
    const room = rest.edge - MOBILE_RESTING.margin - columnTop - columnOffset - used;
    return Math.max(DESCRIPTION_MIN_LINES, Math.min(COLUMN_PARAGRAPH_LINES, Math.floor(room / synopsisMeasure.lineHeight)));
  })();
  const synopsisLines =
    columnSynopsisLines ??
    (restingFit && synopsisMeasure && restingFit.heights.synopsis !== undefined
      ? Math.max(DESCRIPTION_MIN_LINES, Math.round(restingFit.heights.synopsis / synopsisMeasure.lineHeight))
      : synopsisNatural);
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
    <ConcentricView minimumRadius={COVER_RADIUS}
      style={[
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
        ) : placeholder ? null : (
          <MobileExploreCoverPlaceholder title={title} width={shownCoverWidth} />
        )}
      </View>
    </ConcentricView>
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
  // The badges ("Updated") close the page's content; the genres are in the
  // 作品信息 sheet. The two-column pane centres them under the synopsis.
  const tagChips = badges.map((badge) => (
    <ExploreGlassChip key={badge.key} label={badge.label} ink={palette.ink} selected={badge.tone === "primary"} />
  ));
  // The hero column's genre rail runs to the column's edges (not under a
  // vertical bar on the leading edge) and dissolves there, like the phone's.
  const columnBleedLeft = verticalBarSide === "left" ? 0 : gutters.left;
  const columnBleed = {
    frame: { marginLeft: -columnBleedLeft, marginRight: -spacing.pageX },
    content: { paddingLeft: columnBleedLeft || spacing.pageX / 2, paddingRight: spacing.pageX },
  };
  const tagsNode =
    badges.length ? (
      inColumn ? (
        // One row, scrolling sideways: never a lone chip on a second line.
        <ExploreRailFade style={columnBleed.frame}>
          <ScrollView
            horizontal
            scrollsToTop={false}
            showsHorizontalScrollIndicator={false}
            onLayout={onTagsLayout}
            contentContainerStyle={[columnBleed.content, styles.tags]}
          >
            {tagChips}
          </ScrollView>
        </ExploreRailFade>
      ) : grid ? (
        // The two-column pane has the width to wrap them, centred, instead of a
        // strip whose last chip a hard edge cut in half.
        <View onLayout={onTagsLayout} style={[styles.tagsWrap, pushStyle("tags")]}>
          {tagChips}
        </View>
      ) : (
        // A phone's strip runs to the screen edges and dissolves there.
        <ExploreRailFade style={bleed.frame}>
          <ScrollView
            horizontal
            // Not a status-bar target: iOS scrolls to the top only when exactly one scroll view on screen asks to.
            scrollsToTop={false}
            showsHorizontalScrollIndicator={false}
            style={pushStyle("tags")}
            onLayout={onTagsLayout}
            contentContainerStyle={[bleed.content, styles.tags, wide ? styles.tagsCentred : null]}
          >
            {tagChips}
          </ScrollView>
        </ExploreRailFade>
      )
    ) : null;

  const titleBlockNode = (
        <View style={[compactHead ? styles.titleBlockCompact : styles.titleBlock, top ? { flex: 0 } : null]} onLayout={top ? onTopTitleLayout : undefined}>
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
          {!factsRow && (statusLabel || infoButton) ? (
            <View style={[styles.metaRow, compactHead ? styles.metaRowLeading : null]}>
              {statusLabel ? (
                <NemuText
                  maxFontSizeMultiplier={HERO_TEXT_MAX_SCALE}
                  numberOfLines={1}
                  color={inkSecondary}
                  style={[styles.meta, styles.metaShrink, compactHead ? styles.leading : null]}
                >
                  {statusLabel}
                </NemuText>
              ) : null}
              {infoButton}
            </View>
          ) : null}
          {columnMeta && metaLine ? (
            // One quiet line; the source is in the chapter header.
            <View style={styles.metaLineRow}>
              {metaTextWidth > 0
                ? metaCandidates.map((candidate) => (
                    <NemuText
                      key={candidate}
                      accessibilityElementsHidden
                      importantForAccessibility="no-hide-descendants"
                      pointerEvents="none"
                      maxFontSizeMultiplier={HERO_TEXT_MAX_SCALE}
                      onTextLayout={(event) => {
                        const lines = event.nativeEvent.lines.length;
                        const key = metaKey(candidate);
                        setMetaLineCounts((current) => (current[key] === lines ? current : { ...current, [key]: lines }));
                      }}
                      style={[styles.metaLine, styles.metaMeasure, { width: metaTextWidth }]}
                    >
                      {candidate}
                    </NemuText>
                  ))
                : null}
              <View style={styles.metaRow}>
                <NemuText maxFontSizeMultiplier={HERO_TEXT_MAX_SCALE} numberOfLines={1} color={inkSecondary} style={[styles.metaLine, styles.metaShrink]}>
                  {metaLine}
                </NemuText>
                {infoButton}
              </View>
            </View>
          ) : null}
        </View>
  );
  const actionsNode = (
    <>
      {primaryAction || secondaryActions.length ? (
        <View style={[styles.actionsBlock, column, inColumn ? styles.columnActions : null, pushStyle("actions")]} onLayout={onActionsLayout}>
          <View style={[styles.actions, libraryAction && !top ? styles.actionsCentred : null]} onLayout={onActionsRowLayout}>
            {primaryAction ? (
              <View
                // Keep separate views for the measured and flexible layouts
                // so a posture change cannot retain the previous flex sizing.
                key={libraryAction && !top ? "half" : "flex"}
                style={
                  top
                    ? styles.topPrimaryButton
                    : libraryAction && halfActionWidth && actionsRowWidth
                      ? // Half the row, or wider when its label needs it
                        // ("Start reading" on an SE), never cut while the
                        // row has room beside the round buttons.
                        {
                          minWidth: halfActionWidth,
                          maxWidth: actionsRowWidth - (1 + iconActions.length) * (ACTION_HEIGHT + ACTION_GAP),
                          flexShrink: 1,
                        }
                      : styles.flexButton
                }
              >
              <ExploreGlassButton
                prominent
                // The cover's own colour at strength, on the page's lighter
                // (light mode) or deeper (dark mode) shade of it; never so
                // pale or grey that it reads as disabled (`palette.primary`).
                tint={palette.primary}
                ink={primaryInk}
                label={primaryAction.label}
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
              />
              </View>
            ) : null}
            {libraryAction ? (
              <LibraryPop
                burstKey={libraryBurst}
                colors={confettiColors}
                style={styles.compactButton}
              >
                <ExploreGlassIconButton
                  icon={libraryAdded ? "checkmark" : "add"}
                  iconNode={<ExploreLibraryGlyph added={libraryAdded} color={palette.ink} />}
                  size={ACTION_HEIGHT}
                  accessibilityLabel={libraryAdded && libraryAction.key === "library" ? strings.designExplore.inLibrary : libraryAction.accessibilityLabel}
                  accessibilityHint={libraryAction.accessibilityHint}
                  busy={libraryAction.busy}
                  disabled={libraryAction.disabled}
                  ink={palette.ink}
                  onPress={libraryAction.onPress}
                />
              </LibraryPop>
            ) : null}
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
          </View>
        </View>
      ) : null}
    </>
  );
  const factCells = facts.map((fact, index) => {
    const gridded = factsLayout === "grid";
    return (
      <View
        key={fact.label}
        accessible
        accessibilityLabel={`${fact.label}, ${fact.value}`}
        style={[
          styles.fact,
          gridded ? styles.factHalf : styles.factFit,
          (gridded ? index % 2 > 0 : index > 0) ? [styles.factDivided, { borderLeftColor: palette.rule }] : null,
        ]}
      >
        <NemuText numberOfLines={1} maxFontSizeMultiplier={HERO_TEXT_MAX_SCALE} color={inkSecondary} style={styles.factLabel}>
          {fact.label}
        </NemuText>
        {gridded ? (
          // Half the row: a long value shrinks a little rather than wrap mid-word.
          <NemuText
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={FACT_VALUE_MIN_SCALE}
            maxFontSizeMultiplier={HERO_TEXT_MAX_SCALE}
            color={palette.ink}
            style={[styles.factValue, styles.factValueCentred]}
          >
            {fact.value}
          </NemuText>
        ) : (
          // Turns over when the value changes (another source picked, a refresh).
          <MobileOdometerText
            value={fact.value}
            maxFontSizeMultiplier={HERO_TEXT_MAX_SCALE}
            color={palette.ink}
            style={styles.factValue}
          />
        )}
      </View>
    );
  });
  const factsMeasure = (
    // Unclamped twins, never seen: each cell's natural width.
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.factsMeasure}>
      {facts.map((fact, index) => (
        <View
          key={fact.label}
          onLayout={(event) => {
            const key = factCellKey(fact);
            // A point of slack for the odometer's digit boxes.
            const next = Math.ceil(event.nativeEvent.layout.width) + 1;
            setFactCellWidths((current) => (current[key] === next ? current : { ...current, [key]: next }));
          }}
          style={[styles.fact, styles.factMeasureCell, index > 0 ? styles.factDivided : null]}
        >
          <NemuText numberOfLines={1} maxFontSizeMultiplier={HERO_TEXT_MAX_SCALE} style={styles.factLabel}>
            {fact.label}
          </NemuText>
          <NemuText numberOfLines={1} maxFontSizeMultiplier={HERO_TEXT_MAX_SCALE} style={styles.factValue}>
            {fact.value}
          </NemuText>
        </View>
      ))}
    </View>
  );
  const factsNode =
    factsRow && !inColumn ? (
      // Inside the content area on every width (it never scrolls sideways,
      // so nothing is clipped at the window edge); centred on a wide window.
      <View style={[styles.factsWithInfo, wide ? column : null, pushStyle("facts")]} onLayout={onFactsLayout}>
        {factsMeasure}
        <View style={[styles.facts, styles.factsFill, factsLayout === "grid" ? styles.factsGrid : null]}>{factCells}</View>
        {infoButton}
      </View>
    ) : null;
  const synopsisNode = (
    <>
      {description ? (
        <HeroDescription
          key={description}
          style={[column, pushStyle("synopsis")]}
          value={pageDescription || description}
          sheetValue={description}
          lines={synopsisLines}
          onMeasure={onSynopsisMeasure}
          ink={inkSecondary}
          moreInk={palette.ink}
          strings={strings}
        />
      ) : null}
    </>
  );

  // Loading: each block keeps its loaded box (line heights, button and chip
  // sizes, the facts' columns) with a quiet bar where its text will be.
  const bar = (width: `${number}%` | number, height: number, extra?: StyleProp<ViewStyle>) => (
    <Animated.View style={[styles.placeholderBar, { width, height, backgroundColor: palette.actionSoft }, pulseStyle, extra]} />
  );
  const placeholderTitleNode = (
    // Stretched: the centred head would shrink it to its (percent-wide) bars, i.e. to nothing.
    <View style={[compactHead ? styles.titleBlockCompact : [styles.titleBlock, styles.placeholderTitle], top ? { flex: 0 } : null]} onLayout={top ? onTopTitleLayout : undefined}>
      <View style={[styles.placeholderLine, { height: compactHead ? styles.titleCompact.lineHeight : styles.title.lineHeight }, compactHead ? null : styles.placeholderLineCentred]}>
        {bar("72%", 22)}
      </View>
      <View style={[styles.placeholderLine, { height: styles.authors.lineHeight }, compactHead ? null : styles.placeholderLineCentred]}>
        {bar("42%", 13)}
      </View>
      {inColumn ? (
        <View style={[styles.placeholderLine, styles.placeholderLineCentred, { height: styles.metaLine.lineHeight, marginTop: 4 }]}>{bar("60%", 11)}</View>
      ) : null}
    </View>
  );
  const placeholderActionsNode = (
    <View style={[styles.actionsBlock, column, inColumn ? styles.columnActions : null]}>
      <View style={[styles.actions, !top ? styles.actionsCentred : null]} onLayout={onActionsRowLayout}>
        {!top ? (
          <View style={halfActionWidth ? { width: halfActionWidth } : styles.flexButton}>{bar("100%", ACTION_HEIGHT, styles.placeholderCapsule)}</View>
        ) : (
          bar("100%", ACTION_HEIGHT, [top ? styles.topPrimaryButton : styles.flexButton, styles.placeholderCapsule])
        )}
        {bar(ACTION_HEIGHT, ACTION_HEIGHT, styles.placeholderCapsule)}
      </View>
    </View>
  );
  const placeholderFacts = [0, 1, 2, 3].map((index) => (
    <View
      key={index}
      style={[
        styles.fact,
        { width: `${100 / paneFactColumns}%`, flexGrow: 0, minWidth: 0 },
        index % paneFactColumns > 0 ? [styles.factDivided, { borderLeftColor: palette.rule }] : null,
      ]}
    >
      <View style={[styles.placeholderLine, styles.placeholderLineCentred, { height: styles.factLabel.lineHeight }]}>{bar("46%", 9)}</View>
      <View style={[styles.placeholderLine, styles.placeholderLineCentred, { height: styles.factValue.lineHeight }]}>{bar("64%", 13)}</View>
    </View>
  ));
  const placeholderFactsNode = inColumn ? null : (
    <View style={[styles.facts, styles.factsGrid, top ? { flexGrow: 0 } : null, wide ? column : null]}>{placeholderFacts}</View>
  );
  const placeholderSynopsisNode = (
    <View style={column}>
      {(["100%", "100%", "68%"] as const).map((width, index) => (
        <View key={index} style={[styles.placeholderLine, { height: DESCRIPTION_LINE_HEIGHT }]}>
          {bar(width, 13)}
        </View>
      ))}
    </View>
  );
  // Prototype top header: the badges close the list, after the last chapter.
  const footerKey = `${scheme}:${palette.ink}:${badges.map((badge) => badge.label).join("|")}`;
  useEffect(() => {
    topHeader?.setFooter(top ? tagsNode : null);
    return () => topHeader?.setFooter(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [footerKey, top]);

  return (
    <View
      ref={rootRef}
      onLayout={(event) => {
        onRootLayout(event);
        onRestLayout();
      }}
      style={[
        styles.root,
        !pane && !inColumn ? { paddingBottom: TINT_FADE + 8 } : null,
        columnOffset ? { paddingTop: columnOffset } : null,
        pane ? [styles.paneRoot, shortPane ? styles.paneRootShort : null, { backgroundColor: palette.page }] : null,
        // While the body is held back the hero still fills the screen, so the
        // page that zooms in is the cover's colour from top to bottom rather
        // than a tinted block that ends under the title.
        deferBody && !pane && !inColumn ? { minHeight: windowHeight } : null,
      ]}
    >
      {pane || inColumn ? null : (
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
          {deferBody || placeholder ? null : (
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

      {top ? (
        <View style={styles.topRow} onLayout={onHeadLayout}>
          {cover}
          <View style={styles.topColumn}>
            {placeholder ? placeholderTitleNode : titleBlockNode}
            {deferBody ? null : placeholder ? (
              <>
                {placeholderFactsNode}
                {placeholderSynopsisNode}
                {placeholderActionsNode}
              </>
            ) : (
              <>
                {factsNode}
                {synopsisNode}
                {actionsNode}
              </>
            )}
          </View>
        </View>
      ) : (
      <View style={[styles.head, compactHead ? [styles.headCompact, column] : null]} onLayout={onHeadLayout}>
        {cover}
        {placeholder ? placeholderTitleNode : titleBlockNode}
      </View>
      )}

      {deferBody || top ? null : placeholder ? (
        <>
          {placeholderActionsNode}
          {placeholderFactsNode}
          {placeholderSynopsisNode}
        </>
      ) : null}

      {deferBody || placeholder ? null : (
        <>
      {top ? null : actionsNode}

      {top ? null : factsNode}

      {top ? null : synopsisNode}

      {top ? null : tagsNode}

      {hasInfo ? (
        <MobileMangaDetailInfoSheet
          visible={infoSheetOpen}
          rows={infoRows}
          strings={strings}
          onClose={() => setInfoSheetOpen(false)}
        />
      ) : null}
        </>
      )}
    </View>
  );
}

/** The ⓘ beside the hero's facts: opens the 作品信息 sheet. */
function HeroInfoButton({
  ink,
  label,
  hint,
  onPress,
}: {
  ink: string;
  label: string;
  hint: string;
  onPress: () => void;
}) {
  return (
    <NemuPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      hitSlop={12}
      pressedScale={0.88}
      onPress={onPress}
      style={styles.infoButton}
    >
      <Ionicons name="information-circle-outline" size={INFO_GLYPH} color={ink} />
    </NemuPressable>
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
 * trailing "more" that fades in over the last line; tapping it opens the
 * whole description in a sheet, so the page never moves under it.
 */
function HeroDescription({
  value,
  ink,
  moreInk,
  strings,
  style,
  lines,
  onMeasure,
  sheetValue,
}: {
  style?: StyleProp<ViewStyle>;
  value: string;
  /** The sheet's text when it differs from the page's (the page leaves a line out). */
  sheetValue?: string;
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
  const [sheetOpen, setSheetOpen] = useState(false);
  const collapsible = lineCount !== null && lineCount > lines;
  const text = (
    <NemuText
      // Until measured, hold the collapsed height so a long synopsis never
      // flashes open.
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
          accessibilityHint={strings.designExplore.descriptionMoreHint}
          hapticFeedback="press"
          pressedScale={1}
          onPress={() => setSheetOpen(true)}
        >
          {/* The last line's trailing end fades out through a mask on the
              text itself, so whatever is behind it (the drifting living
              page) shows through; a painted fade was one solid colour and
              read as a dark block over the moving pools. */}
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
          <View pointerEvents="none" style={styles.more}>
            <NemuText
              color={moreInk}
              style={styles.moreText}
              onLayout={(event) => setMoreWidth(Math.ceil(event.nativeEvent.layout.width))}
            >
              {strings.designExplore.descriptionMore}
            </NemuText>
          </View>
        </NemuPressable>
      ) : (
        text
      )}
      {collapsible ? (
        <MobileMangaDetailDescriptionSheet
          visible={sheetOpen}
          description={sheetValue ?? value}
          strings={strings}
          onClose={() => setSheetOpen(false)}
        />
      ) : null}
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
    bottom: TINT_FADE,
  },
  mesh: {
    position: "absolute",
    top: -MESH_OVERSCAN,
    bottom: TINT_FADE,
  },
  tintFade: {
    position: "absolute",
    bottom: 0,
    height: TINT_FADE,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 28,
    paddingTop: 8,
  },
  topColumn: {
    flex: 1,
    minWidth: 0,
    gap: 16,
  },
  head: {
    alignItems: "center",
    paddingTop: HEAD_PADDING_TOP,
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
  coverClip: {
    flex: 1,
    overflow: "hidden",
  },
  coverImage: {
    width: "100%",
    height: "100%",
  },
  titleBlock: {
    alignItems: "center",
    gap: 4,
    paddingHorizontal: TITLE_BLOCK_PADDING,
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
  // The wide page's hero column: the action row keeps the Duo's measure,
  // centred, rather than stretching across a tablet's wider column.
  columnActions: {
    maxWidth: COLUMN_ACTIONS_MAX_WIDTH,
  },
  facts: {
    flexDirection: "row",
    flexGrow: 1,
  },
  factsWithInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  factsFill: {
    flex: 1,
    minWidth: 0,
  },
  factsGrid: {
    flexWrap: "wrap",
    justifyContent: "center",
    rowGap: 8,
  },
  factFit: {
    flexGrow: 1,
    flexShrink: 0,
    flexBasis: "auto",
  },
  factHalf: {
    width: "50%",
    flexGrow: 0,
    minWidth: 0,
  },
  factValueCentred: {
    alignSelf: "stretch",
    textAlign: "center",
  },
  // Off screen and unseen; wide enough that no cell is squeezed.
  factsMeasure: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 2000,
    flexDirection: "row",
    alignItems: "flex-start",
    opacity: 0,
  },
  factMeasureCell: {
    flexGrow: 0,
    flexShrink: 0,
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
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    maxWidth: "100%",
  },
  metaRowLeading: {
    justifyContent: "flex-start",
  },
  metaShrink: {
    flexShrink: 1,
  },
  infoButton: {
    width: INFO_GLYPH + 4,
    height: INFO_GLYPH + 4,
    alignItems: "center",
    justifyContent: "center",
  },
  metaLineRow: {
    marginTop: 4,
  },
  // Off screen and unseen: a candidate meta line, laid out to count its lines.
  metaMeasure: {
    position: "absolute",
    left: 0,
    top: 0,
    opacity: 0,
  },
  metaLine: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: nemuFontWeight.medium,
    textAlign: "center",
  },
  factValue: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: nemuFontWeight.semibold,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: ACTION_GAP,
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
  // The wide header: the capsule keeps a phone-portrait width instead of
  // stretching across the text column, the library button right beside it.
  actionsCentred: {
    justifyContent: "center",
  },
  topPrimaryButton: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    maxWidth: TOP_PRIMARY_MAX_WIDTH,
  },
  primaryIcon: {
    width: PRIMARY_GLYPH,
    height: PRIMARY_GLYPH,
    borderRadius: R.thumb,
  },
  tags: {
    gap: 8,
  },
  tagsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
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
  placeholderBar: {
    borderRadius: 6,
    borderCurve: "continuous",
  },
  placeholderCapsule: {
    borderRadius: radius.pill,
  },
  // One line box of the text it stands in for, its bar centred on the line.
  placeholderLine: {
    alignSelf: "stretch",
    justifyContent: "center",
  },
  placeholderLineCentred: {
    alignItems: "center",
  },
  placeholderTitle: {
    alignSelf: "stretch",
  },
});

function sameMobileExploreCoverRequest(
  a: { uri: string; headers?: Record<string, string> },
  b: { uri: string; headers?: Record<string, string> },
): boolean {
  return a.uri === b.uri && JSON.stringify(a.headers ?? {}) === JSON.stringify(b.headers ?? {});
}
