import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Dimensions, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { MobileExploreZoomRoute } from "@/components/explore/MobileExploreZoomRoute";
import { useMobileExploreZoomLanded, useMobileExploreZoomLandsAt } from "@/components/explore/mobileExploreZoomLanded";
import {
  READER_OPENING_COLD_MOUNT_LEAD_MS,
  READER_OPENING_MOUNT_LEAD_MS,
  resolveReaderOpeningMountDelay,
} from "@/lib/mobileReaderChromeMotion";
import {
  ReaderOpeningHudHeldContext,
  ReaderZoomEntryContext,
  type ReaderZoomEntry,
} from "@/components/reader/readerZoomEntry";
import {
  getReaderOpeningLoadingLayout,
  isReaderChapterSwitchMount,
  readerOpeningLoadingFades,
  resolveReaderOpeningLoading,
  retainReaderRouteMount,
  READER_OPENING_LOADING_BACKSTOP_MS,
  READER_OPENING_LOADING_DELAY_MS,
} from "@/components/reader/readerOpeningLoading";
import {
  createReaderOpeningGate,
  type ReaderOpeningGate,
  type ReaderOpeningSettleReason,
} from "@/components/reader/readerOpeningGate";
import { useReadingMode } from "@/data/mobileHooks";
import { MobileCachedImage, useNemuTheme } from "@/design-system";
import {
  canHoldReaderOpening,
  readerOpeningSince,
  resolveReaderCoverCapDelay,
  shouldRevealReaderCover,
  READER_OPENING_IMAGE_HOLD_MAX_MS,
  type ReaderCoverRevealReason,
  type ReaderOpeningTimes,
} from "@/components/reader/readerOpeningHold";
import {
  getMobileReaderZoomCoverFrame,
  peekMobileReaderZoomCover,
  peekMobileReaderZoomTapAt,
  canonicalMobileReaderZoomId,
} from "@/lib/mobileReaderZoomHandoff";
import { MOBILE_READER_SCROLL_PLACEHOLDER_COLOR } from "@/lib/mobileReaderScrollPresentation";
import { mobileReaderPageBackgroundColor } from "@/lib/mobileReaderPageBackground";
import { mobileReaderPageStatusColor } from "@/lib/mobileReaderPageLoading";
import { useReaderPagePrefs } from "@/components/reader/useReaderPagePrefs";
import { ReaderScreen } from "@/screens/ReaderScreen";
import { VerticalBarBehavior, ZoomTarget, type ZoomStartedEvent } from "../../../../../modules/nemu-window-layout";
import { useMobileObservedWindowLayout } from "@/lib/MobileWindowLayoutContext";
import { mobileReaderVerticalBarPolicy } from "@/lib/mobileReaderPoseLayout";
import {
  mobileReaderStandInKey,
  mobileReaderStandInMatches,
  peekMobileReaderStandIn,
  resolveMobileReaderStandInFade,
  type MobileReaderStandIn,
} from "@/lib/mobileReaderOpeningStandIn";

/** The landing cover fades into the reader (the opening fade-in; see `readerOpeningLoadingFades`). */
const COVER_REVEAL_MS = 250;
/**
 * Over the very pages the reader drew under it, the stand-in stays this long
 * after they drew, past the opening's first seconds: the reader's own
 * drawing of a page is not pixel-identical to the stand-in's (the curl's
 * leaves resample it a hair sharper), and the swap must not show as the page
 * changing just after the landing. It leaves sooner, at once, on the first
 * touch, when the reader shows other pages, or when the window changes.
 */
const STAND_IN_HANDOFF_MS = 3200;
/** A stand-in over other pages than the reader's (it moved meanwhile) fades out. */
const STAND_IN_MISMATCH_FADE_MS = 250;
/** A reader has mounted in this app session (its JS is warm): the next one mounts with the shorter lead. */
let readerMountedThisSession = false;

type CoverRevealReason = ReaderCoverRevealReason;

