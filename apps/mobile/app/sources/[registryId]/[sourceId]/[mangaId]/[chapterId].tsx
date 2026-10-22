import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { MobileExploreZoomRoute } from "@/components/explore/MobileExploreZoomRoute";
import { useMobileExploreZoomLanded } from "@/components/explore/mobileExploreZoomLanded";
import { ReaderZoomEntryContext, type ReaderZoomEntry } from "@/components/reader/readerZoomEntry";
import {
  createReaderOpeningGate,
  type ReaderOpeningGate,
  type ReaderOpeningSettleReason,
} from "@/components/reader/readerOpeningGate";
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
  const coverReveal = useReaderCoverReveal();
  // Design-explore: the reader grows out of the cover that opened it. No
  // swipe-to-dismiss: page turns own the reader's gestures.
  return (
    <MobileExploreZoomRoute zoomId={zoom} interactiveDismiss={false} onLanded={coverReveal.onLanded}>
      <ReaderAfterZoom zoomId={zoom ?? null} coverReveal={coverReveal} />
    </MobileExploreZoomRoute>
  );
}

type ReaderCoverReveal = {
  opacity: SharedValue<number>;
  /** The zoom landed (idempotent): scroll reading arms its UI-thread cap. */
  onLanded: () => void;
  /** Fade now, unless a fade already started. */
  reveal: (reason: CoverRevealReason) => void;
  /**
   * Closes when the cover's fade has ended (either path): the reader holds
   * its cache-painted chapter's live source refresh until then.
   */
  openingGate: ReaderOpeningGate;
};

/**
 * The landing cover's fade, driven on the UI thread: a busy JS thread (the
 * reader mounting, a cold start) must not stretch the hold past its cap nor
 * starve the fade. Scroll reading arms `withDelay(cap, withTiming(0))` the
 * moment the zoom lands (from the landing event, before the reader's heavy
 * render); "reader ready" earlier replaces it with the fade at once. Paged
 * reading waits for its page (JS), with the 5 s backstop.
 */
function useReaderCoverReveal(): ReaderCoverReveal {
  const opacity = useSharedValue(1);
  const { mode, modeLoaded } = useReadingMode();
  const scrollReading = modeLoaded && mode === "scrolling";
  const modeRef = useRef({ mode, scrollReading });
  modeRef.current = { mode, scrollReading };
  const landedAtRef = useRef<number | null>(null);
  /** When the (possibly delayed) fade begins, by the JS clock; null: none armed. */
  const fadeStartsAtRef = useRef<number | null>(null);
  const capArmedRef = useRef(false);
  const [openingGate] = useState(() =>
    createReaderOpeningGate({
      onSettled: (reason: ReaderOpeningSettleReason) => {
        const landedAt = landedAtRef.current;
        console.info("[reader-zoom] opening-settled", {
          reason,
          sinceLandedMs: landedAt == null ? null : Math.round(Date.now() - landedAt),
        });
      },
    }),
  );
  useEffect(() => () => openingGate.dispose(), [openingGate]);
  /** The fade's UI-thread completion, sent to JS: the opening window closes. */
  const onFadeEnd = useCallback(
    (reason: CoverRevealReason, landedAt: number) => {
      logFadeEnd(reason, landedAt);
      openingGate.settle("fade-end");
    },
    [openingGate],
  );

  const logFadeStart = useCallback((reason: CoverRevealReason, sinceLandedMs: number | null) => {
    console.info("[reader-zoom] fade-start", {
      reason,
      sinceLandedMs,
      mode: modeRef.current.mode,
    });
  }, []);

  const armScrollCap = useCallback(() => {
    const landedAt = landedAtRef.current;
    if (capArmedRef.current || landedAt == null || fadeStartsAtRef.current != null) return;
    capArmedRef.current = true;
    const delay = Math.max(0, COVER_SCROLL_HOLD_MAX_MS - (Date.now() - landedAt));
    fadeStartsAtRef.current = Date.now() + delay;
    // The fade itself starts on the UI clock; this logs when it was armed.
    console.info("[reader-zoom] fade-start", {
      reason: "scroll-cap",
      armed: true,
      delayMs: Math.round(delay),
      sinceLandedMs: Math.round(Date.now() - landedAt),
      mode: modeRef.current.mode,
    });
    opacity.value = withDelay(
      delay,
      withTiming(0, { duration: COVER_REVEAL_MS }, (finished?: boolean) => {
        "worklet";
        if (finished) runOnJS(onFadeEnd)("scroll-cap", landedAt);
      }),
    );
  }, [onFadeEnd, opacity]);

  const onLanded = useCallback(() => {
    if (landedAtRef.current != null) return;
    landedAtRef.current = Date.now();
    console.info("[reader-zoom] landed", { mode: modeRef.current.mode, atWall: landedAtRef.current });
    openingGate.armBackstop();
    if (modeRef.current.scrollReading) armScrollCap();
  }, [armScrollCap, openingGate]);

  // The stored mode can arrive after the landing: arm with the time left.
  useEffect(() => {
    if (scrollReading) armScrollCap();
  }, [armScrollCap, scrollReading]);

  const reveal = useCallback(
    (reason: CoverRevealReason) => {
      const landedAt = landedAtRef.current;
      const now = Date.now();
      const sinceLandedMs = landedAt == null ? null : Math.round(now - landedAt);
      const startsAt = fadeStartsAtRef.current;
      if (startsAt != null && startsAt <= now) {
        // The UI-thread cap's fade is already running: leave it be.
        return;
      }
      if (startsAt != null && reason !== "reader-ready") return;
      fadeStartsAtRef.current = now;
      logFadeStart(reason, sinceLandedMs);
      const fadeLandedAt = landedAt ?? now;
      opacity.value = withTiming(0, { duration: COVER_REVEAL_MS }, (finished?: boolean) => {
        "worklet";
        if (finished) runOnJS(onFadeEnd)(reason, fadeLandedAt);
      });
    },
    [logFadeStart, onFadeEnd, opacity],
  );

  return useMemo(
    () => ({ opacity, onLanded, reveal, openingGate }),
    [onLanded, opacity, reveal, openingGate],
  );
}

