import { ScrollView, StyleSheet, View } from "react-native";
import type { MobilePageBleedStyles } from "@/lib/mobilePageGutters";
import { getMobileSourceListingLabel } from "@/lib/mobileSourceListingsPresentation";
import type { SourcePackageListing } from "@/data/schema";
import { ExploreGlassSegmented } from "./ExploreGlassSegmented";

const HOME = "\u0000home";
/** More sections than fit a phone row scroll sideways instead of squeezing. */
const SCROLL_FROM = 4;

/**
 * The source page's sections (Home, Popular, Recent, ...) as the library's
 * glass segmented control: same component, same Liquid Glass lens.
 */
export function SourceListingSegments({
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
  const options = [
    ...(homeLabel ? [{ value: HOME, label: homeLabel }] : []),
    ...listings.map((listing) => ({ value: listing.id, label: getMobileSourceListingLabel(listing) })),
  ];
  const control = (
    <ExploreGlassSegmented
      accessibilityLabel={accessibilityLabel}
      options={options}
      value={homeSelected ? HOME : (selectedListingId ?? options[0]?.value ?? HOME)}
      onChange={(value) => {
        if (value === HOME) {
          if (homeEnabled) onSelectHome();
          return;
        }
        const listing = listings.find((item) => item.id === value);
        if (listing) onSelectListing(listing);
      }}
    />
  );
  if (options.length < 2) return null;
  // Sits inside the page's bleeding tab frame: its padding puts the control on the gutter.
  if (options.length >= SCROLL_FROM + 1) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} scrollsToTop={false} contentContainerStyle={bleed.content}>
        {control}
      </ScrollView>
    );
  }
  return <View style={[styles.row, bleed.content]}>{control}</View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: "row" },
});