export default function ReaderRoute() {
  const {
    zoom: zoomParam,
    registryId,
    sourceId,
    mangaId,
    chapterId,
  } = useLocalSearchParams<{ zoom?: string; registryId?: string; sourceId?: string; mangaId?: string; chapterId?: string }>();
  // One spelling of the zoom id on both ends (see canonicalMobileReaderZoomId).
  const zoom = canonicalMobileReaderZoomId(zoomParam ?? null);
  // A chapter shown at rest this session (same window): the cover
  // cross-fades into that very page during the zoom (see
  // mobileReaderOpeningStandIn). Decided once, at the push.
  const [standIn] = useState<MobileReaderStandIn | null>(() => {
    if (!zoom || !registryId || !sourceId || !mangaId || !chapterId) return null;
    const { width, height } = Dimensions.get("window");
    return peekMobileReaderStandIn(
      mobileReaderStandInKey({ registryId, sourceId, mangaId, chapterId }),
      { width, height },
    );
  });
  // Only a first open shows the loading screen and holds the HUD; a chapter
  // switch (`router.replace`, mounted while this chapter's reader still is)
  // opens as before. A zoom is always a first open.
  const [chapterSwitch] = useState(() => !zoom && isReaderChapterSwitchMount());
  useEffect(() => retainReaderRouteMount(), []);
  const coverReveal = useReaderCoverReveal(zoom, standIn != null, !chapterSwitch);
  // The reader's vertical-bar opt-out and dark bar appearance, held by the
  // route from the push for the screen's lifetime. Mounted inside the reader
  // (which mounts at the landing) they switched the Duo's status bar from the
  // bar column's island to the horizontal one ~0.6 s after a reopen landed:
  // a blink, and the chrome stepping aside. From the push the switch happens
  // with the zoom, and the reader's mount changes nothing.
  const readerVerticalBar = mobileReaderVerticalBarPolicy(useMobileObservedWindowLayout() ?? {});
  const [routeFocused, setRouteFocused] = useState(false);
  useFocusEffect(useCallback(() => {
    setRouteFocused(true);
    return () => setRouteFocused(false);
  }, []));
  // Design-explore: the reader grows out of the cover that opened it. No
  // swipe-to-dismiss: page turns own the reader's gestures.
  return (
    <MobileExploreZoomRoute
      zoomId={zoom}
      interactiveDismiss={false}
      freezePresenter={readerVerticalBar.optOut}
      onLanded={coverReveal.onLanded}
      onStarted={coverReveal.onZoomStarted}
    >
      {/* Mounted on every display, so the forced dark screen appearance never
          drops out when the Duo folds or unfolds. The inner display
          full-screen opts out of the vertical bar (`mobileReaderVerticalBarPolicy`).
          While the reader is the focused screen the dark appearance also
          covers its navigation containers, which host the system bars: a
          screen-level override never reaches them, so they rendered light. */}
      <VerticalBarBehavior
        disabled={readerVerticalBar.optOut}
        appearance="dark"
        appearanceCoversBars={routeFocused}
      />
      <ReaderAfterZoom
        zoomId={zoom ?? null}
        coverReveal={coverReveal}
        standIn={standIn}
        loadingScreen={!chapterSwitch}
      />
    </MobileExploreZoomRoute>
  );
}

type ReaderCoverReveal = {
  /** The opening's overlay (the reader background, the cover, the spinner): fades out into the reader. */
  opacity: SharedValue<number>;
  /** The loading screen's spinner (and, without a zoom, its cover): fades in once the page is late. */
  loadingOpacity: SharedValue<number>;
  /** The overlay's fade has ended (or there is none): the HUD may show. */
  openingDone: boolean;
  /** The HUD was asked for during the loading screen: it leaves at once. */
  releaseHud: () => void;
  /** The opening started (the zoom landed, or the route mounted; idempotent). */
  onLanded: () => void;
  /** The zoom started: the stand-in's cross-fade is timed against its landing. */
  onZoomStarted: (event: ZoomStartedEvent) => void;
  /** Every page of the stand-in has decoded. */
  onStandInReady: () => void;
  /** Fade now, unless a fade already started. */
  reveal: (reason: CoverRevealReason) => void;
  /**
   * Closes when the cover's fade has ended (either path): the reader holds
   * its cache-painted chapter's live source refresh until then.
   */
  openingGate: ReaderOpeningGate;
  /** `hold`: the cover waits for the first screen's images (see `readerOpeningHold`). */
  holdForFirstScreenImages: () => void;
  onFirstScreenImagesReady: () => void;
  openingTimes: () => ReaderOpeningTimes;
};

