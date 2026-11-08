import { useCallback, useEffect, useRef, useState } from "react";
import * as KeepAwake from "expo-keep-awake";
import {
  DEFAULT_READER_OUTER_DISPLAY_VIEW,
  normalizeReaderOuterDisplayView,
  type MobileReaderOuterDisplayView,
} from "@/lib/mobileReaderCoverView";
import {
  DEFAULT_READER_PAGE_TURN_HAPTICS,
  normalizeReaderPageTurnHaptics,
} from "@/lib/mobileReaderPageTurnHaptics";
import { setMobileReaderPortraitRequest } from "@/lib/mobileOrientationStore";
import { setInterfaceOrientationLocked } from "../../../modules/nemu-window-layout";
import { useMobileDataStore } from "@/data/mobileDataContext";
import { useMobileDataRevision } from "@/data/mobileDataEvents";
import type { UserSettings } from "@/data/schema";
import { emitMobileDataChanged } from "@/data/mobileDataEvents";
import {
  DEFAULT_READER_AVOID_CAMERA,
  DEFAULT_READER_KEEP_AWAKE,
  DEFAULT_READER_LOCK_PORTRAIT,
} from "@/lib/mobileReaderSettings";
import {
  DEFAULT_READER_SPREAD_MODE,
  normalizeReaderSpreadMode,
  type ReaderSpreadMode,
} from "@/lib/mobileReaderSpreadMode";
import {
  normalizeReaderFitModes,
  withReaderFitMode,
  type ReaderFitMode,
  type ReaderFitModesByShape,
} from "@/lib/mobileReaderFit";
import type { ReaderWindowShape } from "@/lib/mobileReaderWindowShape";

const KEEP_AWAKE_TAG = "nemu-reader";

/**
 * Reader session environment: keep-awake and the portrait request. Persistence of the
 * two switches lives in `useReaderDisplayPrefs`; this hook applies them to the
 * device. Screen brightness is left to the system — the reader no longer
 * shadows the OS control.
 */
export function useReaderDisplayEnvironment({
  keepAwakeEnabled,
  keepAwakeReady = true,
  portraitRequested,
  keepOrientationRequested = false,
}: {
  keepAwakeEnabled: boolean;
  /**
   * Hold the keep-awake activation until there is something to read. A chapter
   * that never resolves its pages (offline, blocked source, an error the user
   * walks away from) should not pin the display on.
   */
  keepAwakeReady?: boolean;
  /** `mobileReaderOrientationRequest().portrait`: the Orientation Lock on a binary without the scene lock. */
  portraitRequested: boolean;
  /** `mobileReaderOrientationRequest().keepOrientation`: the Orientation Lock on iPad and both Duo displays. */
  keepOrientationRequested?: boolean;
}): void {
  useEffect(() => {
    if (!keepAwakeEnabled || !keepAwakeReady) return;
    void KeepAwake.activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(
      () => undefined,
    );
    return () => {
      void KeepAwake.deactivateKeepAwake(KEEP_AWAKE_TAG).catch(
        () => undefined,
      );
    };
  }, [keepAwakeEnabled, keepAwakeReady]);

  // The reader's portrait request (the outer display, or its Orientation
  // Lock), applied by the root `MobileOrientationController` with the app's
  // own policy; withdrawn when the reader leaves, never unlocking an iPhone.
  useEffect(() => {
    setMobileReaderPortraitRequest(portraitRequested);
    return () => setMobileReaderPortraitRequest(false);
  }, [portraitRequested]);
  // The Orientation Lock where the system only takes a preference: the scene
  // keeps its orientation while the reader is on top; released when it leaves.
  useEffect(() => {
    if (!keepOrientationRequested) return;
    setInterfaceOrientationLocked(true);
    return () => setInterfaceOrientationLocked(false);
  }, [keepOrientationRequested]);
}

// Known without waiting for storage once read: a chapter crossed remounts the
// reader, which must not hold the page back behind a blank while it asks again.
let lastReaderOuterDisplayView: MobileReaderOuterDisplayView | null = null;

/**
 * Persisted reader display switches: keep-awake (default on), portrait lock
 * (default off), the outer display's camera area, page layout and page fit.
 */
