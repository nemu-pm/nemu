import { mobileDesignExploreBooted } from "./mobileDesignExploreBoot";

/**
 * The design (the Books-style detail, the Library grid, collections, zoom
 * transitions): always on iOS, never on Android or web.
 */
export const mobileDesignExploreFlag = mobileDesignExploreBooted;

/** True when the prototypes should render. */
export function useMobileDesignExplore(): boolean {
  return mobileDesignExploreFlag;
}
