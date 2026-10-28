import { mobileDesignExploreBooted } from "./mobileDesignExploreBoot";

/**
 * Design-explore prototypes (the Books-style detail, the Library grid, collections,
 * zoom transitions). On by default on iOS; a reader who turned it off in
 * Settings → Experimental Design keeps it off.
 */
export const mobileDesignExploreFlag = mobileDesignExploreBooted;

/** True when the prototypes should render. */
export function useMobileDesignExplore(): boolean {
  return mobileDesignExploreFlag;
}
