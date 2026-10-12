import { createContext, useContext } from "react";

/** Provided by `MobileExploreZoomRoute`; true outside a zoomed route. */
export const MobileExploreZoomLandedContext = createContext(true);

/**
 * False while the cover zoom that opens this screen is still running. The
 * zoom is animated in the app's own process, so anything heavy the pushed
 * screen mounts on the main thread before it lands is time the zoom stands
 * still (or is skipped altogether). A screen draws what the zoom shows in its
 * first commit and holds the rest until this turns true. Always true outside
 * a zoomed route.
 */
export function useMobileExploreZoomLanded(): boolean {
  return useContext(MobileExploreZoomLandedContext);
}
