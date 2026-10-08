import { mobileDesignExploreBooted } from "./mobileDesignExploreBoot";

/**
 * Design-explore prototypes (cover-tinted continue-reading cards, the
 * Books-style detail, the wall-shelf library, collection folders, cover zoom transitions). Off unless the reader turns on
 * Settings → Experimental Design → New design (preview); read once when the app starts
 * (`mobileDesignExploreSwitch`), so a change applies after a restart.
 * `EXPO_PUBLIC_NEMU_DESIGN_EXPLORE=1` makes it the default (dev builds,
 * captures) without locking the switch. iOS only; they adapt to compact,
 * regular-width, landscape and folded windows themselves. Android keeps the
 * current UI.
 */
export const mobileDesignExploreFlag = mobileDesignExploreBooted;

/** True when the prototypes should render. */
export function useMobileDesignExplore(): boolean {
  return mobileDesignExploreFlag;
}