/**
 * The opening's overlay, faded on the UI thread: a busy JS thread (the
 * reader mounting, a cold start) must not starve the fades. The overlay is
 * the reader background with the title's cover, small and centred (a zoom
 * lands on it), over the reader as it builds. If the first page is not ready
 * `READER_OPENING_LOADING_DELAY_MS` after the opening (the zoom's landing, or
 * the route's mount), a spinner fades in under the cover (with the cover,
 * without a zoom), armed on the UI thread at the landing; the overlay then
 * stays at least `READER_OPENING_LOADING_MIN_VISIBLE_MS` before it fades into
 * the page (`resolveReaderOpeningLoading`). The HUD waits for that fade's end.
 */
function useReaderCoverReveal(zoomId: string | null, hasStandIn: boolean, loadingScreen: boolean): ReaderCoverReveal {
  const opacity = useSharedValue(1);
  const loadingOpacity = useSharedValue(0);
  const { reduceMotion } = useNemuTheme();
  const fadesRef = useRef(readerOpeningLoadingFades(reduceMotion));
  fadesRef.current = readerOpeningLoadingFades(reduceMotion);
  // No loading screen (a chapter switch): nothing holds the HUD.
  const [openingDone, setOpeningDone] = useState(!loadingScreen);
  // The Continue / tile tap that started this zoom: the opening's clock.
  const [tapAt] = useState(() => peekMobileReaderZoomTapAt(zoomId));
  const fadeEndAtRef = useRef<number | null>(null);
  /** `hold` taken: "reader ready" no longer reveals, the hold's cap does. */
  const holdingRef = useRef(false);
  const { mode } = useReadingMode();
  const modeRef = useRef({ mode });
  modeRef.current = { mode };
  const landedAtRef = useRef<number | null>(null);
  /** When the (possibly delayed) fade begins, by the JS clock; null: none armed. */
  const fadeStartsAtRef = useRef<number | null>(null);
  /** When the reader first said it was ready (the loading screen's clock). */
  const readyAtRef = useRef<number | null>(null);
  /** The fade out of a ready page is armed: a repeated "ready" changes nothing. */
  const readyFadeArmedRef = useRef(false);
  /** The reopen's cross-fade into the stand-in is armed: nothing later delays it. */
  const standInFadeArmedRef = useRef(false);
  const [openingGate] = useState(() =>
    createReaderOpeningGate({
      onSettled: (reason: ReaderOpeningSettleReason) => {
        const landedAt = landedAtRef.current;
        if (__DEV__) {
          console.info("[reader-zoom] opening-settled", {
            reason,
            sinceLandedMs: landedAt == null ? null : Math.round(Date.now() - landedAt),
          });
        }
      },
    }),
  );
  useEffect(() => () => openingGate.dispose(), [openingGate]);
  /** The fade's UI-thread completion, sent to JS: the opening window closes. */
  const onFadeEnd = useCallback(
    (reason: CoverRevealReason, landedAt: number) => {
      fadeEndAtRef.current = Date.now();
      logFadeEnd(reason, landedAt, tapAt, holdingRef.current);
      openingGate.settle("fade-end");
      setOpeningDone(true);
    },
    [openingGate, tapAt],
  );

  const logFadeStart = useCallback((reason: CoverRevealReason, sinceLandedMs: number | null) => {
    if (__DEV__) {
      console.info("[reader-zoom] fade-start", {
        reason,
        sinceLandedMs,
        mode: modeRef.current.mode,
      });
    }
  }, []);

  /**
   * The loading screen's fade-in, armed on the UI thread from the opening:
   * `READER_OPENING_LOADING_DELAY_MS` after it, unless the page is ready (or
   * the overlay already fading) by then.
   */
  const armLoadingFadeIn = useCallback(() => {
    const landedAt = landedAtRef.current;
    if (!loadingScreen || landedAt == null || readyAtRef.current != null) return;
    const now = Date.now();
    if (fadeStartsAtRef.current != null && fadeStartsAtRef.current <= now) return;
    loadingOpacity.value = withDelay(
      Math.max(0, landedAt + READER_OPENING_LOADING_DELAY_MS - now),
      withTiming(1, { duration: fadesRef.current.inMs }),
    );
  }, [loadingOpacity, loadingScreen]);

  /**
   * `hold`: the cover's fade, armed on the UI thread, starts
   * `READER_OPENING_IMAGE_HOLD_MAX_MS` after the landing at the latest; the
   * first screen's images reveal it sooner.
   */
  const armHoldCap = useCallback(() => {
    const landedAt = landedAtRef.current;
    if (landedAt == null) return;
    // The stand-in already shows the page by the landing: the hold's cap
    // must not cancel that fade for a later one.
    if (standInFadeArmedRef.current) return;
    const now = Date.now();
    const delay = resolveReaderCoverCapDelay({
      tapAt,
      landedAt,
      now,
      capMs: READER_OPENING_IMAGE_HOLD_MAX_MS,
      fadeMs: COVER_REVEAL_MS,
    });
    fadeStartsAtRef.current = now + delay;
    if (__DEV__) {
      console.info("[reader-zoom] fade-start", {
        reason: "hold-cap",
        armed: true,
        delayMs: Math.round(delay),
        sinceLandedMs: Math.round(now - landedAt),
        mode: modeRef.current.mode,
      });
    }
    // A withDelay keeps running the animation it replaced until its own
    // delay ends (Reanimated's delay(): `else if (previousAnimation)
    // previousAnimation.onFrame(…)`), so a fade armed before must stop here
    // (r16: a cap's fade went on under the hold). Cancelled, the cover stays
    // where it is until the hold's own fade.
    cancelAnimation(opacity);
    opacity.value = withDelay(
      delay,
      withTiming(0, { duration: COVER_REVEAL_MS }, (finished?: boolean) => {
        "worklet";
        if (finished) runOnJS(onFadeEnd)("hold-cap", landedAt);
      }),
    );
  }, [onFadeEnd, opacity, tapAt]);

  // The stand-in's cross-fade (a reopen, Colo): the cover fades into the
  // page during the zoom's last 300 ms, ending at the landing, so the page is
  // fully shown when the zoom lands. Known late in JS (the stand-in decoded,
  // or the zoom's start event arrived, after that window opened), only what
  // is left of it runs: shown by the landing + 50 ms at the latest, and past
  // that the stand-in replaces the cover at once (resolveMobileReaderStandInFade).
  const zoomStartRef = useRef<ZoomStartedEvent | null>(null);
  const standInReadyAtRef = useRef<number | null>(null);
  const scheduleStandInFade = useCallback(() => {
    const start = zoomStartRef.current;
    const readyAt = standInReadyAtRef.current;
    if (!hasStandIn || !start || readyAt == null) return;
    const now = Date.now();
    // A fade already running (the reader's own, or this one) is left be.
    if (standInFadeArmedRef.current) return;
    if (fadeStartsAtRef.current != null && fadeStartsAtRef.current <= now) return;
    const plan = resolveMobileReaderStandInFade({
      startedAtMs: start.startedAtMs,
      durationMs: start.durationMs,
      readyAtMs: readyAt,
      nowMs: now,
    });
    const landsAt = start.startedAtMs + start.durationMs;
    standInFadeArmedRef.current = true;
    fadeStartsAtRef.current = now + plan.delayMs;
    // The stand-in is the page: no loading screen after it.
    readyAtRef.current ??= now;
    cancelAnimation(loadingOpacity);
    cancelAnimation(opacity);
    opacity.value = withDelay(
      plan.delayMs,
      withTiming(0, { duration: plan.durationMs }, (finished?: boolean) => {
        "worklet";
        if (finished) runOnJS(onFadeEnd)("stand-in", landsAt);
      }),
    );
  }, [hasStandIn, loadingOpacity, onFadeEnd, opacity]);
  const onZoomStarted = useCallback(
    (event: ZoomStartedEvent) => {
      if (zoomStartRef.current) return;
      zoomStartRef.current = event;
      scheduleStandInFade();
    },
    [scheduleStandInFade],
  );
  const onStandInReady = useCallback(() => {
    if (standInReadyAtRef.current != null) return;
    standInReadyAtRef.current = Date.now();
    scheduleStandInFade();
  }, [scheduleStandInFade]);

  const onLanded = useCallback(() => {
    if (landedAtRef.current != null) return;
    landedAtRef.current = Date.now();
    if (__DEV__) {
      console.info("[reader-zoom] landed", {
        mode: modeRef.current.mode,
        atWall: landedAtRef.current,
        sinceTapMs: tapAt == null ? null : Math.round(landedAtRef.current - tapAt),
      });
    }
    openingGate.armBackstop();
    if (holdingRef.current) armHoldCap();
    armLoadingFadeIn();
  }, [armHoldCap, armLoadingFadeIn, openingGate, tapAt]);

  const holdForFirstScreenImages = useCallback(() => {
    if (holdingRef.current || openingGate.isSettled()) return;
    const now = Date.now();
    const landedAt = landedAtRef.current;
    if (!canHoldReaderOpening({ fadeStartsAt: fadeStartsAtRef.current, now })) {
      if (__DEV__) {
        console.info("[reader-zoom] hold-for-images skipped", {
          why: "fade-started",
          sinceLandedMs: landedAt == null ? null : Math.round(now - landedAt),
        });
      }
      return;
    }
    holdingRef.current = true;
    if (__DEV__) {
      console.info("[reader-zoom] hold-for-images", {
        capMs: READER_OPENING_IMAGE_HOLD_MAX_MS,
        sinceLandedMs: landedAt == null ? null : Math.round(now - landedAt),
        sinceTapMs: tapAt == null ? null : Math.round(now - tapAt),
      });
    }
    // Not landed yet: the landing arms it.
    if (landedAt != null) armHoldCap();
  }, [armHoldCap, openingGate, tapAt]);

  const reveal = useCallback(
    (reason: CoverRevealReason) => {
      const landedAt = landedAtRef.current;
      const now = Date.now();
      const sinceLandedMs = landedAt == null ? null : Math.round(now - landedAt);
      const fadeLandedAt = landedAt ?? now;
      const fades = fadesRef.current;
      // The HUD asked for: the overlay leaves now, whatever was armed.
      if (reason === "hud") {
        if (fadeStartsAtRef.current != null && fadeStartsAtRef.current <= now) return;
        readyAtRef.current ??= now;
        readyFadeArmedRef.current = true;
        fadeStartsAtRef.current = now;
        logFadeStart(reason, sinceLandedMs);
        cancelAnimation(opacity);
        opacity.value = withTiming(0, { duration: fades.outMs }, (finished?: boolean) => {
          "worklet";
          if (finished) runOnJS(onFadeEnd)(reason, fadeLandedAt);
        });
        return;
      }
      // A running fade is left be; a delayed one (the hold's cap) is replaced
      // by the reader being ready (holding: by its first screen's images).
      if (
        readyFadeArmedRef.current ||
        !shouldRevealReaderCover({
          reason,
          holding: holdingRef.current,
          fadeStartsAt: fadeStartsAtRef.current,
          now,
        })
      ) {
        return;
      }
      readyAtRef.current ??= now;
      readyFadeArmedRef.current = true;
      // Ready before the loading screen showed: straight in (a zoom fades its
      // cover into the page; without one nothing showed, so nothing fades).
      // Shown: it stays its minimum, then fades.
      const loading = resolveReaderOpeningLoading({ openedAt: fadeLandedAt, readyAt: readyAtRef.current, now });
      const skipped = loading.phase === "leave" && loading.skipped;
      const delay = loading.phase === "shown" ? (loading.leaveInMs ?? 0) : 0;
      if (skipped) cancelAnimation(loadingOpacity);
      fadeStartsAtRef.current = now + delay;
      logFadeStart(reason, sinceLandedMs);
      cancelAnimation(opacity);
      opacity.value = withDelay(
        delay,
        withTiming(0, { duration: skipped && !zoomId ? 0 : fades.outMs }, (finished?: boolean) => {
          "worklet";
          if (finished) runOnJS(onFadeEnd)(reason, fadeLandedAt);
        }),
      );
    },
    [loadingOpacity, logFadeStart, onFadeEnd, opacity, zoomId],
  );

  const releaseHud = useCallback(() => reveal("hud"), [reveal]);
  const onFirstScreenImagesReady = useCallback(() => {
    if (holdingRef.current) reveal("first-screen-images");
  }, [reveal]);
  const openingTimes = useCallback(
    (): ReaderOpeningTimes => ({
      tapAt,
      landedAt: landedAtRef.current,
      fadeEndAt: fadeEndAtRef.current,
    }),
    [tapAt],
  );

  return useMemo(
    () => ({
      opacity,
      loadingOpacity,
      openingDone,
      releaseHud,
      onLanded,
      onZoomStarted,
      onStandInReady,
      reveal,
      openingGate,
      holdForFirstScreenImages,
      onFirstScreenImagesReady,
      openingTimes,
    }),
    [
      holdForFirstScreenImages,
      loadingOpacity,
      onFirstScreenImagesReady,
      onLanded,
      onStandInReady,
      onZoomStarted,
      opacity,
      openingDone,
      openingGate,
      openingTimes,
      releaseHud,
      reveal,
    ],
  );
}

