import { useEffect, useRef } from "react";
import { ScrollView, StyleSheet, View, type LayoutRectangle, type ScrollViewInstance } from "react-native";
import { ExploreShimmerSweep } from "./ExploreShimmerSweep";
import type { MobilePageBleedStyles } from "@/lib/mobilePageGutters";
import { getMobileSourceListingLabel, getMobileTabRevealOffset } from "@/lib/mobileSourceListingsPresentation";
import type { SourcePackageListing } from "@/data/schema";
import { nemuFontWeight, NemuPressable, NemuText, useNemuTheme } from "@/design-system";
import { ExploreGlass } from "./ExploreGlass";

const HOME = "\u0000home";

/**
 * One section as its own Liquid Glass capsule (interactive on iOS 26+, a
 * translucent pill elsewhere). The selected one takes the accent tint, the
 * same selection colour as Shelf | Grid; the others are plain glass. Native
 * capsule metrics: 28pt tall, 13pt label.
 */
function GlassTab({
  label,
  selected,
  disabled,
  onPress,
  onLayout,
  accessibilityLabel,
}: {
  label: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
  onLayout: (layout: LayoutRectangle) => void;
  accessibilityLabel: string;
}) {
  const { tokens } = useNemuTheme();
  return (
    <View onLayout={(event) => onLayout(event.nativeEvent.layout)}>
    <ExploreGlass interactive tintColor={selected ? tokens.primary : undefined} style={styles.tab}>
      <NemuPressable
        accessibilityRole="tab"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ selected, disabled }}
        disabled={disabled}
        hapticFeedback={selected ? "none" : "selection"}
        hitSlop={8}
        pressedScale={0.97}
        onPress={onPress}
        containerStyle={styles.fill}
        style={styles.tabInner}
      >
        <NemuText
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
          color={selected ? tokens.primaryForeground : tokens.foreground}
          style={styles.tabText}
        >
          {label}
        </NemuText>
      </NemuPressable>
    </ExploreGlass>
    </View>
  );
}

/**
 * The source page's sections (Home, Popular, Recent, ...) as separate glass
 * capsules in a row with gaps, scrolling sideways when they do not fit.
 */
export function SourceListingTabs({
  homeLabel,
  homeSelected,
  homeEnabled,
  listings,
  selectedListingId,
  accessibilityLabel,
  onSelectHome,
  onSelectListing,
  bleed,
}: {
  /** Null when the source has no home page. */
  homeLabel: string | null;
  homeSelected: boolean;
  homeEnabled: boolean;
  listings: SourcePackageListing[];
  selectedListingId: string | null;
  accessibilityLabel: string;
  onSelectHome: () => void;
  onSelectListing: (listing: SourcePackageListing) => void;
  bleed: MobilePageBleedStyles;
}) {
  const entries = [
    ...(homeLabel ? [{ id: HOME, label: homeLabel, selected: homeSelected }] : []),
    ...listings.map((listing) => ({
      id: listing.id,
      label: getMobileSourceListingLabel(listing),
      selected: !homeSelected && listing.id === selectedListingId,
    })),
  ];
  // The selected capsule scrolls into view when it is (partly) off the row,
  // as a See All listing's tab at the end of a full row is.
  const scrollRef = useRef<ScrollViewInstance | null>(null);
  const frames = useRef(new Map<string, LayoutRectangle>());
  const viewportWidth = useRef(0);
  const offset = useRef(0);
  const selectedId = entries.find((entry) => entry.selected)?.id ?? null;
  const revealSelected = (animated: boolean) => {
    const frame = selectedId === null ? undefined : frames.current.get(selectedId);
    const target = frame && getMobileTabRevealOffset({
      start: frame.x,
      end: frame.x + frame.width,
      offset: offset.current,
      viewport: viewportWidth.current,
      inset: bleed.content.paddingLeft,
    });
    if (target !== null && target !== undefined) scrollRef.current?.scrollTo({ x: target, animated });
  };
  useEffect(() => {
    revealSelected(true);
    // Only when the selection moves; layouts reveal a capsule that lands later.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);
  if (entries.length < 2) return null;
  return (
    // Sits inside the page's bleeding tab frame: its padding puts the first capsule on the gutter.
    <ScrollView
      ref={scrollRef}
      onLayout={(event) => {
        viewportWidth.current = event.nativeEvent.layout.width;
      }}
      onScroll={(event) => {
        offset.current = event.nativeEvent.contentOffset.x;
      }}
      scrollEventThrottle={32}
      horizontal
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      showsHorizontalScrollIndicator={false}
      scrollsToTop={false}
      contentContainerStyle={[styles.row, bleed.content]}
    >
      {entries.map((entry) => (
        <GlassTab
          key={entry.id}
          onLayout={(layout) => {
            frames.current.set(entry.id, layout);
            if (entry.selected) revealSelected(true);
          }}
          label={entry.label}
          accessibilityLabel={entry.label}
          selected={entry.selected}
          disabled={entry.id === HOME && !homeEnabled && !entry.selected}
          onPress={() => {
            if (entry.selected) return;
            if (entry.id === HOME) {
              if (homeEnabled) onSelectHome();
              return;
            }
            const listing = listings.find((item) => item.id === entry.id);
            if (listing) onSelectListing(listing);
          }}
        />
      ))}
    </ScrollView>
  );
}

const PLACEHOLDER_TAB_WIDTHS = [58, 72, 64, 80, 66] as const;

/**
 * The tab row while its tabs are still on their way: the same row box with
 * still capsules under the skeleton's shared shimmer (like the home skeleton
 * below it), so the page under it is already where it will stay.
 */
export function SourceListingTabsPlaceholder({
  count,
  bleed,
}: {
  count: number;
  bleed: MobilePageBleedStyles;
}) {
  const { tokens } = useNemuTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.row, styles.placeholderRow, bleed.content, { backgroundColor: tokens.background }]}
    >
      {Array.from({ length: Math.min(count, PLACEHOLDER_TAB_WIDTHS.length) }, (_, index) => (
        <View
          key={index}
          style={[styles.tab, styles.placeholderTab, { width: PLACEHOLDER_TAB_WIDTHS[index], backgroundColor: tokens.muted }]}
        />
      ))}
      <ExploreShimmerSweep />
    </View>
  );
}

const TAB_HEIGHT = 28;

const styles = StyleSheet.create({
  // Room for the glass's own shadow above and below the capsules.
  row: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  tab: { height: TAB_HEIGHT },
  // The capsules sit where the scrolling row's first ones will, clipped like it.
  placeholderRow: { overflow: "hidden" },
  placeholderTab: { borderRadius: TAB_HEIGHT / 2, flexShrink: 0 },
  fill: { flex: 1 },
  tabInner: { height: TAB_HEIGHT, paddingHorizontal: 11, alignItems: "center", justifyContent: "center" },
  tabText: { fontSize: 13, lineHeight: 17, fontWeight: nemuFontWeight.semibold },
});
