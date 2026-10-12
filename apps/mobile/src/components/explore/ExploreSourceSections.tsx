import { ScrollView, StyleSheet } from "react-native";
import type { MobilePageBleedStyles } from "@/lib/mobilePageGutters";
import { getMobileSourceListingLabel } from "@/lib/mobileSourceListingsPresentation";
import type { SourcePackageListing } from "@/data/schema";
import { nemuFontWeight, NemuPressable, NemuText, useNemuTheme } from "@/design-system";
import { ExploreGlass } from "./ExploreGlass";

const HOME = "\u0000home";

/**
 * One section as its own Liquid Glass capsule (interactive on iOS 26+, a
 * translucent pill elsewhere). The selected one takes the accent tint, the
 * same selection colour as Shelf | Grid; the others are plain glass. Native
 * capsule metrics: 40pt tall, 16pt label.
 */
function GlassTab({
  label,
  selected,
  disabled,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const { tokens } = useNemuTheme();
  return (
    <ExploreGlass interactive tintColor={selected ? tokens.primary : undefined} style={styles.tab}>
      <NemuPressable
        accessibilityRole="tab"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ selected, disabled }}
        disabled={disabled}
        hapticFeedback={selected ? "none" : "selection"}
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
  if (entries.length < 2) return null;
  return (
    // Sits inside the page's bleeding tab frame: its padding puts the first capsule on the gutter.
    <ScrollView
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

const TAB_HEIGHT = 40;

const styles = StyleSheet.create({
  // Room for the glass's own shadow above and below the capsules.
  row: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  tab: { height: TAB_HEIGHT },
  fill: { flex: 1 },
  tabInner: { height: TAB_HEIGHT, paddingHorizontal: 18, alignItems: "center", justifyContent: "center" },
  tabText: { fontSize: 16, lineHeight: 21, fontWeight: nemuFontWeight.semibold },
});
