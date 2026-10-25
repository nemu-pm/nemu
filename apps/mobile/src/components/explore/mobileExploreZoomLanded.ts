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

/**
 * When the zoom opening this screen lands (wall clock ms: its native start +
 * nominal duration), once its start event has arrived; null before that and
 * outside a zoomed route. A screen can time work against the visible landing
 * rather than the landing event (`useMobileExploreZoomLanded`), which reaches
 * JS a little after it.
 */
export const MobileExploreZoomLandsAtContext = createContext<number | null>(null);

export function useMobileExploreZoomLandsAt(): number | null {
  return useContext(MobileExploreZoomLandsAtContext);
}
