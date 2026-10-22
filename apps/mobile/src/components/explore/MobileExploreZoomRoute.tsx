import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { StyleSheet } from "react-native";
import { mobileDesignExploreFlag } from "@/lib/mobileDesignExplore";
import {
  ZoomTarget,
  zoomSettledEventAvailable,
  zoomTransitionAvailable,
} from "../../../modules/nemu-window-layout";
import { MobileExploreZoomLandedContext } from "./mobileExploreZoomLanded";

/**
 * How long a screen waits for its zoom to land before it finishes itself
 * anyway: a binary without the native event gets roughly the zoom's length,
 * one with it only needs a backstop for an event that never comes.
 */
const SETTLE_FALLBACK_MS = zoomSettledEventAvailable ? 1200 : 480;

/**
 * Wraps a route that can be opened by a cover zoom (`zoomId` from the `zoom`
 * route param): mounts the zoom target with the route's first commit, which
 * is the one the stack pushes, and tells the screen when the zoom has landed.
 * Without the flag or the param it renders `children` and nothing else.
 */
export function MobileExploreZoomRoute({
  zoomId,
  interactiveDismiss = true,
  onLanded,
  children,
}: {
  zoomId?: string | null;
  /**
   * Called once, synchronously, from the landing event itself — before the
   * re-render that tells the screen (`useMobileExploreZoomLanded`), which can
   * be a heavy one. Start UI-thread work here.
   */
  onLanded?: () => void;
  /** Swipe-to-dismiss back into the source (off for the reader: page turns own its gestures). */
  interactiveDismiss?: boolean;
  children: ReactNode;
}) {
  const zooms = mobileDesignExploreFlag && Boolean(zoomId);
  const staged = zooms && zoomTransitionAvailable;
  const [landed, setLanded] = useState(!staged);
  const onLandedRef = useRef(onLanded);
  onLandedRef.current = onLanded;
  const notifiedRef = useRef(false);
  const settle = useCallback(() => {
    if (!notifiedRef.current) {
      notifiedRef.current = true;
      onLandedRef.current?.();
    }
    setLanded(true);
  }, []);
  useEffect(() => {
    if (landed) return;
    const timer = setTimeout(settle, SETTLE_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [landed, settle]);

  return (
    <MobileExploreZoomLandedContext.Provider value={landed}>
      {children}
      {zooms && zoomId ? (
        <ZoomTarget
          zoomId={zoomId}
          align={false}
          interactiveDismiss={interactiveDismiss}
          onZoomSettled={settle}
          style={styles.target}
        />
      ) : null}
    </MobileExploreZoomLandedContext.Provider>
  );
}

const styles = StyleSheet.create({
  target: {
    position: "absolute",
    width: 0,
    height: 0,
  },
});
