import {
  createContext,
  memo,
  useCallback,
  useContext,
  useRef,
  useState,
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
} from "react-native";
import Animated from "react-native-reanimated";
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
  MobileCachedImage,
  createNemuShadowStyle,
  radius,
  type NemuTokens,
  nemuFontWeight,
  useNemuTheme,
} from "@/design-system";
import { formatChapterTitle } from "@/lib/formatChapter";
import {
  useSkeletonDisplayDelay,
  useSkeletonPulse,
} from "@/lib/useSkeletonPulse";
import { hapticConfirm, hapticError } from "@/lib/haptics";
import { formatMobileString, type MobileStrings } from "@/lib/mobileI18n";
import type { SearchSourceDisplay } from "@/lib/mobileSearch";
import { describeMobileErrorDetail } from "@/lib/mobileSourceErrors";
import { normalizeMobileSourceExternalUrl } from "@/lib/mobileSourceExternalUrl";
import { useMobileSourceImageRequest } from "@/lib/useMobileSourceImageRequest";
import { getMobileSourceHomeImageScrollerCardSize } from "@/lib/mobileSourceHomeImageScroller";
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
const FEATURED_CARD_MAX_WIDTH = 520;
const FEATURED_CARD_MIN_WIDTH = 278;
const FEATURED_CARD_HORIZONTAL_MARGIN = 36;
const WEB_BANNER_VIGNETTE_COLORS = [
  "rgba(0,0,0,0)",
  "rgba(0,0,0,0)",
  "rgba(0,0,0,0.30)",
] as const;
const WEB_BANNER_VIGNETTE_LOCATIONS = [0, 0.5, 1] as const;

