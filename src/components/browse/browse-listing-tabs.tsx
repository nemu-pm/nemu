import { useTranslation } from "react-i18next";
import { HugeiconsIcon } from "@hugeicons/react";
import { Home11Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";

/** Generic listing interface - works for both Aidoku and Tachiyomi */
export interface GenericListing {
  id: string;
  name: string;
}

interface BrowseListingTabsProps {
  listings: GenericListing[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  /** If true, index 0 is "Home" and listings start at index 1 */
  showHomeTab?: boolean;
}

export function BrowseListingTabs({
  listings,
  selectedIndex,
  onSelect,
  showHomeTab = false,
}: BrowseListingTabsProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap gap-2">
      {/* Home button (only if showHomeTab is true) */}
      {showHomeTab && (
        <Button
          variant={selectedIndex === 0 ? "default" : "outline"}
          size="sm"
          onClick={() => onSelect(0)}
        >
          <HugeiconsIcon icon={Home11Icon} className="mr-1.5 size-4" />
          {t("browse.home")}
        </Button>
      )}
      {/* Listing buttons */}
      {listings.map((listing, index) => {
        const buttonIndex = showHomeTab ? index + 1 : index;
        const isSelected = selectedIndex === buttonIndex;
        // Translate known listing IDs, fallback to raw name
        const displayName = t(`browse.listing.${listing.id}`, { defaultValue: listing.name });
        return (
          <Button
            key={listing.id}
            variant={isSelected ? "default" : "outline"}
            size="sm"
            onClick={() => onSelect(buttonIndex)}
          >
            {displayName}
          </Button>
        );
      })}
    </div>
  );
}