/** Logged when the cover's fade ends (it started `COVER_REVEAL_MS` before). */
function logFadeEnd(reason: CoverRevealReason, landedAt: number) {
  // JS clock: late by however long the JS thread was busy.
  console.info("[reader-zoom] fade-end", { reason, sinceLandedMs: Math.round(Date.now() - landedAt) });
}

/**
 * The reader is far too heavy to mount in the commit a zoom pushes, so the
 * zoom lands on the tapped cover, laid out where the first page will be, and
 * the reader mounts underneath once it has landed; the cover fades into the
 * reader once it is ready to show (scroll reading: placed at the reading
 * position, or `COVER_SCROLL_HOLD_MAX_MS` after landing at the latest — on
 * the UI thread; paged: the page on screen drawn — see `readerZoomPageShown`).
 * Outside a zoom this is the reader and nothing else.
 */
function ReaderAfterZoom({
  zoomId,
  coverReveal,
}: {
  zoomId: string | null;
  coverReveal: ReaderCoverReveal;
}) {
  const landed = useMobileExploreZoomLanded();
  const [cover] = useState(() => {
    const zoomCover = peekMobileReaderZoomCover(zoomId);
    // No cover fades in: the opening window is closed from the start. Settled
    // here, in the first render, because the reader's effects run before this
    // route's.
    if (!zoomCover || !zoomId) coverReveal.openingGate.settle("no-fade");
    return zoomCover;
  });
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const frame = getMobileReaderZoomCoverFrame({ width: window.width, height: window.height, insets });
  const { opacity, onLanded, reveal, openingGate } = coverReveal;
  const [pageShown, setPageShown] = useState(false);
  // A route that never staged a zoom (landed from the start) has no landing
  // event: count the first landed render as the landing.
  useEffect(() => {
    if (landed) onLanded();
  }, [landed, onLanded]);
  const onFirstPage = useCallback(() => {
    reveal("reader-ready");
    setPageShown(true);
  }, [reveal]);
  useEffect(() => {
    if (!landed || pageShown) return;
    const timer = setTimeout(() => {
      reveal("hold-max");
      setPageShown(true);
    }, COVER_HOLD_MAX_MS);
    return () => clearTimeout(timer);
  }, [landed, pageShown, reveal]);
  const entry = useMemo<ReaderZoomEntry>(
    () => ({ onFirstPage, openingGate }),
    [onFirstPage, openingGate],
  );
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
