import { useMemo } from "react";
import { useMobilePageBleedStyles } from "@/design-system";
import { getMobileExploreRowBleed, type MobileExploreRowBleed } from "@/lib/mobileExploreRowBleed";
import { useMobileAdaptiveLayout } from "@/lib/MobileWindowLayoutContext";

/**
 * Edge-bleed for a design-explore row, read live from the window: which side
 * (if any) holds the system's vertical bar changes with the display in use
 * and the rotation, so nothing here is stored.
 */
export function useMobileExploreRowBleed(): MobileExploreRowBleed {
  const bleed = useMobilePageBleedStyles();
  const { verticalBarSide } = useMobileAdaptiveLayout();
  return useMemo(() => getMobileExploreRowBleed(bleed, verticalBarSide), [bleed, verticalBarSide]);
}