/** Logged when the cover's fade ends (it started `COVER_REVEAL_MS` before). */
function logFadeEnd(reason: CoverRevealReason, landedAt: number, tapAt: number | null, held: boolean) {
  // JS clock: late by however long the JS thread was busy.
  const { sinceTapMs } = readerOpeningSince({ tapAt, landedAt: null, fadeEndAt: null }, Date.now());
  if (__DEV__) {
    console.info("[reader-zoom] fade-end", {
      reason,
      sinceLandedMs: Math.round(Date.now() - landedAt),
      sinceTapMs,
      held,
    });
  }
}

/**
 * The reader is far too heavy to mount in the commit a zoom pushes, so the
 * zoom lands on the tapped cover, small and centred (the loading screen's),
 * and the reader mounts underneath as it lands (its render started just
 * before the visible landing, so its commit lands with it); the cover fades
 * into the reader once it is ready to show (scroll reading: placed at the
 * reading position; paged: the page on screen drawn — see
 * `readerZoomPageShown`), with a spinner below it when that is late (see
 * `useReaderCoverReveal`). A first open without a zoom shows the same
 * loading screen, its cover faded in with the spinner. A chapter switch is
 * the reader and nothing else.
 */
function ReaderAfterZoom({
  zoomId,
  coverReveal,
  standIn,
  loadingScreen,
}: {
  zoomId: string | null;
  coverReveal: ReaderCoverReveal;
  standIn: MobileReaderStandIn | null;
  loadingScreen: boolean;
}) {
  const landed = useMobileExploreZoomLanded();
  // The reader mounts a moment before the zoom's visible landing
  // (READER_OPENING_MOUNT_LEAD_MS): its heavy render runs during the zoom's
  // tail and its commit, which starts the chrome's fade, lands with the zoom.
  // Everything timed "from the landing" (the cover's caps, the timing
  // record) still counts from the landing itself.
  const landsAt = useMobileExploreZoomLandsAt();
  // The first reader of a session renders on a cold JS thread: it mounts as
  // soon as the zoom's start is known (READER_OPENING_COLD_MOUNT_LEAD_MS).
  const [mountLeadMs] = useState(() =>
    readerMountedThisSession ? READER_OPENING_MOUNT_LEAD_MS : READER_OPENING_COLD_MOUNT_LEAD_MS,
  );
  const [mountDue, setMountDue] = useState(false);
  useEffect(() => {
    if (landed || mountDue || landsAt == null) return;
    const timer = setTimeout(
      () => setMountDue(true),
      resolveReaderOpeningMountDelay({ landsAtMs: landsAt, nowMs: Date.now(), leadMs: mountLeadMs }),
    );
    return () => clearTimeout(timer);
  }, [landed, landsAt, mountDue, mountLeadMs]);
  const readerMounted = landed || mountDue;
  useEffect(() => {
    if (readerMounted) readerMountedThisSession = true;
  }, [readerMounted]);
  const [cover] = useState(() => {
    const zoomCover = peekMobileReaderZoomCover(zoomId);
    if (__DEV__) {
      console.info("[reader-zoom] route", {
        zoomId,
        cover: Boolean(zoomCover),
        tap: coverReveal.openingTimes().tapAt != null,
      });
    }
    // No zoom, nothing fades in: the opening window is closed from the
    // start. Settled here, in the first render, because the reader's effects
    // run before this route's. A zoom always lands on something that fades:
    // its cover, else a cover-shaped plate (never black).
    if (!zoomId) coverReveal.openingGate.settle("no-fade");
    return zoomCover;
  });
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const {
    opacity,
    loadingOpacity,
    openingDone,
    releaseHud,
    onLanded,
    reveal,
    openingGate,
    holdForFirstScreenImages,
    onFirstScreenImagesReady,
    openingTimes,
    onStandInReady,
  } = coverReveal;
  // Where the cover sits: the loading screen's frame through the opening;
  // after it (hidden), where the first page is laid out, which is where the
  // zoom back starts.
  const loadingLayout = getReaderOpeningLoadingLayout({ width: window.width, height: window.height, insets });
  const frame = openingDone
    ? getMobileReaderZoomCoverFrame({ width: window.width, height: window.height, insets })
    : loadingLayout.cover;
  // Without a zoom, the reader reports the title's cover (its library entry).
  const [titleCover, setTitleCover] = useState<{ uri: string; headers?: Record<string, string> } | null>(null);
  const onTitleCover = useCallback(
    (next: { uri: string; headers?: Record<string, string> } | null) => {
      if (zoomId || !loadingScreen) return;
      setTitleCover((current) =>
        current?.uri === next?.uri && JSON.stringify(current?.headers) === JSON.stringify(next?.headers)
          ? current
          : next,
      );
    },
    [loadingScreen, zoomId],
  );
  const shownCover = zoomId ? cover : titleCover;
  const [pageShown, setPageShown] = useState(false);
  // The stand-in (a reopen): over the reader, under the cover, shown as the
  // cover fades. It leaves once the reader has drawn its page underneath:
  // at once over the same pages, with a short fade over others.
  const [standInMounted, setStandInMounted] = useState(standIn != null);
  const standInOut = useSharedValue(1);
  const standInLoadedRef = useRef(new Set<string>());
  const onStandInPageLoad = useCallback(
    (pageId: string) => {
      if (!standIn) return;
      standInLoadedRef.current.add(pageId);
      if (standIn.pages.every((page) => standInLoadedRef.current.has(page.id))) onStandInReady();
    },
    [onStandInReady, standIn],
  );
  const openingPageIdsRef = useRef<readonly string[] | null>(null);
  const dismissStandIn = useCallback(() => setStandInMounted(false), []);
  const onOpeningPages = useCallback(
    (pageIds: readonly string[]) => {
      if (!openingPageIdsRef.current) {
        openingPageIdsRef.current = pageIds;
        return;
      }
      // The reader moved on (a turn, a re-placement): the stand-in shows a
      // page it no longer does.
      if (standIn && !mobileReaderStandInMatches(standIn, pageIds)) dismissStandIn();
    },
    [dismissStandIn, standIn],
  );
  useEffect(() => {
    if (!pageShown || !standIn || !standInMounted) return;
    const ids = openingPageIdsRef.current;
    const same = ids != null && mobileReaderStandInMatches(standIn, ids);
    if (!same) {
      standInOut.value = withTiming(0, { duration: STAND_IN_MISMATCH_FADE_MS });
    }
    const timer = setTimeout(
      () => setStandInMounted(false),
      same ? STAND_IN_HANDOFF_MS : STAND_IN_HANDOFF_MS + STAND_IN_MISMATCH_FADE_MS,
    );
    return () => clearTimeout(timer);
  }, [pageShown, standIn, standInMounted, standInOut]);
  // The window changed (rotation, a fold): the reader re-lays its pages.
  const windowMatchesStandIn =
    standIn != null
    && Math.abs(standIn.window.width - window.width) <= 0.5
    && Math.abs(standIn.window.height - window.height) <= 0.5;
  useEffect(() => {
    if (standIn && !windowMatchesStandIn) dismissStandIn();
  }, [dismissStandIn, standIn, windowMatchesStandIn]);
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
    // A first page that never reports: the loading screen leaves anyway,
    // onto the reader's own loading state and its HUD.
    const landedAt = openingTimes().landedAt ?? Date.now();
    const timer = setTimeout(() => {
      reveal("hold-max");
      setPageShown(true);
    }, Math.max(0, landedAt + READER_OPENING_LOADING_BACKSTOP_MS - Date.now()));
    return () => clearTimeout(timer);
  }, [landed, openingTimes, pageShown, reveal]);
  const entry = useMemo<ReaderZoomEntry>(
    () => ({
      onFirstPage,
      openingGate,
      holdForFirstScreenImages,
      onFirstScreenImagesReady,
      openingTimes,
      onOpeningPages,
      releaseHud,
      onTitleCover,
    }),
    [
      holdForFirstScreenImages,
      onFirstPage,
      onFirstScreenImagesReady,
      onOpeningPages,
      onTitleCover,
      openingGate,
      openingTimes,
      releaseHud,
    ],
  );
  const coverStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const loadingStyle = useAnimatedStyle(() => ({ opacity: loadingOpacity.value }));
  // The cross-fade's other half: the stand-in shows as the cover goes.
  const standInStyle = useAnimatedStyle(() => ({ opacity: (1 - opacity.value) * standInOut.value }));
  // The reader's page background (the setting; White until it has loaded,
  // as the reader itself): the cover fades onto it. "Match Page" has no page
  // yet here, so it is black, as the reader is until it reads the border.
  const { pageBackground } = useReaderPagePrefs();
  const backdropColor = mobileReaderPageBackgroundColor(pageBackground);
  const coverImage = shownCover ? (
    <MobileCachedImage
      uriOwnership="source"
      cacheKind="cover"
      source={shownCover}
      // No fade inside the native zoom target.
      fadeIn={false}
      fallback={<View style={[StyleSheet.absoluteFill, styles.coverPlate]} />}
      // Diagnostic: the cover's pixel size (a large one decodes on
      // the main thread as the reader mounts).
      onLoad={(event) => {
        const { width, height } = event.nativeEvent.source;
        const landedAt = openingTimes().landedAt;
        if (__DEV__) {
          console.info("[reader-zoom] cover-loaded", {
            width,
            height,
            sinceLandedMs: landedAt == null ? null : Math.round(Date.now() - landedAt),
          });
        }
      }}
      resizeMode="cover"
      style={StyleSheet.absoluteFill}
    />
  ) : (
    // No cover known at all: a plate the shape of one, not black.
    <View style={[StyleSheet.absoluteFill, styles.coverPlate]} />
  );
  const coverRect = { position: "absolute", left: frame.x, top: frame.y, width: frame.width, height: frame.height } as const;

  return (
    <View
      style={[styles.backdrop, { backgroundColor: backdropColor }]}
      // The first touch on the reader (a turn, a zoom, the chrome) takes the
      // stand-in away before anything it covers moves. Not a responder: the
      // reader's gestures are untouched.
      onTouchStart={standInMounted ? dismissStandIn : undefined}
    >
      {readerMounted ? (
        <ReaderZoomEntryContext.Provider value={entry}>
          <ReaderOpeningHudHeldContext.Provider value={!openingDone}>
            <ReaderScreen />
          </ReaderOpeningHudHeldContext.Provider>
        </ReaderZoomEntryContext.Provider>
      ) : null}
      {standIn && standInMounted ? (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, standInStyle]}>
          {standIn.pages.map((page) => (
            <View
              key={page.id}
              style={{
                position: "absolute",
                left: page.rect.x,
                top: page.rect.y,
                width: page.rect.width,
                height: page.rect.height,
              }}
            >
              <MobileCachedImage
                cacheKind="page"
                uriOwnership={page.uriOwnership ?? "source"}
                source={{ uri: page.uri, headers: page.headers }}
                fadeIn={false}
                fallback={null}
                // Finds the reader's own decode of this page (native's bounded
                // store), registered again as the most recent.
                retainDecoded
                onLoad={() => onStandInPageLoad(page.id)}
                resizeMode="contain"
                style={StyleSheet.absoluteFill}
              />
            </View>
          ))}
        </Animated.View>
      ) : null}
      {loadingScreen ? (
        // The reader background over the reader as it builds (never a
        // half-built frame), the cover and, once the page is late, the
        // spinner; it all fades into the page. Touches go through to the
        // reader: a tap there asks for the HUD (`releaseHud`).
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: backdropColor }, coverStyle]}
        >
          {zoomId ? (
            // Where the zoom lands: the cover grows into this frame. Hidden
            // once the page shows, it still names where the zoom back starts.
            <ZoomTarget zoomId={zoomId} style={coverRect}>
              {coverImage}
            </ZoomTarget>
          ) : shownCover ? (
            <Animated.View style={[coverRect, loadingStyle]}>{coverImage}</Animated.View>
          ) : null}
          {openingDone ? null : (
            <Animated.View
              style={[
                {
                  position: "absolute",
                  left: loadingLayout.spinner.x,
                  top: loadingLayout.spinner.y,
                  width: loadingLayout.spinner.width,
                  height: loadingLayout.spinner.height,
                },
                loadingStyle,
              ]}
            >
              <ActivityIndicator color={mobileReaderPageStatusColor(backdropColor)} />
            </Animated.View>
          )}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Painted with the reader's page background (see ReaderAfterZoom).
  backdrop: {
    flex: 1,
  },
  // A cover that is not there (yet): the reader's page plate.
  coverPlate: {
    backgroundColor: MOBILE_READER_SCROLL_PLACEHOLDER_COLOR,
  },
});
