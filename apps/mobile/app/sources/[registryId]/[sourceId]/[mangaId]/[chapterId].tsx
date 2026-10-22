import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { MobileExploreZoomRoute } from "@/components/explore/MobileExploreZoomRoute";
import { useMobileExploreZoomLanded } from "@/components/explore/mobileExploreZoomLanded";
import { ReaderZoomEntryContext, type ReaderZoomEntry } from "@/components/reader/readerZoomEntry";
import { useReadingMode } from "@/data/mobileHooks";
import { MobileCachedImage } from "@/design-system";
import { getMobileReaderZoomCoverFrame, peekMobileReaderZoomCover } from "@/lib/mobileReaderZoomHandoff";
import { ReaderScreen } from "@/screens/ReaderScreen";
import { ZoomTarget } from "../../../../../modules/nemu-window-layout";

/** The landing cover fades into the reader (the opening fade-in). */
const COVER_REVEAL_MS = 250;
/**
 * A page that is slow to load is not waited for any longer than this. The
 * reader's chrome draws over the cover, so it is usable meanwhile.
 */
const COVER_HOLD_MAX_MS = 5000;
/**
 * Scroll reading reveals no later than this after the zoom lands, ready or
 * not: its pages still loading show their dark plate, which reads as the
 * reader opening rather than the cover hanging. Paged reading has no plate
 * and keeps waiting for its page (up to `COVER_HOLD_MAX_MS`).
 */
const COVER_SCROLL_HOLD_MAX_MS = 600;

type CoverRevealReason = "reader-ready" | "scroll-cap" | "hold-max";

export default function ReaderRoute() {
  const { zoom } = useLocalSearchParams<{ zoom?: string }>();
  // Design-explore: the reader grows out of the cover that opened it. No
  // swipe-to-dismiss: page turns own the reader's gestures.
  return (
    <MobileExploreZoomRoute zoomId={zoom} interactiveDismiss={false}>
      <ReaderAfterZoom zoomId={zoom ?? null} />
    </MobileExploreZoomRoute>
  );
}

/**
 * The reader is far too heavy to mount in the commit a zoom pushes, so the
 * zoom lands on the tapped cover, laid out where the first page will be, and
 * the reader mounts underneath once it has landed; the cover fades into the
 * reader once it is ready to show (scroll reading: placed at the reading
 * position; paged: the page on screen drawn — see `readerZoomPageShown`).
 * Outside a zoom this is the reader and nothing else.
 */
function ReaderAfterZoom({ zoomId }: { zoomId: string | null }) {
  const landed = useMobileExploreZoomLanded();
  const [cover] = useState(() => peekMobileReaderZoomCover(zoomId));
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const frame = getMobileReaderZoomCoverFrame({ width: window.width, height: window.height, insets });
  const opacity = useSharedValue(1);
  const { mode, modeLoaded } = useReadingMode();
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const [pageShown, setPageShown] = useState(false);
  const revealedRef = useRef(false);
  const landedAtRef = useRef<number | null>(null);
  const reveal = useCallback((reason: CoverRevealReason) => {
    if (revealedRef.current) return;
    revealedRef.current = true;
    const landedAt = landedAtRef.current;
    console.info("[reader-zoom] fade-start", {
      reason,
      sinceLandedMs: landedAt == null ? null : Math.round(Date.now() - landedAt),
      mode: modeRef.current,
    });
    setPageShown(true);
  }, []);
  const onFirstPage = useCallback(() => reveal("reader-ready"), [reveal]);
  useEffect(() => {
    if (!landed || landedAtRef.current != null) return;
    landedAtRef.current = Date.now();
    console.info("[reader-zoom] landed");
  }, [landed]);
  useEffect(() => {
    if (!landed || pageShown) return;
    const timer = setTimeout(() => reveal("hold-max"), COVER_HOLD_MAX_MS);
    return () => clearTimeout(timer);
  }, [landed, pageShown, reveal]);
  useEffect(() => {
    if (!landed || pageShown || !modeLoaded || mode !== "scrolling") return;
    const sinceLanded = Date.now() - (landedAtRef.current ?? Date.now());
    const timer = setTimeout(
      () => reveal("scroll-cap"),
      Math.max(0, COVER_SCROLL_HOLD_MAX_MS - sinceLanded),
    );
    return () => clearTimeout(timer);
  }, [landed, mode, modeLoaded, pageShown, reveal]);
  useEffect(() => {
    if (pageShown) opacity.value = withTiming(0, { duration: COVER_REVEAL_MS });
  }, [opacity, pageShown]);
  const entry = useMemo<ReaderZoomEntry>(() => ({ onFirstPage }), [onFirstPage]);
  const coverStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <View style={styles.backdrop}>
      {landed ? (
        <ReaderZoomEntryContext.Provider value={entry}>
          <ReaderScreen />
        </ReaderZoomEntryContext.Provider>
      ) : null}
      {cover && zoomId ? (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, coverStyle]}>
          {/* Where the zoom lands: the cover grows into this frame. Hidden
              once the page shows, it still names where the zoom back starts. */}
          <ZoomTarget
            zoomId={zoomId}
            style={{ position: "absolute", left: frame.x, top: frame.y, width: frame.width, height: frame.height }}
          >
            <MobileCachedImage
              uriOwnership="source"
              cacheKind="cover"
              source={cover}
              // No fade inside the native zoom target.
              fadeIn={false}
              fallback={null}
              resizeMode="cover"
              style={StyleSheet.absoluteFill}
            />
          </ZoomTarget>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // The reader's page background.
  backdrop: {
    flex: 1,
    backgroundColor: "#000000",
  },
});
