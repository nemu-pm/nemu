import { useCallback, useEffect, useRef, useState } from "react";
import * as KeepAwake from "expo-keep-awake";
import * as ScreenOrientation from "expo-screen-orientation";
import { useMobileDataStore } from "@/data/mobileDataContext";
import { useMobileDataRevision } from "@/data/mobileDataEvents";
import type { UserSettings } from "@/data/schema";
import { emitMobileDataChanged } from "@/data/mobileDataEvents";
import {
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
import {
  DEFAULT_MOBILE_READER_NOTEBOOK_PANE,
  normalizeMobileReaderNotebookPanePreference,
  type MobileReaderNotebookPanePreference,
} from "@/lib/mobileReaderNotebookPane";

const KEEP_AWAKE_TAG = "nemu-reader";

/**
 * Reader session environment: keep-awake and portrait lock. Persistence of the
 * two switches lives in `useReaderDisplayPrefs`; this hook applies them to the
 * device. Screen brightness is left to the system — the reader no longer
 * shadows the OS control.
 */
export function useReaderDisplayEnvironment({
  keepAwakeEnabled,
  keepAwakeReady = true,
  lockPortraitEnabled,
}: {
  keepAwakeEnabled: boolean;
  /**
   * Hold the keep-awake activation until there is something to read. A chapter
   * that never resolves its pages (offline, blocked source, an error the user
   * walks away from) should not pin the display on.
   */
  keepAwakeReady?: boolean;
  lockPortraitEnabled: boolean;
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

  // Only a request: on iOS 27 resizable windows (iPhone Duo inner display,
  // Split View, iPhone Mirroring) the system may refuse or ignore the lock
  // (expo-screen-orientation v58; "The inner display doesn't honor your
  // supported interface orientations"). No layout may depend on it — the
  // reader lays out from its window geometry — so a refused lock only means
  // the reader keeps rotating like the rest of the system.
  useEffect(() => {
    if (lockPortraitEnabled) {
      void ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.PORTRAIT_UP,
      ).catch(() => undefined);
      return () => {
        void ScreenOrientation.unlockAsync().catch(() => undefined);
      };
    }
    return undefined;
  }, [lockPortraitEnabled]);
}

/**
 * Persisted reader display switches: keep-awake (default on), portrait lock
 * (default off) and the notebook posture's bottom half (default automatic).
 */
export function useReaderDisplayPrefs(): {
  keepAwake: boolean;
  setKeepAwake: (enabled: boolean) => Promise<void>;
  lockPortrait: boolean;
  setLockPortrait: (enabled: boolean) => Promise<void>;
  notebookPane: MobileReaderNotebookPanePreference;
  setNotebookPane: (value: MobileReaderNotebookPanePreference) => Promise<void>;
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
  const [notebookPane, setNotebookPaneState] = useState<MobileReaderNotebookPanePreference>(
    DEFAULT_MOBILE_READER_NOTEBOOK_PANE,
  );
  const [spreadMode, setSpreadModeState] = useState<ReaderSpreadMode>(DEFAULT_READER_SPREAD_MODE);
  const [fitModes, setFitModesState] = useState<ReaderFitModesByShape>({});
  const spreadModeRun = useRef(0);
  const fitModesRun = useRef(0);
  const savedSpreadMode = useRef<ReaderSpreadMode>(DEFAULT_READER_SPREAD_MODE);
  const savedFitModes = useRef<ReaderFitModesByShape>({});
  const keepAwakeRun = useRef(0);
  const lockPortraitRun = useRef(0);
  const notebookPaneRun = useRef(0);
  const savedNotebookPane = useRef<MobileReaderNotebookPanePreference>(DEFAULT_MOBILE_READER_NOTEBOOK_PANE);
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
        const nextNotebookPane = normalizeMobileReaderNotebookPanePreference(settings.readerNotebookPane);
        setNotebookPaneState(nextNotebookPane);
        savedNotebookPane.current = nextNotebookPane;
        const nextSpreadMode = normalizeReaderSpreadMode(settings.readerSpreadMode, settings.readerTwoPageMode);
        setSpreadModeState(nextSpreadMode);
        savedSpreadMode.current = nextSpreadMode;
        const nextFitModes = normalizeReaderFitModes(settings.readerFitModes);
        setFitModesState(nextFitModes);
        savedFitModes.current = nextFitModes;
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

  const setNotebookPane = useCallback(
    async (value: MobileReaderNotebookPanePreference) => {
      if (value === notebookPane) return;
      const run = notebookPaneRun.current + 1;
      notebookPaneRun.current = run;
      setNotebookPaneState(value);
      try {
        await store.updateSettings((settings) => ({
          ...settings,
          readerNotebookPane: value,
        }));
        savedNotebookPane.current = value;
        emitMobileDataChanged("settings");
      } catch (error) {
        if (notebookPaneRun.current === run) setNotebookPaneState(savedNotebookPane.current);
        throw error;
      }
    },
    [notebookPane, store],
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
    keepAwake,
    setKeepAwake,
    lockPortrait,
    setLockPortrait,
    notebookPane,
    setNotebookPane,
    spreadMode,
    setSpreadMode,
    fitModes,
    setFitMode,
  };
}
