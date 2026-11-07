import { useCallback, useEffect, useRef, useState } from "react";
import * as KeepAwake from "expo-keep-awake";
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

/**
 * Persisted reader display switches: keep-awake (default on), portrait lock
 * (default off), the outer display's camera area, page layout and page fit.
 */
export function useReaderDisplayPrefs(): {
  keepAwake: boolean;
  setKeepAwake: (enabled: boolean) => Promise<void>;
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
    lockPortrait,
    setLockPortrait,
    spreadMode,
    setSpreadMode,
    fitModes,
    setFitMode,
  };
}
