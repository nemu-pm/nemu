import { useMobilePageGutters, useNemuTheme } from "@/design-system";
import { mobileDesignExploreFlag } from "@/lib/mobileDesignExplore";

/**
 * The page colour behind a skeleton the shimmer sweeps (design-explore),
 * reaching into the page gutters as the sweep does (its rails bleed to the
 * screen edge): the sweep dodges against this colour, and over a bare gutter
 * it painted a grey block. The content box does not move (negative margin,
 * equal padding). Null with the flag off.
 */
export function useExploreShimmerBackdrop() {
  const { tokens } = useNemuTheme();
  const gutters = useMobilePageGutters();
  if (!mobileDesignExploreFlag) return null;
  return {
    backgroundColor: tokens.background,
    marginLeft: -gutters.left,
    marginRight: -gutters.right,
    paddingLeft: gutters.left,
    paddingRight: gutters.right,
  };
}
