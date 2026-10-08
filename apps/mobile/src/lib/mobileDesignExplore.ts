import { mobileDesignExploreBooted } from "./mobileDesignExploreBoot";

/**
 * Design-explore prototypes (the cover-tinted cards, the Books-style detail, the shelf, collections,
 * zoom transitions). Off unless the reader turns on the switch in
 * Settings → Experimental Design; iOS only.
 */
export const mobileDesignExploreFlag = mobileDesignExploreBooted;

/** True when the prototypes should render. */
export function useMobileDesignExplore(): boolean {
  return mobileDesignExploreFlag;
}
