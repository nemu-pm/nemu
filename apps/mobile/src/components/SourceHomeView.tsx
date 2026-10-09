import type { ScrollViewInstance, ViewInstance } from "react-native";
import { ExploreCoverImage } from "@/components/explore/ExploreCoverImage";
import { ExploreGradient } from "@/components/explore/ExploreGradient";
import { EXPLORE_HOME_GROUP_MAX_WIDTH, ExploreHomeGroup, ExploreRailFade } from "@/components/explore/ExploreSourceHome";
import { MOBILE_EXPLORE_RADIUS as R, concentricMobileExploreRadius } from "@/lib/mobileExploreRadius";
import { ExploreShimmerSweep } from "@/components/explore/ExploreShimmerSweep";
import { useExploreShimmerBackdrop } from "@/components/explore/useExploreShimmerBackdrop";
import { mobileDesignExploreFlag } from "@/lib/mobileDesignExplore";
import {
  Children,
  createContext,
  isValidElement,
  memo,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  FlatList,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ImageStyle,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import type {
  FilterValue,
  HomeComponent,
  HomeFilterItem,
  HomeLayout,
  HomeLink,
  Listing,
  MangaWithChapter,
} from "@nemu.pm/aidoku-runtime";
import type { InstalledSource } from "@/data/schema";
import { MobileInlineErrorBanner } from "@/components/MobileInlineErrorBanner";
import {
  MobileChip,
  NemuPressable,
  NemuText,
  MobileCachedImage,
  createNemuShadowStyle,
  nemuColorWithAlpha,
  radius,
  type NemuTokens,
  nemuFontWeight,
  useMobilePageBleedStyles,
  useMobilePageGutters,
  useNemuTheme,
} from "@/design-system";
import { formatChapterTitle } from "@/lib/formatChapter";
import {
  useSkeletonDisplayDelay,
  useSkeletonPulse,
} from "@/lib/useSkeletonPulse";
import { hapticConfirm, hapticError, hapticSelection } from "@/lib/haptics";
import { buildMobileCoverTintPalette, type MobileCoverRgb } from "@/lib/mobileCoverTint";
import { useMobileCoverTint } from "@/lib/useMobileCoverTint";
import { formatMobileString, type MobileStrings } from "@/lib/mobileI18n";
import type { SearchSourceDisplay } from "@/lib/mobileSearch";
import { describeMobileErrorDetail } from "@/lib/mobileSourceErrors";
import { normalizeMobileSourceExternalUrl } from "@/lib/mobileSourceExternalUrl";
import {
  resolveMobileSourceHomeSectionPlaceholder,
  type MobileSourceHomeSectionStatus,
} from "@/lib/mobileSourceHomeSectionState";
import { useMobileSourceImageRequest } from "@/lib/useMobileSourceImageRequest";
import { getMobileSourceHomeImageScrollerCardSize } from "@/lib/mobileSourceHomeImageScroller";
import {
  chunkMobileGridRows,
  mobileFoldAwareGridCellStyle,
  mobileFoldPagerLayout,
  type MobileFoldAwareGridLayout,
} from "@/lib/mobileFoldAwareGrid";
import { useMobileFoldAwareGrid } from "@/lib/useMobileFoldAwareGrid";
import { MobilePoseLayoutView } from "@/components/MobilePoseLayoutView";
import { useMobilePoseResnapFade } from "@/lib/useMobilePoseResnapFade";
import { useMobileContainerFold } from "@/lib/useMobileContainerFold";
import {
  canSelectMobileSourceHomeFeaturedDot,
  getMobileSourceHomeFeaturedCarouselIndex,
  getMobileSourceHomeFeaturedEntries,
  getMobileSourceHomeFilterItems,
  getMobileSourceHomeListSkeletonCount,
} from "@/lib/mobileSourceHomePresentation";
import {
  mapAidokuMangaToLiveSearchManga,
  type MobileLiveSearchManga,
} from "@/sources/mobileSourceSearch";

type SourceHomeViewProps = {
  home: HomeLayout;
  /**
   * Whether the layout above is still being fetched. Without it a section
   * with no entries is indistinguishable from one that is still loading, and
   * both render as skeleton cards forever.
   */
  status: MobileSourceHomeSectionStatus;
  source: SearchSourceDisplay;
  installedSource?: InstalledSource | null;
  importingKey: string | null;
  strings: MobileStrings;
  onPressManga: (
    source: SearchSourceDisplay,
    manga: MobileLiveSearchManga,
  ) => void;
  onListingPress: (listing: Listing) => void;
  onFilterPress: (values: FilterValue[]) => void;
};

type SourceHomeActionError = {
  title: string;
  detail: string;
};

type OpenLinkHandler = (url: string) => void;

type MobileHomeLink = HomeLink & {
  imageHeaders?: Record<string, string>;
};

const SourceHomeInstalledSourceContext = createContext<InstalledSource | null>(
  null,
);

const HOME_SKELETON_SCROLLER_ITEMS = [0, 1, 2, 3, 4, 5] as const;
const HOME_SKELETON_LIST_ITEMS = [0, 1, 2, 3, 4] as const;
const HOME_SKELETON_BANNER_ITEMS = [0, 1, 2, 3] as const;
/** Breathing room inside the page content width (portrait: 402 − 32 − 4). */
const FEATURED_CARD_HORIZONTAL_MARGIN = 4;
/**
 * Rails bleed 2pt past the screen edges (their portrait tuning); the resting
 * first card still lines up with the safe-area-aware page gutter.
 */
const HOME_RAIL_BLEED_OVERSCAN = 2;
const WEB_BANNER_VIGNETTE_COLORS = [
  "rgba(0,0,0,0)",
  "rgba(0,0,0,0)",
  "rgba(0,0,0,0.30)",
] as const;
const WEB_BANNER_VIGNETTE_LOCATIONS = [0, 0.5, 1] as const;

/**
 * Measure the available width: Duo's trailing system bars can make it
 * narrower than the window. Flat: one full-width card per page (web
 * `MangaCardFeatured` parity; no 520pt cap). Book posture: one card per
 * pane, snapping by pane, so a card never rests on the active fold.
 */
function useFeaturedCarouselLayout() {
  const { width: windowWidth } = useWindowDimensions();
  const pageGutters = useMobilePageGutters();
  const container = useMobileContainerFold<ViewInstance>();
  // Fully opening the screen restores full-width pages.
  const split = container.split;
  const foldStart = split?.axis === "horizontal" ? split.gutter.start : null;
  const foldEnd = split?.axis === "horizontal" ? split.gutter.end : null;
  const containerWidth = container.width ?? windowWidth - pageGutters.horizontal;
  const pager = useMemo(
    () =>
      mobileFoldPagerLayout({
        containerWidth,
        margin: FEATURED_CARD_HORIZONTAL_MARGIN,
        fold: foldStart !== null && foldEnd !== null ? { start: foldStart, end: foldEnd } : null,
      }),
    [containerWidth, foldEnd, foldStart],
  );
  return { ...pager, onLayout: container.onLayout, ref: container.ref };
}

/** Rows of a vertical home list: one column on phones, pane-aligned columns on wide windows. */
const HOME_LIST_MIN_COLUMN_WIDTH = 320;
const HOME_LIST_COLUMN_GAP = 16;

function useHomeListGrid() {
  return useMobileFoldAwareGrid({
    minItemWidth: HOME_LIST_MIN_COLUMN_WIDTH,
    gap: HOME_LIST_COLUMN_GAP,
    minColumns: 1,
    maxColumns: 4,
    // The list stack is already inside the page content box.
    insets: { left: 0, right: 0 },
  });
}

function mangaCoverGlassStyle(tokens: NemuTokens) {
  return {
    borderColor: tokens.coverBorder,
    ...createNemuShadowStyle({
      color: tokens.shadow,
      offsetY: 2,
      radius: 12,
      opacity: 0.55,
      elevation: 3,
    }),
  };
}

function homeLinkImageHeaders(link: HomeLink) {
  return (link as MobileHomeLink).imageHeaders;
}

/** The request a source cover is fetched with (the source's headers or its image-request hook's). */
function useHomeCoverSource(uri: string | null, headers: Record<string, string> | undefined) {
  const installedSource = useContext(SourceHomeInstalledSourceContext);
  const requestAlreadyResolved = headers !== undefined;
  const request = useMobileSourceImageRequest(
    requestAlreadyResolved || !uri ? null : installedSource,
    requestAlreadyResolved ? null : uri,
  );
  if (!uri) return null;
  return requestAlreadyResolved
    ? { uri, headers, cache: "force-cache" as const }
    : request
      ? { uri: request.url, headers: request.headers, cache: "force-cache" as const }
      : { uri, headers, cache: "force-cache" as const };
}

function SourceHomeCoverImage({
  headers,
  uri,
  title = "",
  style,
}: {
  headers?: Record<string, string>;
  uri: string | null;
  title?: string;
  style: StyleProp<ImageStyle>;
}) {
  const { tokens } = useNemuTheme();
  const imageSource = useHomeCoverSource(uri, headers);
  // Design-explore: a breathing tile while it loads, the titled book if it fails.
  if (mobileDesignExploreFlag) return <ExploreCoverImage source={imageSource} title={title} />;
  if (!imageSource) return null;
  return (
    <MobileCachedImage
      fallback={
        <View
          style={[
            styles.coverPlaceholder,
            { backgroundColor: tokens.muted },
          ]}
        >
          <Ionicons
            name="image-outline"
            size={18}
            color={tokens.mutedForeground}
          />
        </View>
      }
      uriOwnership="source"
      source={imageSource}
      style={style}
    />
  );
}

function linkToManga(link: HomeLink): MobileLiveSearchManga | null {
  if (link.value?.type !== "manga") return null;
  const mobileLink = link as MobileHomeLink;
  const mangaValue = link.value.manga;
  const sourceManga = mangaValue as typeof mangaValue & {
    coverHeaders?: Record<string, string>;
  };
  const manga = mapAidokuMangaToLiveSearchManga({
    ...mangaValue,
    title: link.title || mangaValue.title,
    cover: link.imageUrl ?? mangaValue.cover,
  });
  return {
    ...manga,
    coverHeaders: mobileLink.imageHeaders ?? sourceManga.coverHeaders,
  };
}

function chapterEntryToManga(entry: MangaWithChapter): MobileLiveSearchManga {
  return mapAidokuMangaToLiveSearchManga(entry.manga);
}

function sourceMangaKey(
  source: SearchSourceDisplay,
  manga: MobileLiveSearchManga,
) {
  return `${source.id}:${manga.id}`;
}

function openMangaAccessibilityLabel(
  title: string,
  strings: MobileStrings,
): string {
  return formatMobileString(strings.sourceBrowse.openManga, { title });
}

function openListingAccessibilityLabel(
  title: string,
  strings: MobileStrings,
): string {
  return formatMobileString(strings.sourceBrowse.openListing, { title });
}

function openLinkAccessibilityLabel(
  title: string,
  strings: MobileStrings,
): string {
  return formatMobileString(strings.sourceBrowse.openLink, { title });
}

function openHomeFilterAccessibilityLabel(
  title: string,
  strings: MobileStrings,
): string {
  return formatMobileString(strings.sourceBrowse.openHomeFilter, { title });
}

function homeLinkAccessibilityLabel(
  link: HomeLink,
  strings: MobileStrings,
): string {
  if (link.value?.type === "listing") {
    return openListingAccessibilityLabel(link.title, strings);
  }
  return openLinkAccessibilityLabel(link.title, strings);
}

function homeLinkHasAction(link: HomeLink): boolean {
  return link.value?.type === "listing" || link.value?.type === "url";
}

function sourceHomeActionErrorMessage(
  error: unknown,
  strings: MobileStrings,
): string {
  return describeMobileErrorDetail(
    error,
    strings.sourceBrowse.openLinkFailedDetail,
  );
}

/** A rail's frame: the bleeding scroller as is, or (new design) with its ends dissolving. */
function RailFrame({ bleedFrame, children }: { bleedFrame: StyleProp<ViewStyle>; children: ReactNode }) {
  if (!mobileDesignExploreFlag) return <>{children}</>;
  return <ExploreRailFade style={bleedFrame}>{children}</ExploreRailFade>;
}

function SectionHeader({
  title,
  subtitle,
  listing,
  strings,
  onListingPress,
}: {
  title?: string;
  subtitle?: string;
  listing?: Listing;
  strings: MobileStrings;
  onListingPress: (listing: Listing) => void;
}) {
  const { tokens } = useNemuTheme();
  if (!title && !subtitle) return null;
  const labelTitle =
    listing?.name ?? title ?? subtitle ?? strings.sourceBrowse.sourceHome;

  const content = (
    <>
      <View style={styles.sectionHeaderText}>
        {title ? (
          <Text
            accessibilityRole="header"
            numberOfLines={1}
            style={[
              styles.sectionTitle,
              mobileDesignExploreFlag ? styles.exploreSectionTitle : null,
              { color: tokens.foreground },
            ]}
          >
            {title}
          </Text>
        ) : null}
        {subtitle ? (
          <Text
            numberOfLines={1}
            style={[styles.sectionSubtitle, { color: tokens.mutedForeground }]}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {listing ? (
        mobileDesignExploreFlag ? (
          // The section is a list of its own: "See All" names where the chevron goes.
          <View style={styles.exploreSeeAll}>
            <Text style={[styles.exploreSeeAllText, { color: tokens.primary }]}>
              {strings.designExplore.seeAll}
            </Text>
            <Ionicons name="chevron-forward" size={14} color={tokens.primary} />
          </View>
        ) : (
          <Ionicons
            name="chevron-forward-outline"
            size={17}
            color={tokens.mutedForeground}
          />
        )
      ) : null}
    </>
  );

  if (listing) {
    return (
      <NemuPressable
        accessibilityRole="button"
        accessibilityLabel={openListingAccessibilityLabel(labelTitle, strings)}
        onPress={() => {
          onListingPress(listing);
        }}
        pressedScale={0.99}
        style={styles.sectionHeader}
      >
        {content}
      </NemuPressable>
    );
  }

  return <View style={styles.sectionHeader}>{content}</View>;
}

const HomeMangaCard = memo(function HomeMangaCard({
  item,
  source,
  importingKey,
  strings,
  onPressManga,
}: {
  item: MobileLiveSearchManga;
  source: SearchSourceDisplay;
  importingKey: string | null;
  strings: MobileStrings;
  onPressManga: (
    source: SearchSourceDisplay,
    manga: MobileLiveSearchManga,
  ) => void;
}) {
  const { tokens } = useNemuTheme();
  const resultKey = sourceMangaKey(source, item);
  const disabled = importingKey === resultKey;
  const subtitle =
    item.authors?.join(", ") ?? item.tags?.slice(0, 2).join(", ");

  return (
    <NemuPressable
      accessibilityRole="button"
      accessibilityLabel={openMangaAccessibilityLabel(item.title, strings)}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => onPressManga(source, item)}
      pressedScale={0.98}
      style={styles.homeMangaCard}
    >
      <View
        style={[
          styles.homeCover,
          {
            backgroundColor: tokens.muted,
            borderColor: tokens.coverBorder,
            ...createNemuShadowStyle({
              color: tokens.shadow,
              offsetY: 3,
              radius: 14,
              elevation: 4,
            }),
          },
        ]}
      >
        {mobileDesignExploreFlag || item.cover ? (
          <SourceHomeCoverImage
            uri={item.cover ?? null}
            title={item.title}
            headers={item.coverHeaders}
            style={styles.coverImage}
          />
        ) : (
          <View
            style={[styles.coverPlaceholder, { backgroundColor: tokens.muted }]}
          >
            <Ionicons
              name="book-outline"
              size={18}
              color={tokens.mutedForeground}
            />
          </View>
        )}
      </View>
      <Text
        numberOfLines={2}
        style={[styles.cardTitle, { color: tokens.foreground }]}
      >
        {item.title}
      </Text>
      {subtitle ? (
        <Text
          numberOfLines={1}
          style={[styles.cardSubtitle, { color: tokens.mutedForeground }]}
        >
          {subtitle}
        </Text>
      ) : null}
    </NemuPressable>
  );
});

function HomeActionCard({
  link,
  strings,
  onListingPress,
  onOpenLink,
}: {
  link: HomeLink;
  strings: MobileStrings;
  onListingPress: (listing: Listing) => void;
  onOpenLink: OpenLinkHandler;
}) {
  const { tokens } = useNemuTheme();
  const disabled = !homeLinkHasAction(link);

  const handlePress = () => {
    if (link.value?.type === "listing") {
      onListingPress(link.value.listing);
      return;
    }
    if (link.value?.type === "url") {
      onOpenLink(link.value.url);
    }
  };

  return (
    <NemuPressable
      accessibilityRole="button"
      accessibilityLabel={homeLinkAccessibilityLabel(link, strings)}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={handlePress}
      pressedScale={0.98}
      style={styles.homeMangaCard}
    >
      <View
        style={[
          styles.homeCover,
          {
            backgroundColor: tokens.muted,
            borderColor: tokens.coverBorder,
            ...createNemuShadowStyle({
              color: tokens.shadow,
              offsetY: 3,
              radius: 14,
              elevation: 4,
            }),
          },
        ]}
      >
        {mobileDesignExploreFlag || link.imageUrl ? (
          <SourceHomeCoverImage
            uri={link.imageUrl ?? null}
            title={link.title}
            headers={homeLinkImageHeaders(link)}
            style={styles.coverImage}
          />
        ) : (
          <View
            style={[styles.coverPlaceholder, { backgroundColor: tokens.muted }]}
          >
            <Ionicons
              name="link-outline"
              size={18}
              color={tokens.mutedForeground}
            />
          </View>
        )}
      </View>
      <Text
        numberOfLines={2}
        style={[styles.cardTitle, { color: tokens.foreground }]}
      >
        {link.title}
      </Text>
      {link.subtitle ? (
        <Text
          numberOfLines={1}
          style={[styles.cardSubtitle, { color: tokens.mutedForeground }]}
        >
          {link.subtitle}
        </Text>
      ) : null}
    </NemuPressable>
  );
}

/**
 * Inline replacement for the skeleton cards once a section has resolved with
 * nothing in it — a region-blocked rail or a legacy listing the runtime could
 * not expand. A skeleton there reads as "still loading" forever.
 */
function HomeSectionEmpty({ strings }: { strings: MobileStrings }) {
  const { tokens } = useNemuTheme();
  return (
    <View
      style={[
        styles.sectionEmpty,
        { backgroundColor: tokens.muted, borderColor: tokens.border },
      ]}
    >
      <Ionicons
        name="file-tray-outline"
        size={15}
        color={tokens.mutedForeground}
      />
      <NemuText
        variant="caption"
        color={tokens.mutedForeground}
        style={styles.sectionEmptyText}
      >
        {strings.sourceBrowse.homeSectionEmpty}
      </NemuText>
    </View>
  );
}

function HomeScrollerSkeletonItems() {
  const { tokens } = useNemuTheme();
  const skeletonColor = tokens.muted;
  const subtleSkeletonColor = tokens.sourceIconGlass;

  return (
    <>
      {HOME_SKELETON_SCROLLER_ITEMS.map((item) => (
        <View key={item} style={styles.homeMangaCard}>
          <View
            style={[
              styles.homeCover,
              {
                backgroundColor: skeletonColor,
                borderColor: tokens.coverBorder,
                ...createNemuShadowStyle({
                  color: tokens.shadow,
                  offsetY: 3,
                  radius: 14,
                  elevation: 4,
                }),
              },
            ]}
          />
          <View
            style={[
              styles.homeSkeletonTextLine,
              { backgroundColor: skeletonColor },
            ]}
          />
          <View
            style={[
              styles.homeSkeletonTextLineShort,
              { backgroundColor: subtleSkeletonColor },
            ]}
          />
        </View>
      ))}
    </>
  );
}

const HorizontalLinkSection = memo(function HorizontalLinkSection({
  component,
  links,
  status,
  source,
  importingKey,
  strings,
  onPressManga,
  onListingPress,
  onOpenLink,
}: {
  component: HomeComponent;
  links: HomeLink[];
  status: MobileSourceHomeSectionStatus;
  source: SearchSourceDisplay;
  importingKey: string | null;
  strings: MobileStrings;
  onPressManga: (
    source: SearchSourceDisplay,
    manga: MobileLiveSearchManga,
  ) => void;
  onListingPress: (listing: Listing) => void;
  onOpenLink: OpenLinkHandler;
}) {
  const bleed = useMobilePageBleedStyles(HOME_RAIL_BLEED_OVERSCAN);
  const placeholder = resolveMobileSourceHomeSectionPlaceholder({
    status,
    itemCount: links.length,
  });

  if (placeholder === "empty") {
    return (
      <View style={styles.homeSection}>
        <SectionHeader
          title={component.title}
          subtitle={component.subtitle}
          listing={
            "listing" in component.value ? component.value.listing : undefined
          }
          strings={strings}
          onListingPress={onListingPress}
        />
        <HomeSectionEmpty strings={strings} />
      </View>
    );
  }

  const showScrollerSkeleton = placeholder === "skeleton";

  return (
    <View style={styles.homeSection}>
      <SectionHeader
        title={component.title}
        subtitle={component.subtitle}
        listing={
          "listing" in component.value ? component.value.listing : undefined
        }
        strings={strings}
        onListingPress={onListingPress}
      />
      <RailFrame bleedFrame={bleed.frame}>
      <FlatList
        horizontal
        scrollsToTop={false}
        data={showScrollerSkeleton ? [] : links}
        keyExtractor={(link, index) => `${link.title}:${index}`}
        ListEmptyComponent={showScrollerSkeleton ? HomeScrollerSkeletonItems : undefined}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        // iOS detaches cells it should not on horizontal lists (rows blank out
        // mid-swipe), so clipping stays Android-only.
        removeClippedSubviews={Platform.OS === "android"}
        renderItem={({ item: link }) => {
          const manga = linkToManga(link);
          return manga ? (
            <HomeMangaCard
              item={manga}
              source={source}
              importingKey={importingKey}
              strings={strings}
              onPressManga={onPressManga}
            />
          ) : (
            <HomeActionCard
              link={link}
              strings={strings}
              onListingPress={onListingPress}
              onOpenLink={onOpenLink}
            />
          );
        }}
        showsHorizontalScrollIndicator={false}
        style={mobileDesignExploreFlag ? undefined : bleed.frame}
        contentContainerStyle={[styles.horizontalContent, bleed.content]}
        windowSize={5}
      />
      </RailFrame>
    </View>
  );
});


/** Peek of the neighbouring cards on each side of the centred one. */
const EXPLORE_FEATURED_PEEK = 28;
const EXPLORE_FEATURED_GAP = 12;
const EXPLORE_FEATURED_MAX_CARD = 560;
const EXPLORE_FEATURED_PAD = 12;

/** A page wash in one cover's colour: this card's while it is the active one, cross-faded. */
function ExploreFeaturedWash({
  colors,
  shown,
}: {
  colors: ReturnType<typeof buildMobileCoverTintPalette>;
  shown: boolean;
}) {
  const opacity = useSharedValue(shown ? 1 : 0);
  useEffect(() => {
    opacity.value = withTiming(shown ? 1 : 0, { duration: 240 });
  }, [opacity, shown]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <ExploreGradient
        colors={[
          [colors.washClear, 0],
          [colors.washSoft, 0.14],
          [colors.wash, 0.3],
          [colors.washSoft, 0.62],
          [colors.washFaint, 0.86],
          [colors.washClear, 1],
        ]}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

/**
 * One featured title as a cover-colour card, like the library's Continue
 * cards: the cover's own colour (solid), its ink on it, concentric corners.
 */
function ExploreFeaturedCard({
  item,
  index,
  width,
  disabled,
  strings,
  onPress,
  onTint,
}: {
  item: MobileLiveSearchManga;
  index: number;
  width: number;
  disabled: boolean;
  strings: MobileStrings;
  onPress: () => void;
  onTint: (index: number, tint: MobileCoverRgb | null) => void;
}) {
  const { scheme } = useNemuTheme();
  const cover = useHomeCoverSource(item.cover ?? null, item.coverHeaders);
  const tint = useMobileCoverTint(cover, `home:${item.id}`);
  const palette = useMemo(() => buildMobileCoverTintPalette(tint, scheme), [scheme, tint]);
  useLayoutEffect(() => {
    onTint(index, tint);
  }, [index, onTint, tint]);
  const coverWidth = Math.min(150, Math.round((width - EXPLORE_FEATURED_PAD * 2) * 0.38));
  const coverHeight = Math.round(coverWidth * 1.5);
  const coverRadius = concentricMobileExploreRadius(R.card, EXPLORE_FEATURED_PAD);
  return (
    <NemuPressable
      accessibilityRole="button"
      accessibilityLabel={openMangaAccessibilityLabel(item.title, strings)}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      pressedScale={0.985}
      style={[
        styles.exploreFeaturedCard,
        {
          width,
          backgroundColor: palette.card,
          borderColor: palette.cardRim,
          ...createNemuShadowStyle({ color: palette.cardGlow, offsetY: 6, radius: 18, opacity: 0.6, elevation: 6 }),
        },
      ]}
    >
      <View
        style={{
          width: coverWidth,
          height: coverHeight,
          overflow: "hidden",
          borderRadius: coverRadius,
          borderCurve: "continuous",
        }}
      >
        <ExploreCoverImage source={cover} title={item.title} />
      </View>
      <View style={[styles.exploreFeaturedText, { maxHeight: coverHeight }]}>
        <Text numberOfLines={2} style={[styles.exploreFeaturedTitle, { color: palette.cardInk }]}>
          {item.title}
        </Text>
        {item.authors?.length ? (
          <Text numberOfLines={1} style={[styles.exploreFeaturedAuthor, { color: palette.cardInkSecondary }]}>
            {item.authors.join(", ")}
          </Text>
        ) : null}
        {item.description ? (
          <Text numberOfLines={3} style={[styles.exploreFeaturedDescription, { color: palette.cardInkSecondary }]}>
            {item.description}
          </Text>
        ) : null}
        {item.tags?.length ? (
          <View style={styles.exploreFeaturedTags}>
            {item.tags.slice(0, 3).map((tag) => (
              <View key={tag} style={[styles.exploreFeaturedTag, { backgroundColor: palette.actionSoft }]}>
                <Text numberOfLines={1} style={[styles.exploreFeaturedTagText, { color: palette.cardInk }]}>
                  {tag}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </NemuPressable>
  );
}

/**
 * The featured carousel in the new design: one card centred with the
 * neighbours peeking symmetrically, the page washed in the active card's
 * colour (switching, with a tick, the moment the active card changes), and
 * the rail's ends dissolving instead of being cut.
 */
function ExploreFeaturedCarousel({
  title,
  subtitle,
  entries,
  source,
  importingKey,
  strings,
  onPressManga,
}: {
  title?: string;
  subtitle?: string;
  entries: MobileLiveSearchManga[];
  source: SearchSourceDisplay;
  importingKey: string | null;
  strings: MobileStrings;
  onPressManga: (source: SearchSourceDisplay, manga: MobileLiveSearchManga) => void;
}) {
  const { scheme, tokens } = useNemuTheme();
  const bleed = useMobilePageBleedStyles();
  const gutters = useMobilePageGutters();
  const [viewport, setViewport] = useState(0);
  const [active, setActive] = useState(0);
  const [tints, setTints] = useState<Record<number, MobileCoverRgb | null>>({});
  const scrollRef = useRef<ScrollViewInstance | null>(null);
  const reportTint = useCallback((index: number, tint: MobileCoverRgb | null) => {
    setTints((current) => (current[index] === tint ? current : { ...current, [index]: tint }));
  }, []);
  const cardWidth = Math.max(0, Math.min(EXPLORE_FEATURED_MAX_CARD, viewport - EXPLORE_FEATURED_PEEK * 2));
  const interval = cardWidth + EXPLORE_FEATURED_GAP;
  const sidePad = Math.max(0, (viewport - cardWidth) / 2);
  const palettes = useMemo(
    () => entries.map((_, index) => buildMobileCoverTintPalette(tints[index] ?? null, scheme)),
    [entries, scheme, tints],
  );
  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (interval <= 0) return;
    const next = Math.max(0, Math.min(entries.length - 1, Math.round(event.nativeEvent.contentOffset.x / interval)));
    if (next !== active) {
      // The wash and the tick change at the instant the active card does, mid-drag.
      setActive(next);
      void hapticSelection();
    }
  };
  return (
    <View style={styles.homeSection}>
      {/* Behind everything: the active card's colour, rising under the heading, fading in and out. */}
      <View pointerEvents="none" style={[styles.exploreFeaturedWashFrame, { left: -gutters.left, right: -gutters.right }]}>
        {palettes.map((colors, index) => (
          <ExploreFeaturedWash key={index} colors={colors} shown={index === active} />
        ))}
      </View>
      <SectionHeader title={title} subtitle={subtitle} strings={strings} onListingPress={() => {}} />
      <View onLayout={(event) => setViewport(event.nativeEvent.layout.width)} style={bleed.frame}>
        {cardWidth > 0 ? (
          <ExploreRailFade>
            <ScrollView
              ref={scrollRef}
              horizontal
              scrollsToTop={false}
              decelerationRate="fast"
              snapToInterval={interval}
              snapToAlignment="start"
              disableIntervalMomentum
              showsHorizontalScrollIndicator={false}
              onScroll={handleScroll}
              scrollEventThrottle={16}
              contentContainerStyle={{ paddingHorizontal: sidePad, paddingVertical: 10 }}
              style={styles.exploreFeaturedPager}
            >
              {entries.map((item, index) => (
                <View
                  key={`${item.id}:${index}`}
                  style={{ marginRight: index === entries.length - 1 ? 0 : EXPLORE_FEATURED_GAP }}
                >
                  <ExploreFeaturedCard
                    item={item}
                    index={index}
                    width={cardWidth}
                    disabled={importingKey === sourceMangaKey(source, item)}
                    strings={strings}
                    onPress={() => onPressManga(source, item)}
                    onTint={reportTint}
                  />
                </View>
              ))}
            </ScrollView>
          </ExploreRailFade>
        ) : (
          <View style={{ height: 1 }} />
        )}
      </View>
      {entries.length > 1 ? (
        <View style={styles.featuredDots}>
          {entries.map((entry, index) => {
            const selected = index === active;
            return (
              <NemuPressable
                key={`${entry.id}:${index}`}
                accessibilityRole="button"
                accessibilityLabel={formatMobileString(strings.sourceBrowse.selectFeaturedManga, { title: entry.title })}
                accessibilityState={{ selected }}
                hapticFeedback={selected ? "none" : "selection"}
                onPress={() => {
                  if (selected) return;
                  scrollRef.current?.scrollTo({ x: interval * index, animated: true });
                }}
                pressedScale={0.9}
                style={[
                  styles.featuredDot,
                  {
                    width: selected ? 20 : 8,
                    backgroundColor: selected ? tokens.foreground : tokens.mutedForeground,
                    opacity: selected ? 0.7 : 0.28,
                  },
                ]}
              >
                <View />
              </NemuPressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function FeaturedSectionSkeleton() {
  const { tokens } = useNemuTheme();
  const { cardWidth, foldAligned, onLayout, ref } = useFeaturedCarouselLayout();
  const skeletonColor = tokens.muted;
  const subtleSkeletonColor = tokens.sourceIconGlass;

  return (
    <View
      ref={ref}
      onLayout={onLayout}
      style={[styles.featuredCarousel, foldAligned ? styles.featuredCarouselFolded : null]}
    >
      <View style={[styles.featuredCard, { width: cardWidth }]}>
        <View
          style={[
            styles.featuredCover,
            {
              backgroundColor: skeletonColor,
              ...mangaCoverGlassStyle(tokens),
            },
          ]}
        />
        <View style={styles.featuredText}>
          <View
            style={[
              styles.homeSkeletonFeaturedTitle,
              { backgroundColor: skeletonColor },
            ]}
          />
          <View
            style={[
              styles.homeSkeletonFeaturedSubtitle,
              { backgroundColor: subtleSkeletonColor },
            ]}
          />
          <View
            style={[
              styles.homeSkeletonFeaturedLine,
              { backgroundColor: skeletonColor },
            ]}
          />
          <View
            style={[
              styles.homeSkeletonFeaturedLine,
              { backgroundColor: skeletonColor },
            ]}
          />
          <View
            style={[
              styles.homeSkeletonFeaturedLineShort,
              { backgroundColor: subtleSkeletonColor },
            ]}
          />
          <View style={styles.tagRow}>
            {[0, 1, 2].map((item) => (
              <View
                key={item}
                style={[
                  styles.homeSkeletonTagPill,
                  { backgroundColor: subtleSkeletonColor },
                ]}
              />
            ))}
          </View>
        </View>
      </View>
      <View style={styles.featuredDots}>
        {[0, 1, 2, 3, 4].map((item) => (
          <View
            key={item}
            style={[
              styles.featuredDot,
              {
                width: item === 0 ? 20 : 8,
                backgroundColor:
                  item === 0 ? tokens.primary : tokens.mutedForeground,
                opacity: item === 0 ? 1 : 0.28,
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

function FeaturedSection({
  component,
  entries,
  status,
  source,
  importingKey,
  strings,
  onPressManga,
}: {
  component: HomeComponent;
  entries: MobileLiveSearchManga[];
  status: MobileSourceHomeSectionStatus;
  source: SearchSourceDisplay;
  importingKey: string | null;
  strings: MobileStrings;
  onPressManga: (
    source: SearchSourceDisplay,
    manga: MobileLiveSearchManga,
  ) => void;
}) {
  const { tokens } = useNemuTheme();
  const { cardWidth, stride, viewportWidth, foldAligned, onLayout, ref } =
    useFeaturedCarouselLayout();
  // Folding changes the page stride and the pager re-snaps in one step
  // (see onContentSizeChange); a soft dip-and-fade makes it read as a settle.
  const resnapStyle = useMobilePoseResnapFade(`${Math.round(stride)}:${foldAligned ? "fold" : "flat"}`);
  const pagerRef = useRef<ScrollViewInstance | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const featuredEntries = getMobileSourceHomeFeaturedEntries(entries);
  const placeholder = resolveMobileSourceHomeSectionPlaceholder({
    status,
    itemCount: featuredEntries.length,
  });
  if (placeholder !== "none") {
    return (
      <View style={styles.homeSection}>
        <SectionHeader
          title={component.title}
          subtitle={component.subtitle}
          strings={strings}
          onListingPress={() => {}}
        />
        {placeholder === "empty" ? (
          <HomeSectionEmpty strings={strings} />
        ) : (
          <FeaturedSectionSkeleton />
        )}
      </View>
    );
  }
  const selectedIndex = getMobileSourceHomeFeaturedCarouselIndex(
    featuredEntries,
    currentIndex,
  );
  const handleMomentumEnd = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const nextIndex = getMobileSourceHomeFeaturedCarouselIndex(
      featuredEntries,
      Math.round(event.nativeEvent.contentOffset.x / stride),
    );
    setCurrentIndex(nextIndex);
  };

  if (mobileDesignExploreFlag) {
    return (
      <ExploreFeaturedCarousel
        title={component.title}
        subtitle={component.subtitle}
        entries={featuredEntries}
        source={source}
        importingKey={importingKey}
        strings={strings}
        onPressManga={onPressManga}
      />
    );
  }
  return (
    <View style={styles.homeSection}>
      <SectionHeader
        title={component.title}
        subtitle={component.subtitle}
        strings={strings}
        onListingPress={() => {}}
      />
      <View ref={ref} onLayout={onLayout} style={styles.featuredCarousel}>
        {/* The re-snap fade wrapper must not unbound the pager: a horizontal
            ScrollView defaults to flexGrow 1, and inside an unsized wrapper it
            grew to its content's stacked height (~11k pt), pushing every
            section below the carousel off screen. */}
        <Animated.View style={[{ width: viewportWidth }, resnapStyle]}>
          <ScrollView
            ref={pagerRef}
            horizontal
            scrollsToTop={false}
            // Flat: page by card. Book: the viewport spans both panes and snaps
            // by one pane, so card k rests left of the fold and k + 1 right of it.
            pagingEnabled={!foldAligned}
            snapToInterval={foldAligned ? stride : undefined}
            snapToAlignment={foldAligned ? "start" : undefined}
            decelerationRate="fast"
            disableIntervalMomentum
            onMomentumScrollEnd={handleMomentumEnd}
            // Resizing changes each page's offset. Keep the same manga selected
            // after rotation/folding, once the new content dimensions are ready.
            onContentSizeChange={() => {
              pagerRef.current?.scrollTo({
                x: selectedIndex * stride,
                animated: false,
              });
            }}
            showsHorizontalScrollIndicator={false}
            style={[styles.featuredPager, { width: viewportWidth }]}
          >
            {featuredEntries.map((item, index) => {
              const resultKey = sourceMangaKey(source, item);
              const disabled = importingKey === resultKey;
              return (
                <View
                  key={`${item.id}:${index}`}
                  style={[
                    styles.featuredPage,
                    foldAligned ? styles.featuredPageFolded : null,
                    { width: stride },
                  ]}
                >
                  <NemuPressable
                    accessibilityRole="button"
                    accessibilityLabel={openMangaAccessibilityLabel(
                      item.title,
                      strings,
                    )}
                    accessibilityState={{ disabled }}
                    disabled={disabled}
                    onPress={() => onPressManga(source, item)}
                    pressedScale={0.985}
                    style={[styles.featuredCard, { width: cardWidth }]}
                  >
                    <View
                      style={[
                        styles.featuredCover,
                        {
                          backgroundColor: tokens.muted,
                          ...mangaCoverGlassStyle(tokens),
                        },
                      ]}
                    >
                      {mobileDesignExploreFlag || item.cover ? (
                        <SourceHomeCoverImage
                          uri={item.cover ?? null}
                          title={item.title}
                          headers={item.coverHeaders}
                          style={styles.coverImage}
                        />
                      ) : (
                        <View
                          style={[
                            styles.coverPlaceholder,
                            { backgroundColor: tokens.muted },
                          ]}
                        >
                          <Ionicons
                            name="book-outline"
                            size={22}
                            color={tokens.mutedForeground}
                          />
                        </View>
                      )}
                    </View>
                    <View style={styles.featuredText}>
                      <Text
                        numberOfLines={2}
                        style={[
                          styles.featuredTitle,
                          { color: tokens.foreground },
                        ]}
                      >
                        {item.title}
                      </Text>
                      {item.authors?.length ? (
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.featuredSubtitle,
                            { color: tokens.mutedForeground },
                          ]}
                        >
                          {item.authors.join(", ")}
                        </Text>
                      ) : null}
                      {item.description ? (
                        <Text
                          numberOfLines={3}
                          style={[
                            styles.featuredDescription,
                            { color: tokens.mutedForeground },
                          ]}
                        >
                          {item.description}
                        </Text>
                      ) : null}
                      {item.tags?.length ? (
                        <View style={styles.tagRow}>
                          {item.tags.slice(0, 3).map((tag) => (
                            <MobileChip
                              key={tag}
                              accessibilityLabel={tag}
                              label={tag}
                              size="sm"
                              variant="static"
                            />
                          ))}
                        </View>
                      ) : null}
                    </View>
                  </NemuPressable>
                </View>
              );
            })}
          </ScrollView>
        </Animated.View>
        {featuredEntries.length > 1 ? (
          <View style={styles.featuredDots}>
            {featuredEntries.map((entry, index) => {
              const selected = index === selectedIndex;
              const canSelect = canSelectMobileSourceHomeFeaturedDot({
                selected,
              });
              return (
                <NemuPressable
                  key={`${entry.id}:${index}`}
                  accessibilityRole="button"
                  accessibilityLabel={formatMobileString(
                    strings.sourceBrowse.selectFeaturedManga,
                    { title: entry.title },
                  )}
                  accessibilityState={{ selected }}
                  hapticFeedback={canSelect ? "selection" : "none"}
                  onPress={() => {
                    if (canSelect) {
                      setCurrentIndex(index);
                      pagerRef.current?.scrollTo({
                        x: stride * index,
                        animated: true,
                      });
                    }
                  }}
                  pressedScale={0.9}
                  style={[
                    styles.featuredDot,
                    {
                      width: selected ? 20 : 8,
                      backgroundColor: selected
                        ? tokens.primary
                        : tokens.mutedForeground,
                      opacity: selected ? 1 : 0.28,
                    },
                  ]}
                >
                  <View />
                </NemuPressable>
              );
            })}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function HomeListSkeletonRows({
  count,
  grid,
  ranking,
  showInlinePills,
}: {
  count: number;
  /** The section's list grid, so placeholder rows take the loaded columns. */
  grid: Pick<MobileFoldAwareGridLayout, "columns" | "itemWidth" | "columnMargins">;
  ranking?: boolean;
  showInlinePills?: boolean;
}) {
  const { tokens } = useNemuTheme();
  const skeletonColor = tokens.muted;
  const subtleSkeletonColor = tokens.sourceIconGlass;

  return (
    <HomeListColumns grid={grid}>
      {Array.from({ length: count }).map((_, item) => (
        <View
          key={item}
          style={[styles.listRow, mobileDesignExploreFlag ? styles.exploreListRow : null, { borderColor: tokens.border }]}
        >
          {ranking ? (
            <View
              style={[
                styles.homeSkeletonRank,
                { backgroundColor: subtleSkeletonColor },
              ]}
            />
          ) : null}
          <View
            style={[
              styles.listCover,
          mobileDesignExploreFlag ? styles.exploreListCover : null,
              {
                backgroundColor: skeletonColor,
                borderColor: tokens.coverBorder,
              },
            ]}
          />
          <View style={styles.listText}>
            <View
              style={[
                styles.homeSkeletonListLine,
                { backgroundColor: skeletonColor },
              ]}
            />
            <View
              style={[
                styles.homeSkeletonListLineShort,
                { backgroundColor: subtleSkeletonColor },
              ]}
            />
            {showInlinePills ? (
              <View style={styles.homeSkeletonInlinePills}>
                <View
                  style={[
                    styles.homeSkeletonInlinePill,
                    { backgroundColor: subtleSkeletonColor },
                  ]}
                />
                <View
                  style={[
                    styles.homeSkeletonInlinePillWide,
                    { backgroundColor: subtleSkeletonColor },
                  ]}
                />
              </View>
            ) : null}
          </View>
        </View>
      ))}
    </HomeListColumns>
  );
}

/**
 * Lays home list rows out in columns on wide windows (one column on phones,
 * unchanged). Row-major order; in book posture the column gap is the fold.
 */
function HomeListColumns({
  grid,
  children,
}: {
  grid: Pick<MobileFoldAwareGridLayout, "columns" | "itemWidth" | "columnMargins">;
  children: ReactNode;
}) {
  const items = Children.toArray(children);
  // Design-explore: one inset group at the phone's reading width, centred.
  if (mobileDesignExploreFlag) {
    return (
      <ExploreHomeGroup>
        <View style={styles.exploreListInner}>{items}</View>
      </ExploreHomeGroup>
    );
  }
  if (grid.columns <= 1) return <>{items}</>;
  return (
    <>
      {chunkMobileGridRows(items, grid.columns).map((row, rowIndex) => (
        // Folding glides rows and cells to their panes (pose settle spring).
        <MobilePoseLayoutView key={rowIndex} style={styles.listGridRow}>
          {row.map((child, column) => (
            <MobilePoseLayoutView
              key={isValidElement(child) && child.key !== null ? child.key : column}
              style={mobileFoldAwareGridCellStyle(grid, column)}
            >
              {child}
            </MobilePoseLayoutView>
          ))}
        </MobilePoseLayoutView>
      ))}
    </>
  );
}

const MangaListSection = memo(function MangaListSection({
  component,
  links,
  ranking,
  pageSize,
  status,
  source,
  importingKey,
  strings,
  onPressManga,
  onListingPress,
  onOpenLink,
}: {
  component: HomeComponent;
  links: HomeLink[];
  ranking: boolean;
  status: MobileSourceHomeSectionStatus;
  pageSize?: number;
  source: SearchSourceDisplay;
  importingKey: string | null;
  strings: MobileStrings;
  onPressManga: (
    source: SearchSourceDisplay,
    manga: MobileLiveSearchManga,
  ) => void;
  onListingPress: (listing: Listing) => void;
  onOpenLink: OpenLinkHandler;
}) {
  const { tokens } = useNemuTheme();
  const { ref: listGridRef, onLayout: onListGridLayout, ...listGrid } = useHomeListGrid();
  const displayed = pageSize ? links.slice(0, pageSize) : links;
  const placeholder = resolveMobileSourceHomeSectionPlaceholder({
    status,
    itemCount: displayed.length,
  });
  const skeletonCount = getMobileSourceHomeListSkeletonCount(pageSize);

  return (
    <View style={[styles.homeSection, mobileDesignExploreFlag ? styles.exploreListColumn : null]}>
      <SectionHeader
        title={component.title}
        subtitle={component.subtitle}
        listing={
          "listing" in component.value ? component.value.listing : undefined
        }
        strings={strings}
        onListingPress={onListingPress}
      />
      <View ref={listGridRef} onLayout={onListGridLayout} style={styles.listStack}>
        {placeholder === "empty" ? (
          <HomeSectionEmpty strings={strings} />
        ) : placeholder === "skeleton" ? (
          <HomeListSkeletonRows
            count={skeletonCount}
            grid={listGrid}
            ranking={ranking}
            showInlinePills
          />
        ) : (
          <HomeListColumns grid={listGrid}>
          {displayed.map((link, index) => {
            const manga = linkToManga(link);
            if (!manga) {
              return (
                <HomeListActionRow
                  key={`${link.title}:${index}`}
                  link={link}
                  rank={ranking ? index + 1 : undefined}
                  strings={strings}
                  onListingPress={onListingPress}
                  onOpenLink={onOpenLink}
                />
              );
            }

            const resultKey = sourceMangaKey(source, manga);
            const disabled = importingKey === resultKey;
            const subtitle = link.subtitle ?? manga.authors?.join(", ");
            return (
              <NemuPressable
                key={`${manga.id}:${index}`}
                accessibilityRole="button"
                accessibilityLabel={openMangaAccessibilityLabel(
                  manga.title,
                  strings,
                )}
                accessibilityState={{ disabled }}
                disabled={disabled}
                onPress={() => onPressManga(source, manga)}
                pressedScale={0.99}
                style={[styles.listRow, mobileDesignExploreFlag ? styles.exploreListRow : null, { borderColor: tokens.border }]}
              >
                {ranking ? (
                  <Text
                    style={[styles.rankText, { color: tokens.mutedForeground }]}
                  >
                    {index + 1}
                  </Text>
                ) : null}
                <View
                  style={[
                    styles.listCover,
          mobileDesignExploreFlag ? styles.exploreListCover : null,
                    {
                      backgroundColor: tokens.muted,
                      borderColor: tokens.coverBorder,
                    },
                  ]}
                >
                  {mobileDesignExploreFlag || manga.cover ? (
                    <SourceHomeCoverImage
                      uri={manga.cover ?? null}
                      title={manga.title}
                      headers={manga.coverHeaders}
                      style={styles.coverImage}
                    />
                  ) : (
                    <View
                      style={[
                        styles.coverPlaceholder,
                        { backgroundColor: tokens.muted },
                      ]}
                    >
                      <Ionicons
                        name="book-outline"
                        size={16}
                        color={tokens.mutedForeground}
                      />
                    </View>
                  )}
                </View>
                <View style={styles.listText}>
                  <Text
                    numberOfLines={2}
                    style={[styles.listTitle, { color: tokens.foreground }]}
                  >
                    {manga.title}
                  </Text>
                  {subtitle ? (
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.listSubtitle,
                        { color: tokens.mutedForeground },
                      ]}
                    >
                      {subtitle}
                    </Text>
                  ) : null}
                  {manga.tags?.length ? (
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.listMeta,
                        { color: tokens.mutedForeground },
                      ]}
                    >
                      {manga.tags.slice(0, 3).join(" / ")}
                    </Text>
                  ) : null}
                </View>
                {mobileDesignExploreFlag ? (
                  <Ionicons name="chevron-forward" size={15} color={nemuColorWithAlpha(tokens.mutedForeground, 0.7)} />
                ) : null}
              </NemuPressable>
            );
          })}
          </HomeListColumns>
        )}
      </View>
    </View>
  );
});

function HomeListActionRow({
  link,
  rank,
  strings,
  onListingPress,
  onOpenLink,
}: {
  link: HomeLink;
  rank?: number;
  strings: MobileStrings;
  onListingPress: (listing: Listing) => void;
  onOpenLink: OpenLinkHandler;
}) {
  const { tokens } = useNemuTheme();
  const disabled = !homeLinkHasAction(link);
  const handlePress = () => {
    if (link.value?.type === "listing") onListingPress(link.value.listing);
    if (link.value?.type === "url") onOpenLink(link.value.url);
  };

  return (
    <NemuPressable
      accessibilityRole="button"
      accessibilityLabel={homeLinkAccessibilityLabel(link, strings)}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={handlePress}
      pressedScale={0.99}
      style={[styles.listRow, mobileDesignExploreFlag ? styles.exploreListRow : null, { borderColor: tokens.border }]}
    >
      {rank ? (
        <Text style={[styles.rankText, { color: tokens.mutedForeground }]}>
          {rank}
        </Text>
      ) : null}
      <View
        style={[
          styles.listCover,
          mobileDesignExploreFlag ? styles.exploreListCover : null,
          { backgroundColor: tokens.muted, borderColor: tokens.coverBorder },
        ]}
      >
        {mobileDesignExploreFlag || link.imageUrl ? (
          <SourceHomeCoverImage
            uri={link.imageUrl ?? null}
            title={link.title}
            headers={homeLinkImageHeaders(link)}
            style={styles.coverImage}
          />
        ) : (
          <View
            style={[styles.coverPlaceholder, { backgroundColor: tokens.muted }]}
          >
            <Ionicons
              name="link-outline"
              size={16}
              color={tokens.mutedForeground}
            />
          </View>
        )}
      </View>
      <View style={styles.listText}>
        <Text
          numberOfLines={2}
          style={[styles.listTitle, { color: tokens.foreground }]}
        >
          {link.title}
        </Text>
        {link.subtitle ? (
          <Text
            numberOfLines={1}
            style={[styles.listSubtitle, { color: tokens.mutedForeground }]}
          >
            {link.subtitle}
          </Text>
        ) : null}
      </View>
      <Ionicons
        name="chevron-forward-outline"
        size={18}
        color={tokens.mutedForeground}
      />
    </NemuPressable>
  );
}

const ChapterListSection = memo(function ChapterListSection({
  component,
  entries,
  pageSize,
  status,
  source,
  strings,
  onPressManga,
  onListingPress,
}: {
  component: HomeComponent;
  entries: MangaWithChapter[];
  pageSize?: number;
  status: MobileSourceHomeSectionStatus;
  source: SearchSourceDisplay;
  strings: MobileStrings;
  onPressManga: (
    source: SearchSourceDisplay,
    manga: MobileLiveSearchManga,
  ) => void;
  onListingPress: (listing: Listing) => void;
}) {
  const { tokens } = useNemuTheme();
  const { ref: listGridRef, onLayout: onListGridLayout, ...listGrid } = useHomeListGrid();
  const displayed = pageSize ? entries.slice(0, pageSize) : entries;
  const placeholder = resolveMobileSourceHomeSectionPlaceholder({
    status,
    itemCount: displayed.length,
  });
  const skeletonCount = getMobileSourceHomeListSkeletonCount(pageSize);

  return (
    <View style={[styles.homeSection, mobileDesignExploreFlag ? styles.exploreListColumn : null]}>
      <SectionHeader
        title={component.title}
        subtitle={component.subtitle}
        listing={
          "listing" in component.value ? component.value.listing : undefined
        }
        strings={strings}
        onListingPress={onListingPress}
      />
      <View ref={listGridRef} onLayout={onListGridLayout} style={styles.listStack}>
        {placeholder === "empty" ? (
          <HomeSectionEmpty strings={strings} />
        ) : placeholder === "skeleton" ? (
          <HomeListSkeletonRows count={skeletonCount} grid={listGrid} />
        ) : (
          <HomeListColumns grid={listGrid}>
          {displayed.map((entry, index) => {
            const manga = chapterEntryToManga(entry);
            return (
              <NemuPressable
                key={`${entry.manga.key}:${entry.chapter.key}:${index}`}
                accessibilityRole="button"
                accessibilityLabel={openMangaAccessibilityLabel(
                  manga.title,
                  strings,
                )}
                onPress={() => onPressManga(source, manga)}
                pressedScale={0.99}
                style={[styles.listRow, mobileDesignExploreFlag ? styles.exploreListRow : null, { borderColor: tokens.border }]}
              >
                <View
                  style={[
                    styles.listCover,
          mobileDesignExploreFlag ? styles.exploreListCover : null,
                    {
                      backgroundColor: tokens.muted,
                      borderColor: tokens.coverBorder,
                    },
                  ]}
                >
                  {mobileDesignExploreFlag || manga.cover ? (
                    <SourceHomeCoverImage
                      uri={manga.cover ?? null}
                      title={manga.title}
                      headers={manga.coverHeaders}
                      style={styles.coverImage}
                    />
                  ) : (
                    <View
                      style={[
                        styles.coverPlaceholder,
                        { backgroundColor: tokens.muted },
                      ]}
                    >
                      <Ionicons
                        name="book-outline"
                        size={16}
                        color={tokens.mutedForeground}
                      />
                    </View>
                  )}
                </View>
                <View style={styles.listText}>
                  <Text
                    numberOfLines={2}
                    style={[styles.listTitle, { color: tokens.foreground }]}
                  >
                    {manga.title}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.listSubtitle,
                      { color: tokens.mutedForeground },
                    ]}
                  >
                    {formatChapterTitle(
                      {
                        id: entry.chapter.key,
                        title: entry.chapter.title,
                        chapterNumber: entry.chapter.chapterNumber,
                        volumeNumber: entry.chapter.volumeNumber,
                      },
                      strings,
                    )}
                  </Text>
                  {entry.chapter.scanlator ? (
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.listMeta,
                        { color: tokens.mutedForeground },
                      ]}
                    >
                      {entry.chapter.scanlator}
                    </Text>
                  ) : null}
                </View>
                {mobileDesignExploreFlag ? (
                  <Ionicons name="chevron-forward" size={15} color={nemuColorWithAlpha(tokens.mutedForeground, 0.7)} />
                ) : null}
              </NemuPressable>
            );
          })}
          </HomeListColumns>
        )}
      </View>
    </View>
  );
});

const BannerSection = memo(function BannerSection({
  component,
  links,
  status,
  source,
  importingKey,
  strings,
  onPressManga,
  onListingPress,
  onOpenLink,
}: {
  component: HomeComponent;
  links: HomeLink[];
  status: MobileSourceHomeSectionStatus;
  source: SearchSourceDisplay;
  importingKey: string | null;
  strings: MobileStrings;
  onPressManga: (
    source: SearchSourceDisplay,
    manga: MobileLiveSearchManga,
  ) => void;
  onListingPress: (listing: Listing) => void;
  onOpenLink: OpenLinkHandler;
}) {
  const { tokens } = useNemuTheme();
  const bleed = useMobilePageBleedStyles(HOME_RAIL_BLEED_OVERSCAN);
  const value = component.value;
  const cardSize =
    value.type === "imageScroller"
      ? getMobileSourceHomeImageScrollerCardSize({
          width: value.width,
          height: value.height,
        })
      : getMobileSourceHomeImageScrollerCardSize({});
  const placeholder = resolveMobileSourceHomeSectionPlaceholder({
    status,
    itemCount: links.length,
  });

  if (placeholder === "empty") {
    return (
      <View style={styles.homeSection}>
        <SectionHeader
          title={component.title}
          subtitle={component.subtitle}
          strings={strings}
          onListingPress={onListingPress}
        />
        <HomeSectionEmpty strings={strings} />
      </View>
    );
  }

  return (
    <View style={styles.homeSection}>
      <SectionHeader
        title={component.title}
        subtitle={component.subtitle}
        strings={strings}
        onListingPress={onListingPress}
      />
      <RailFrame bleedFrame={bleed.frame}>
      <FlatList
        horizontal
        scrollsToTop={false}
        data={links}
        keyExtractor={(link, index) => `${link.title}:${index}`}
        ListEmptyComponent={() => (
          <>
            {HOME_SKELETON_BANNER_ITEMS.map((item) => (
              <View
                key={item}
                style={[
                  styles.bannerCard,
                  cardSize,
                  {
                    backgroundColor: tokens.muted,
                    ...mangaCoverGlassStyle(tokens),
                  },
                ]}
              />
            ))}
          </>
        )}
        initialNumToRender={3}
        maxToRenderPerBatch={3}
        decelerationRate="fast"
        disableIntervalMomentum
        snapToAlignment="start"
        snapToInterval={cardSize.width + 12}
        // iOS detaches cells it should not on horizontal lists (rows blank out
        // mid-swipe), so clipping stays Android-only.
        removeClippedSubviews={Platform.OS === "android"}
        renderItem={({ item: link }) => {
          const manga = linkToManga(link);
          const handlePress = () => {
            if (manga) {
              onPressManga(source, manga);
              return;
            }
            if (link.value?.type === "listing")
              onListingPress(link.value.listing);
            if (link.value?.type === "url") onOpenLink(link.value.url);
          };
          const resultKey = manga ? sourceMangaKey(source, manga) : null;
          const disabled = manga
            ? resultKey === importingKey
            : !homeLinkHasAction(link);
          return (
            <NemuPressable
              accessibilityRole="button"
              accessibilityLabel={
                manga
                  ? openMangaAccessibilityLabel(manga.title, strings)
                  : homeLinkAccessibilityLabel(link, strings)
              }
              accessibilityState={{ disabled }}
              disabled={disabled}
              onPress={handlePress}
              pressedScale={0.985}
              style={[
                styles.bannerCard,
                cardSize,
                {
                  backgroundColor: tokens.muted,
                  ...mangaCoverGlassStyle(tokens),
                },
              ]}
            >
              {mobileDesignExploreFlag || link.imageUrl ? (
                <SourceHomeCoverImage
                  uri={link.imageUrl ?? null}
                  title={link.title}
                  headers={homeLinkImageHeaders(link)}
                  style={styles.coverImage}
                />
              ) : (
                <View
                  style={[
                    styles.coverPlaceholder,
                    { backgroundColor: tokens.muted },
                  ]}
                >
                  <Ionicons
                    name="image-outline"
                    size={22}
                    color={tokens.mutedForeground}
                  />
                </View>
              )}
              <LinearGradient
                pointerEvents="none"
                colors={WEB_BANNER_VIGNETTE_COLORS}
                locations={WEB_BANNER_VIGNETTE_LOCATIONS}
                start={{ x: 0.5, y: 0 }}
                style={StyleSheet.absoluteFill}
                end={{ x: 0.5, y: 1 }}
              />
            </NemuPressable>
          );
        }}
        showsHorizontalScrollIndicator={false}
        style={mobileDesignExploreFlag ? undefined : bleed.frame}
        contentContainerStyle={[styles.bannerContent, bleed.content]}
        windowSize={5}
      />
      </RailFrame>
    </View>
  );
});

const HomeFiltersSection = memo(function HomeFiltersSection({
  component,
  items,
  strings,
  onFilterPress,
}: {
  component: HomeComponent;
  items: HomeFilterItem[];
  strings: MobileStrings;
  onFilterPress: (values: FilterValue[]) => void;
}) {
  const filterItems = getMobileSourceHomeFilterItems(items);
  if (!filterItems.length) return null;
  return (
    <View style={styles.homeSection}>
      <SectionHeader
        title={component.title}
        subtitle={component.subtitle}
        strings={strings}
        onListingPress={() => {}}
      />
      <View style={styles.filterGrid}>
        {filterItems.map((item, index) => (
          <MobileChip
            key={`${item.title}:${index}`}
            accessibilityLabel={openHomeFilterAccessibilityLabel(
              item.title,
              strings,
            )}
            accessibilityRole="button"
            fallbackIcon="options-outline"
            hapticFeedback="press"
            label={item.title}
            onPress={() => {
              onFilterPress(item.values ?? []);
            }}
            variant="toggle"
          />
        ))}
      </View>
    </View>
  );
});

const HomeComponentView = memo(function HomeComponentView(
  props: SourceHomeViewProps & {
    component: HomeComponent;
    onOpenLink: OpenLinkHandler;
  },
) {
  const {
    component,
    status,
    source,
    importingKey,
    strings,
    onPressManga,
    onListingPress,
    onFilterPress,
    onOpenLink,
  } = props;
  const value = component.value;

  if (value.type === "scroller") {
    return (
      <HorizontalLinkSection
        component={component}
        links={value.entries}
        status={status}
        source={source}
        importingKey={importingKey}
        strings={strings}
        onPressManga={onPressManga}
        onListingPress={onListingPress}
        onOpenLink={onOpenLink}
      />
    );
  }

  if (value.type === "bigScroller") {
    return (
      <FeaturedSection
        component={component}
        entries={value.entries.map(mapAidokuMangaToLiveSearchManga)}
        status={status}
        source={source}
        importingKey={importingKey}
        strings={strings}
        onPressManga={onPressManga}
      />
    );
  }

  if (value.type === "mangaList") {
    return (
      <MangaListSection
        component={component}
        links={value.entries}
        ranking={value.ranking}
        pageSize={value.pageSize}
        status={status}
        source={source}
        importingKey={importingKey}
        strings={strings}
        onPressManga={onPressManga}
        onListingPress={onListingPress}
        onOpenLink={onOpenLink}
      />
    );
  }

  if (value.type === "mangaChapterList") {
    return (
      <ChapterListSection
        component={component}
        entries={value.entries}
        pageSize={value.pageSize}
        status={status}
        source={source}
        strings={strings}
        onPressManga={onPressManga}
        onListingPress={onListingPress}
      />
    );
  }

  if (value.type === "imageScroller") {
    return (
      <BannerSection
        component={component}
        links={value.links}
        status={status}
        source={source}
        importingKey={importingKey}
        strings={strings}
        onPressManga={onPressManga}
        onListingPress={onListingPress}
        onOpenLink={onOpenLink}
      />
    );
  }

  if (value.type === "filters") {
    return (
      <HomeFiltersSection
        component={component}
        items={value.items}
        strings={strings}
        onFilterPress={onFilterPress}
      />
    );
  }

  if (value.type === "links") {
    return (
      <HorizontalLinkSection
        component={component}
        links={value.links}
        status={status}
        source={source}
        importingKey={importingKey}
        strings={strings}
        onPressManga={onPressManga}
        onListingPress={onListingPress}
        onOpenLink={onOpenLink}
      />
    );
  }

  return null;
});

export function SourceHomeSkeletonView({
  accessibilityLabel,
}: {
  accessibilityLabel?: string;
}) {
  const { tokens, reduceMotion } = useNemuTheme();
  const shimmerBackdrop = useExploreShimmerBackdrop();
  const bleed = useMobilePageBleedStyles(HOME_RAIL_BLEED_OVERSCAN);
  const pulseOpacity = useSkeletonPulse(reduceMotion === true);
  // Design-explore: the blocks hold still and one shimmer sweep crosses them.
  const skeletonOpacity = mobileDesignExploreFlag ? 1 : pulseOpacity;
  const skeletonReady = useSkeletonDisplayDelay(150);
  const skeletonColor = tokens.muted;
  const subtleSkeletonColor = tokens.sourceIconGlass;

  // A home that answers faster than the classic 150 ms threshold paints its
  // rails directly instead of flashing a placeholder first.
  if (!skeletonReady) return null;

  return (
    <Animated.View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="progressbar"
      style={[styles.homeSkeletonStack, { opacity: skeletonOpacity }, shimmerBackdrop]}
    >
      <View style={styles.homeSkeletonSection}>
        <View
          style={[styles.homeSkeletonTitle, { backgroundColor: skeletonColor }]}
        />
        <ScrollView
          horizontal
          scrollsToTop={false}
          showsHorizontalScrollIndicator={false}
          style={bleed.frame}
          contentContainerStyle={[styles.horizontalContent, bleed.content]}
        >
          {HOME_SKELETON_SCROLLER_ITEMS.map((item) => (
            <View key={item} style={styles.homeMangaCard}>
              <View
                style={[
                  styles.homeCover,
                  {
                    backgroundColor: skeletonColor,
                    borderColor: tokens.coverBorder,
                    ...createNemuShadowStyle({
                      color: tokens.shadow,
                      offsetY: 3,
                      radius: 14,
                      elevation: 4,
                    }),
                  },
                ]}
              />
              <View
                style={[
                  styles.homeSkeletonTextLine,
                  { backgroundColor: skeletonColor },
                ]}
              />
              <View
                style={[
                  styles.homeSkeletonTextLineShort,
                  { backgroundColor: subtleSkeletonColor },
                ]}
              />
            </View>
          ))}
        </ScrollView>
      </View>

      <View style={styles.homeSkeletonSection}>
        <View
          style={[
            styles.homeSkeletonTitleWide,
            { backgroundColor: skeletonColor },
          ]}
        />
        <View style={styles.listStack}>
          {HOME_SKELETON_LIST_ITEMS.map((item) => (
            <View
              key={item}
              style={[styles.listRow, mobileDesignExploreFlag ? styles.exploreListRow : null, { borderColor: tokens.border }]}
            >
              <View
                style={[
                  styles.listCover,
          mobileDesignExploreFlag ? styles.exploreListCover : null,
                  {
                    backgroundColor: skeletonColor,
                    borderColor: tokens.coverBorder,
                  },
                ]}
              />
              <View style={styles.listText}>
                <View
                  style={[
                    styles.homeSkeletonListLine,
                    { backgroundColor: skeletonColor },
                  ]}
                />
                <View
                  style={[
                    styles.homeSkeletonListLineShort,
                    { backgroundColor: subtleSkeletonColor },
                  ]}
                />
              </View>
            </View>
          ))}
        </View>
      </View>
      {/* Design-explore: one shimmer sweep instead of the breathing pulse. */}
      {mobileDesignExploreFlag ? <ExploreShimmerSweep /> : null}
    </Animated.View>
  );
}

function SourceHomeViewImpl(props: SourceHomeViewProps) {
  const [actionError, setActionError] = useState<SourceHomeActionError | null>(
    null,
  );
  const {
    onFilterPress: onFilterPressProp,
    onListingPress: onListingPressProp,
    onPressManga: onPressMangaProp,
    strings,
  } = props;

  // Every section below is memoized, so the handlers they receive have to keep
  // their identity across a re-render of this view; otherwise the whole home
  // layout rebuilds on each parent render.
  const handleOpenLink = useCallback(
    (url: string) => {
      void (async () => {
        setActionError(null);
        try {
          const externalUrl = normalizeMobileSourceExternalUrl(url);
          if (!externalUrl) {
            throw new Error("Source links must use a valid http or https URL.");
          }
          await Linking.openURL(externalUrl);
          await hapticConfirm();
        } catch (error) {
          await hapticError();
          setActionError({
            title: strings.sourceBrowse.openLinkFailed,
            detail: sourceHomeActionErrorMessage(error, strings),
          });
        }
      })();
    },
    [strings],
  );

  const handlePressManga = useCallback(
    (source: SearchSourceDisplay, manga: MobileLiveSearchManga) => {
      setActionError(null);
      onPressMangaProp(source, manga);
    },
    [onPressMangaProp],
  );

  const handleListingPress = useCallback(
    (listing: Listing) => {
      setActionError(null);
      onListingPressProp(listing);
    },
    [onListingPressProp],
  );

  const handleFilterPress = useCallback(
    (values: FilterValue[]) => {
      setActionError(null);
      onFilterPressProp(values);
    },
    [onFilterPressProp],
  );

  if (!props.home.components.length) return null;

  return (
    <SourceHomeInstalledSourceContext.Provider
      value={props.installedSource ?? null}
    >
      <View style={styles.homeStack}>
        {actionError ? (
          <MobileInlineErrorBanner
            title={actionError.title}
            detail={actionError.detail}
            dismissLabel={props.strings.common.clear}
            iconName="open-outline"
            onDismiss={() => setActionError(null)}
          />
        ) : null}
        {props.home.components.map((component, index) => (
          <HomeComponentView
            key={`${component.title ?? component.value.type}:${index}`}
            {...props}
            onPressManga={handlePressManga}
            onListingPress={handleListingPress}
            onFilterPress={handleFilterPress}
            onOpenLink={handleOpenLink}
            component={component}
          />
        ))}
      </View>
    </SourceHomeInstalledSourceContext.Provider>
  );
}

/**
 * The home layout is the heaviest subtree on the browse screen and its props
 * are all stable; memoizing keeps a parent re-render from rebuilding it.
 */
export const SourceHomeView = memo(SourceHomeViewImpl);

const styles = StyleSheet.create({
  homeStack: {
    gap: 22,
  },
  homeSkeletonStack: {
    gap: 28,
  },
  homeSkeletonSection: {
    gap: 12,
  },
  homeSkeletonTitle: {
    width: 120,
    height: 20,
    borderRadius: radius.sm,
    opacity: 0.78,
  },
  homeSkeletonTitleWide: {
    width: 154,
    height: 20,
    borderRadius: radius.sm,
    opacity: 0.78,
  },
  homeSection: {
    gap: 10,
  },
  sectionHeader: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  sectionTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: nemuFontWeight.semibold,
  },
  exploreSectionTitle: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: nemuFontWeight.bold,
  },
  exploreSeeAll: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  exploreSeeAllText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: nemuFontWeight.medium,
  },
  sectionSubtitle: {
    marginTop: 1,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: nemuFontWeight.regular,
  },
  // Rails bleed to the screen edges via `useMobilePageBleedStyles`.
  horizontalContent: {
    gap: 12,
    paddingVertical: 2,
  },
  featuredCarousel: {
    alignItems: "center",
    gap: 14,
    paddingVertical: 2,
  },
  featuredPager: {
    flexGrow: 0,
    flexShrink: 0,
    overflow: "hidden",
  },
  featuredPage: {
    alignItems: "center",
  },
  // A folded page is one pane wide plus the fold; its card hugs the pane's
  // leading edge so it ends before the fold.
  featuredPageFolded: {
    alignItems: "flex-start",
  },
  featuredCarouselFolded: {
    alignItems: "flex-start",
  },
  homeMangaCard: {
    width: 108,
  },
  homeCover: {
    width: 108,
    height: 162,
    overflow: "hidden",
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  coverImage: {
    width: "100%",
    height: "100%",
  },
  coverPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: nemuFontWeight.medium,
  },
  cardSubtitle: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 15,
  },
  homeSkeletonTextLine: {
    height: 14,
    marginTop: 8,
    borderRadius: radius.sm,
    opacity: 0.78,
  },
  homeSkeletonTextLineShort: {
    width: "68%",
    height: 12,
    marginTop: 6,
    borderRadius: radius.sm,
    opacity: 0.72,
  },
  homeSkeletonFeaturedTitle: {
    width: "78%",
    height: 18,
    borderRadius: radius.sm,
    opacity: 0.78,
  },
  homeSkeletonFeaturedSubtitle: {
    width: "42%",
    height: 13,
    borderRadius: radius.sm,
    opacity: 0.72,
  },
  homeSkeletonFeaturedLine: {
    width: "100%",
    height: 13,
    borderRadius: radius.sm,
    opacity: 0.74,
  },
  homeSkeletonFeaturedLineShort: {
    width: "66%",
    height: 13,
    borderRadius: radius.sm,
    opacity: 0.72,
  },
  // Mirrors the `sm` static tag chips the loaded featured card renders.
  homeSkeletonTagPill: {
    width: 44,
    height: 22,
    borderRadius: radius.pill,
    opacity: 0.72,
  },
  featuredCard: {
    flexDirection: "row",
    gap: 16,
    borderRadius: radius.xl,
    padding: 12,
  },
  featuredCover: {
    width: 110,
    height: 165,
    overflow: "hidden",
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  featuredText: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  featuredTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: nemuFontWeight.semibold,
  },
  featuredSubtitle: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: nemuFontWeight.medium,
  },
  featuredDescription: {
    fontSize: 12,
    lineHeight: 16,
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
    marginTop: "auto",
  },
  exploreFeaturedWashFrame: {
    position: "absolute",
    top: -150,
    bottom: -34,
  },
  exploreFeaturedPager: { flexGrow: 0 },
  exploreFeaturedCard: {
    flexDirection: "row",
    gap: 14,
    padding: EXPLORE_FEATURED_PAD,
    borderRadius: R.card,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
  },
  exploreFeaturedText: { flex: 1, minWidth: 0, gap: 4, overflow: "hidden" },
  exploreFeaturedTitle: { fontSize: 17, lineHeight: 22, fontWeight: nemuFontWeight.bold },
  exploreFeaturedAuthor: { fontSize: 13, lineHeight: 17, fontWeight: nemuFontWeight.medium },
  exploreFeaturedDescription: { fontSize: 12, lineHeight: 16 },
  exploreFeaturedTags: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: "auto" },
  exploreFeaturedTag: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  exploreFeaturedTagText: { fontSize: 11, lineHeight: 14, fontWeight: nemuFontWeight.medium },
  featuredDots: {
    minHeight: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  featuredDot: {
    height: 8,
    borderRadius: radius.pill,
  },
  listStack: {
    gap: 2,
  },
  listGridRow: {
    flexDirection: "row",
  },
  sectionEmpty: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  sectionEmptyText: {
    flex: 1,
    minWidth: 0,
  },
  // A list section reads as one column at the phone's width, heading included, on the page's own left edge (the rails and the carousel's heading share it).
  exploreListColumn: { width: "100%", maxWidth: EXPLORE_HOME_GROUP_MAX_WIDTH, alignSelf: "flex-start" },
  exploreListInner: { marginTop: -StyleSheet.hairlineWidth },
  exploreListRow: { paddingHorizontal: 12 },
  // Concentric with the group's corner (group radius less the row's inset).
  exploreListCover: { borderRadius: concentricMobileExploreRadius(R.group, 12) },
  listRow: {
    minHeight: 86,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
  },
  rankText: {
    width: 24,
    textAlign: "center",
    fontSize: 18,
    lineHeight: 22,
    fontWeight: nemuFontWeight.semibold,
  },
  homeSkeletonRank: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    opacity: 0.72,
  },
  listCover: {
    width: 50,
    height: 75,
    overflow: "hidden",
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  listText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  listTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: nemuFontWeight.medium,
  },
  listSubtitle: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: nemuFontWeight.regular,
  },
  listMeta: {
    fontSize: 11,
    lineHeight: 15,
  },
  homeSkeletonListLine: {
    width: "74%",
    height: 14,
    borderRadius: radius.sm,
    opacity: 0.78,
  },
  homeSkeletonListLineShort: {
    width: "46%",
    height: 12,
    borderRadius: radius.sm,
    opacity: 0.72,
  },
  homeSkeletonInlinePills: {
    flexDirection: "row",
    gap: 6,
    paddingTop: 4,
  },
  homeSkeletonInlinePill: {
    width: 36,
    height: 14,
    borderRadius: radius.sm,
    opacity: 0.72,
  },
  homeSkeletonInlinePillWide: {
    width: 46,
    height: 14,
    borderRadius: radius.sm,
    opacity: 0.72,
  },
  bannerContent: {
    gap: 12,
    paddingVertical: 2,
  },
  bannerCard: {
    width: 280,
    height: 160,
    overflow: "hidden",
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  filterGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
});