export function useReaderDisplayPrefs(): {
  keepAwake: boolean;
  setKeepAwake: (enabled: boolean) => Promise<void>;
  /** Page Turn Haptics (default off). */
  pageTurnHaptics: boolean;
  setPageTurnHaptics: (enabled: boolean) => Promise<void>;
  /** The outer display: the title's cover (default) or the pages. */
  outerDisplayView: MobileReaderOuterDisplayView;
  /** The saved view has been read (until then, the outer display waits for it). */
  outerDisplayViewKnown: boolean;
  setOuterDisplayView: (view: MobileReaderOuterDisplayView) => Promise<void>;
  lockPortrait: boolean;
  setLockPortrait: (enabled: boolean) => Promise<void>;
  /** The saved values have loaded (until then, the defaults). */
  ready: boolean;
  avoidCamera: boolean;
  setAvoidCamera: (enabled: boolean) => Promise<void>;
  spreadMode: ReaderSpreadMode;
  setSpreadMode: (value: ReaderSpreadMode) => Promise<void>;
  /** Saved page fit per window shape; read one with `readerFitModeForShape`. */
  fitModes: ReaderFitModesByShape;
  setFitMode: (shape: ReaderWindowShape, mode: ReaderFitMode) => Promise<void>;
} {
  const store = useMobileDataStore();
  const revision = useMobileDataRevision(["settings"]);
  const [keepAwake, setKeepAwakeState] = useState(DEFAULT_READER_KEEP_AWAKE);
  const [pageTurnHaptics, setPageTurnHapticsState] = useState(DEFAULT_READER_PAGE_TURN_HAPTICS);
  const pageTurnHapticsRun = useRef(0);
  const [outerDisplayView, setOuterDisplayViewState] = useState<MobileReaderOuterDisplayView>(
    lastReaderOuterDisplayView ?? DEFAULT_READER_OUTER_DISPLAY_VIEW,
  );
  const [outerDisplayViewKnown, setOuterDisplayViewKnown] = useState(lastReaderOuterDisplayView !== null);
  const outerDisplayViewRun = useRef(0);
  const savedOuterDisplayView = useRef(outerDisplayView);
  const savedPageTurnHaptics = useRef(DEFAULT_READER_PAGE_TURN_HAPTICS);
  const [lockPortrait, setLockPortraitState] = useState(
    DEFAULT_READER_LOCK_PORTRAIT,
  );
  const [ready, setReady] = useState(false);
  const [avoidCamera, setAvoidCameraState] = useState(DEFAULT_READER_AVOID_CAMERA);
  const savedAvoidCamera = useRef(DEFAULT_READER_AVOID_CAMERA);
  const avoidCameraRun = useRef(0);
  const [spreadMode, setSpreadModeState] = useState<ReaderSpreadMode>(DEFAULT_READER_SPREAD_MODE);
  const [fitModes, setFitModesState] = useState<ReaderFitModesByShape>({});
  const spreadModeRun = useRef(0);
  const fitModesRun = useRef(0);
  const savedSpreadMode = useRef<ReaderSpreadMode>(DEFAULT_READER_SPREAD_MODE);
  const savedFitModes = useRef<ReaderFitModesByShape>({});
  const keepAwakeRun = useRef(0);
  const lockPortraitRun = useRef(0);
  const savedKeepAwake = useRef(DEFAULT_READER_KEEP_AWAKE);
  const savedLockPortrait = useRef(DEFAULT_READER_LOCK_PORTRAIT);

  useEffect(() => {
    let mounted = true;
    store
      .getSettings()
      .then((settings: UserSettings) => {
        if (!mounted) return;
        const nextKeepAwake = settings.readerKeepAwake ?? DEFAULT_READER_KEEP_AWAKE;
        setKeepAwakeState(nextKeepAwake);
        savedKeepAwake.current = nextKeepAwake;
        const nextOuterDisplayView = normalizeReaderOuterDisplayView(settings.readerOuterDisplayView);
        lastReaderOuterDisplayView = nextOuterDisplayView;
        setOuterDisplayViewState(nextOuterDisplayView);
        savedOuterDisplayView.current = nextOuterDisplayView;
        setOuterDisplayViewKnown(true);
        const nextPageTurnHaptics = normalizeReaderPageTurnHaptics(settings.readerPageTurnHaptics);
        setPageTurnHapticsState(nextPageTurnHaptics);
        savedPageTurnHaptics.current = nextPageTurnHaptics;
        const nextLockPortrait =
          settings.readerLockPortrait ?? DEFAULT_READER_LOCK_PORTRAIT;
        setLockPortraitState(nextLockPortrait);
        savedLockPortrait.current = nextLockPortrait;
        const nextAvoidCamera = settings.readerAvoidCamera ?? DEFAULT_READER_AVOID_CAMERA;
        setAvoidCameraState(nextAvoidCamera);
        savedAvoidCamera.current = nextAvoidCamera;
        const nextSpreadMode = normalizeReaderSpreadMode(settings.readerSpreadMode, settings.readerTwoPageMode);
        setSpreadModeState(nextSpreadMode);
        savedSpreadMode.current = nextSpreadMode;
        const nextFitModes = normalizeReaderFitModes(settings.readerFitModes);
        setFitModesState(nextFitModes);
        savedFitModes.current = nextFitModes;
        setReady(true);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, [revision, store]);

  const setKeepAwake = useCallback(
    async (enabled: boolean) => {
      if (enabled === keepAwake) return;
      const run = keepAwakeRun.current + 1;
      keepAwakeRun.current = run;
      setKeepAwakeState(enabled);
      try {
        await store.updateSettings((settings) => ({
          ...settings,
          readerKeepAwake: enabled,
        }));
        savedKeepAwake.current = enabled;
        emitMobileDataChanged("settings");
      } catch (error) {
        if (keepAwakeRun.current === run) setKeepAwakeState(savedKeepAwake.current);
        throw error;
      }
    },
    [keepAwake, store],
  );

  const setOuterDisplayView = useCallback(
    async (view: MobileReaderOuterDisplayView) => {
      if (view === outerDisplayView) return;
      const run = outerDisplayViewRun.current + 1;
      outerDisplayViewRun.current = run;
      lastReaderOuterDisplayView = view;
      setOuterDisplayViewState(view);
      try {
        await store.updateSettings((settings) => ({
          ...settings,
          readerOuterDisplayView: view,
        }));
        savedOuterDisplayView.current = view;
        emitMobileDataChanged("settings");
      } catch (error) {
        if (outerDisplayViewRun.current === run) {
          lastReaderOuterDisplayView = savedOuterDisplayView.current;
          setOuterDisplayViewState(savedOuterDisplayView.current);
        }
        throw error;
      }
    },
    [outerDisplayView, store],
  );

  const setPageTurnHaptics = useCallback(
    async (enabled: boolean) => {
      if (enabled === pageTurnHaptics) return;
      const run = pageTurnHapticsRun.current + 1;
      pageTurnHapticsRun.current = run;
      setPageTurnHapticsState(enabled);
      try {
        await store.updateSettings((settings) => ({
          ...settings,
          readerPageTurnHaptics: enabled,
        }));
        savedPageTurnHaptics.current = enabled;
        emitMobileDataChanged("settings");
      } catch (error) {
        if (pageTurnHapticsRun.current === run) setPageTurnHapticsState(savedPageTurnHaptics.current);
        throw error;
      }
    },
    [pageTurnHaptics, store],
  );

  const setLockPortrait = useCallback(
    async (enabled: boolean) => {
      if (enabled === lockPortrait) return;
      const run = lockPortraitRun.current + 1;
      lockPortraitRun.current = run;
      setLockPortraitState(enabled);
      try {
        await store.updateSettings((settings) => ({
          ...settings,
          readerLockPortrait: enabled,
        }));
        savedLockPortrait.current = enabled;
        emitMobileDataChanged("settings");
      } catch (error) {
        if (lockPortraitRun.current === run)
          setLockPortraitState(savedLockPortrait.current);
        throw error;
      }
    },
    [lockPortrait, store],
  );

  const setAvoidCamera = useCallback(
    async (enabled: boolean) => {
      if (enabled === avoidCamera) return;
      const run = ++avoidCameraRun.current;
      setAvoidCameraState(enabled);
      try {
        await store.updateSettings((settings) => ({ ...settings, readerAvoidCamera: enabled }));
        savedAvoidCamera.current = enabled;
        emitMobileDataChanged("settings");
      } catch (error) {
        if (avoidCameraRun.current === run) setAvoidCameraState(savedAvoidCamera.current);
        throw error;
      }
    },
    [avoidCamera, store],
  );

  const setSpreadMode = useCallback(
    async (value: ReaderSpreadMode) => {
      if (value === spreadMode) return;
      const run = spreadModeRun.current + 1;
      spreadModeRun.current = run;
      setSpreadModeState(value);
      try {
        await store.updateSettings((settings) => ({
          ...settings,
          readerSpreadMode: value,
          // Keep the older boolean truthful for builds that still read it.
          ...(value === "auto" ? {} : { readerTwoPageMode: value === "double" }),
        }));
        savedSpreadMode.current = value;
        emitMobileDataChanged("settings");
      } catch (error) {
        if (spreadModeRun.current === run) setSpreadModeState(savedSpreadMode.current);
        throw error;
      }
    },
    [spreadMode, store],
  );

  const setFitMode = useCallback(
    async (shape: ReaderWindowShape, mode: ReaderFitMode) => {
      const run = fitModesRun.current + 1;
      fitModesRun.current = run;
      const optimistic = withReaderFitMode(fitModes, shape, mode);
      setFitModesState(optimistic);
      try {
        let saved: ReaderFitModesByShape = optimistic;
        await store.updateSettings((settings) => {
          saved = withReaderFitMode(normalizeReaderFitModes(settings.readerFitModes), shape, mode);
          return { ...settings, readerFitModes: saved };
        });
        savedFitModes.current = saved;
        emitMobileDataChanged("settings");
      } catch (error) {
        if (fitModesRun.current === run) setFitModesState(savedFitModes.current);
        throw error;
      }
    },
    [fitModes, store],
  );

  return {
    ready,
    avoidCamera,
    setAvoidCamera,
    keepAwake,
    setKeepAwake,
    pageTurnHaptics,
    setPageTurnHaptics,
    outerDisplayView,
    outerDisplayViewKnown,
    setOuterDisplayView,
    lockPortrait,
    setLockPortrait,
    spreadMode,
    setSpreadMode,
    fitModes,
    setFitMode,
  };
}