function getMobileFeaturedCardWidth(windowWidth: number): number {
  return Math.min(
    FEATURED_CARD_MAX_WIDTH,
    Math.max(
      FEATURED_CARD_MIN_WIDTH,
      windowWidth - FEATURED_CARD_HORIZONTAL_MARGIN,
    ),
  );
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

function SourceHomeCoverImage({
  headers,
  uri,
  style,
}: {
  headers?: Record<string, string>;
  uri: string;
  style: StyleProp<ImageStyle>;
}) {
  const { tokens } = useNemuTheme();
  const installedSource = useContext(SourceHomeInstalledSourceContext);
  const requestAlreadyResolved = headers !== undefined;
  const request = useMobileSourceImageRequest(
    requestAlreadyResolved ? null : installedSource,
    requestAlreadyResolved ? null : uri,
  );
  const imageSource = requestAlreadyResolved
    ? { uri, headers, cache: "force-cache" as const }
    : request
      ? {
        uri: request.url,
        headers: request.headers,
        cache: "force-cache" as const,
      }
      : { uri, headers, cache: "force-cache" as const };

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
            numberOfLines={1}
            style={[styles.sectionTitle, { color: tokens.foreground }]}
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
        <Ionicons
          name="chevron-forward-outline"
          size={17}
          color={tokens.mutedForeground}
        />
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
        {item.cover ? (
          <SourceHomeCoverImage
            uri={item.cover}
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
        {link.imageUrl ? (
          <SourceHomeCoverImage
            uri={link.imageUrl}
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
  source,
  importingKey,
  strings,
  onPressManga,
  onListingPress,
  onOpenLink,
}: {
  component: HomeComponent;
  links: HomeLink[];
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
  const showScrollerSkeleton =
    !links.length && component.value.type === "scroller";

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
      <FlatList
        horizontal
        data={showScrollerSkeleton ? [] : links}
        keyExtractor={(link, index) => `${link.title}:${index}`}
        ListEmptyComponent={showScrollerSkeleton ? HomeScrollerSkeletonItems : null}
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
        style={styles.edgeScroller}
        contentContainerStyle={styles.horizontalContent}
        windowSize={5}
      />
    </View>
  );
});

function FeaturedSectionSkeleton() {
  const { tokens } = useNemuTheme();
  const { width: windowWidth } = useWindowDimensions();
  const skeletonColor = tokens.muted;
  const subtleSkeletonColor = tokens.sourceIconGlass;
  const cardWidth = getMobileFeaturedCardWidth(windowWidth);

  return (
    <View style={styles.featuredCarousel}>
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
  source,
  importingKey,
  strings,
  onPressManga,
}: {
  component: HomeComponent;
  entries: MobileLiveSearchManga[];
  source: SearchSourceDisplay;
  importingKey: string | null;
  strings: MobileStrings;
  onPressManga: (
    source: SearchSourceDisplay,
    manga: MobileLiveSearchManga,
  ) => void;
}) {
  const { tokens } = useNemuTheme();
  const { width: windowWidth } = useWindowDimensions();
  const pagerRef = useRef<ScrollView | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const featuredEntries = getMobileSourceHomeFeaturedEntries(entries);
  if (!featuredEntries.length) {
    return (
      <View style={styles.homeSection}>
        <SectionHeader
          title={component.title}
          subtitle={component.subtitle}
          strings={strings}
          onListingPress={() => {}}
        />
        <FeaturedSectionSkeleton />
      </View>
    );
  }
  const selectedIndex = getMobileSourceHomeFeaturedCarouselIndex(
    featuredEntries,
    currentIndex,
  );
  const cardWidth = getMobileFeaturedCardWidth(windowWidth);
  const handleMomentumEnd = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const nextIndex = getMobileSourceHomeFeaturedCarouselIndex(
      featuredEntries,
      Math.round(event.nativeEvent.contentOffset.x / cardWidth),
    );
    setCurrentIndex(nextIndex);
  };

  return (
    <View style={styles.homeSection}>
      <SectionHeader
        title={component.title}
        subtitle={component.subtitle}
        strings={strings}
        onListingPress={() => {}}
      />
      <View style={styles.featuredCarousel}>
        <ScrollView
          ref={pagerRef}
          horizontal
          pagingEnabled
          decelerationRate="fast"
          disableIntervalMomentum
          onMomentumScrollEnd={handleMomentumEnd}
          showsHorizontalScrollIndicator={false}
          style={[styles.featuredPager, { width: cardWidth }]}
        >
          {featuredEntries.map((item, index) => {
            const resultKey = sourceMangaKey(source, item);
            const disabled = importingKey === resultKey;
            return (
              <View
                key={`${item.id}:${index}`}
                style={[styles.featuredPage, { width: cardWidth }]}
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
                    {item.cover ? (
                      <SourceHomeCoverImage
                        uri={item.cover}
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
                        x: cardWidth * index,
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
  ranking,
  showInlinePills,
}: {
  count: number;
  ranking?: boolean;
  showInlinePills?: boolean;
}) {
  const { tokens } = useNemuTheme();
  const skeletonColor = tokens.muted;
  const subtleSkeletonColor = tokens.sourceIconGlass;

  return (
    <>
      {Array.from({ length: count }).map((_, item) => (
        <View
          key={item}
          style={[styles.listRow, { borderColor: tokens.border }]}
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
    </>
  );
}

const MangaListSection = memo(function MangaListSection({
  component,
  links,
  ranking,
  pageSize,
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
  const displayed = pageSize ? links.slice(0, pageSize) : links;
  const isEmpty = displayed.length === 0;
  const skeletonCount = getMobileSourceHomeListSkeletonCount(pageSize);

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
      <View style={styles.listStack}>
        {isEmpty ? (
          <HomeListSkeletonRows
            count={skeletonCount}
            ranking={ranking}
            showInlinePills
          />
        ) : (
          displayed.map((link, index) => {
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
                style={[styles.listRow, { borderColor: tokens.border }]}
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
                    {
                      backgroundColor: tokens.muted,
                      borderColor: tokens.coverBorder,
                    },
                  ]}
                >
                  {manga.cover ? (
                    <SourceHomeCoverImage
                      uri={manga.cover}
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
              </NemuPressable>
            );
          })
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
      style={[styles.listRow, { borderColor: tokens.border }]}
    >
      {rank ? (
        <Text style={[styles.rankText, { color: tokens.mutedForeground }]}>
          {rank}
        </Text>
      ) : null}
      <View
        style={[
          styles.listCover,
          { backgroundColor: tokens.muted, borderColor: tokens.coverBorder },
        ]}
      >
        {link.imageUrl ? (
          <SourceHomeCoverImage
            uri={link.imageUrl}
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
  source,
  strings,
  onPressManga,
  onListingPress,
}: {
  component: HomeComponent;
  entries: MangaWithChapter[];
  pageSize?: number;
  source: SearchSourceDisplay;
  strings: MobileStrings;
  onPressManga: (
    source: SearchSourceDisplay,
    manga: MobileLiveSearchManga,
  ) => void;
  onListingPress: (listing: Listing) => void;
}) {
  const { tokens } = useNemuTheme();
  const displayed = pageSize ? entries.slice(0, pageSize) : entries;
  const isEmpty = displayed.length === 0;
  const skeletonCount = getMobileSourceHomeListSkeletonCount(pageSize);

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
      <View style={styles.listStack}>
        {isEmpty ? (
          <HomeListSkeletonRows count={skeletonCount} />
        ) : (
          displayed.map((entry, index) => {
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
                style={[styles.listRow, { borderColor: tokens.border }]}
              >
                <View
                  style={[
                    styles.listCover,
                    {
                      backgroundColor: tokens.muted,
                      borderColor: tokens.coverBorder,
                    },
                  ]}
                >
                  {manga.cover ? (
                    <SourceHomeCoverImage
                      uri={manga.cover}
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
              </NemuPressable>
            );
          })
        )}
      </View>
    </View>
  );
});

const BannerSection = memo(function BannerSection({
  component,
  links,
  source,
  importingKey,
  strings,
  onPressManga,
  onListingPress,
  onOpenLink,
}: {
  component: HomeComponent;
  links: HomeLink[];
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
  const value = component.value;
  const cardSize =
    value.type === "imageScroller"
      ? getMobileSourceHomeImageScrollerCardSize({
          width: value.width,
          height: value.height,
        })
      : getMobileSourceHomeImageScrollerCardSize({});

  return (
    <View style={styles.homeSection}>
      <SectionHeader
        title={component.title}
        subtitle={component.subtitle}
        strings={strings}
        onListingPress={onListingPress}
      />
      <FlatList
        horizontal
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
              {link.imageUrl ? (
                <SourceHomeCoverImage
                  uri={link.imageUrl}
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
        style={styles.edgeScroller}
        contentContainerStyle={styles.bannerContent}
        windowSize={5}
      />
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
  const skeletonOpacity = useSkeletonPulse(reduceMotion === true);
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
      style={[styles.homeSkeletonStack, { opacity: skeletonOpacity }]}
    >
      <View style={styles.homeSkeletonSection}>
        <View
          style={[styles.homeSkeletonTitle, { backgroundColor: skeletonColor }]}
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.edgeScroller}
          contentContainerStyle={styles.horizontalContent}
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
              style={[styles.listRow, { borderColor: tokens.border }]}
            >
              <View
                style={[
                  styles.listCover,
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
  sectionSubtitle: {
    marginTop: 1,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: nemuFontWeight.regular,
  },
  edgeScroller: {
    marginHorizontal: -18,
  },
  horizontalContent: {
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 2,
  },
  featuredCarousel: {
    alignItems: "center",
    gap: 14,
    paddingVertical: 2,
  },
  featuredPager: {
    overflow: "hidden",
  },
  featuredPage: {
    alignItems: "center",
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
    paddingHorizontal: 18,
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
