import { MOBILE_EXPLORE_RADIUS as R } from "@/lib/mobileExploreRadius";
import { useState } from "react";
import { StyleSheet, useWindowDimensions, View, type LayoutChangeEvent } from "react-native";
import { createNemuShadowStyle, radius, useNemuTheme } from "@/design-system";
import { getMobileContinueCardGeometry, getMobileContinueCardVariant } from "@/lib/mobileContinueCardGeometry";
import { getMobileExploreSkeletonCardHeight } from "@/lib/mobileExploreSkeleton";
import { MOBILE_MANGA_GRID_GAP } from "@/lib/mobileAdaptiveGrid";
import { mobileFoldAwareGridCellStyle } from "@/lib/mobileFoldAwareGrid";
import { MOBILE_SHELF } from "@/lib/mobileLibraryShelf";
import { useMobileFoldAwareGrid } from "@/lib/useMobileFoldAwareGrid";
import { useSkeletonDisplayDelay } from "@/lib/useSkeletonPulse";
import { ExploreShimmerSweep } from "./ExploreShimmerSweep";
import { useExploreShimmerBackdrop } from "./useExploreShimmerBackdrop";
import { useMobileExploreRowBleed } from "./useMobileExploreRowBleed";

const NO_INSETS = { left: 0, right: 0 };
/** The neighbour card rests turned back and smaller, like the carousel's. */
const NEIGHBOUR_SCALE = 0.92;
/** The Continue card's padding around its button. */
const CARD_PADDING = 16;

/**
 * The Library's cold-start placeholder in the design-explore layout: the
 * Continue Reading heading and its centred card with the next one peeking,
 * then a section heading and one row of covers standing on a plank, no title
 * lines under them (the shelf has none). The shipping skeleton was the
 * shipping grid (covers over three text bars), so the page changed shape the
 * moment the cards arrived. Blocks hold still; one shimmer sweep crosses
 * them (Reduce Motion: none, `ExploreShimmerSweep`).
 */
export function ExploreLibrarySkeleton({ accessibilityLabel }: { accessibilityLabel: string }) {
  const { tokens } = useNemuTheme();
  const { height: windowHeight } = useWindowDimensions();
  const shimmerBackdrop = useExploreShimmerBackdrop();
  const bleed = useMobileExploreRowBleed();
  const { ref: gridRef, onLayout: onGridLayout, ...grid } = useMobileFoldAwareGrid({ insets: NO_INSETS });
  const [frameWidth, setFrameWidth] = useState(0);
  const displayReady = useSkeletonDisplayDelay(150);
  if (!displayReady) return null;

  const variant = getMobileContinueCardVariant("tall", windowHeight);
  const geometry = getMobileContinueCardGeometry({
    frameWidth,
    gutterLeft: bleed.content.paddingLeft,
    gutterRight: bleed.content.paddingRight,
    count: 2,
    variant,
  });
  const cardHeight = getMobileExploreSkeletonCardHeight(geometry.cardWidth, variant);
  const block = { backgroundColor: tokens.muted };
  const cardShadow = createNemuShadowStyle({ color: tokens.shadow, offsetY: 10, radius: 24, elevation: 6 });
  const onFrameLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    setFrameWidth((current) => (current === next ? current : next));
  };

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="progressbar"
      style={[styles.stack, shimmerBackdrop]}
    >
      <View style={[styles.heading, styles.headingWide, block]} />
      <View onLayout={onFrameLayout} style={[bleed.frame, styles.cardRow, { height: cardHeight }]}>
        {geometry.cardWidth > 0
          ? [0, 1].map((index) => (
              <View
                key={index}
                style={[
                  styles.card,
                  cardShadow,
                  block,
                  {
                    left: geometry.paddingLeft + index * geometry.interval,
                    width: geometry.cardWidth,
                    height: cardHeight,
                  },
                  index > 0 ? { transform: [{ scale: NEIGHBOUR_SCALE }] } : null,
                ]}
              >
                <View
                  style={[
                    styles.cardButton,
                    { backgroundColor: tokens.background, opacity: 0.55 },
                  ]}
                />
              </View>
            ))
          : null}
      </View>
      <View style={[styles.heading, styles.headingNarrow, block]} />
      <View ref={gridRef} onLayout={onGridLayout} collapsable={false} style={styles.shelf}>
        <View style={styles.row}>
          {Array.from({ length: grid.columns }, (_, column) => (
            <View key={column} style={mobileFoldAwareGridCellStyle(grid, column)}>
              <View style={[styles.cover, block, { borderColor: tokens.coverBorder }]} />
            </View>
          ))}
        </View>
        <View style={[styles.plank, { backgroundColor: tokens.border }]} />
      </View>
      <ExploreShimmerSweep />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 16,
  },
  heading: {
    height: 22,
    borderRadius: R.hair,
  },
  headingWide: {
    width: 180,
  },
  headingNarrow: {
    width: 110,
    marginTop: 12,
  },
  cardRow: {
    position: "relative",
  },
  card: {
    position: "absolute",
    top: 0,
    borderRadius: R.card,
    justifyContent: "flex-end",
    padding: CARD_PADDING,
  },
  // The Continue capsule.
  cardButton: {
    height: 46,
    borderRadius: radius.pill,
  },
  shelf: {
    gap: MOBILE_MANGA_GRID_GAP,
    paddingTop: MOBILE_SHELF.headroom - 16,
  },
  row: {
    flexDirection: "row",
  },
  cover: {
    aspectRatio: 2 / 3,
    borderRadius: R.thumb,
    borderWidth: StyleSheet.hairlineWidth,
  },
  plank: {
    height: MOBILE_SHELF.plankTop + MOBILE_SHELF.plankFront,
    marginTop: -MOBILE_MANGA_GRID_GAP,
    marginHorizontal: -MOBILE_SHELF.overhang,
    borderRadius: R.hair,
  },
});
