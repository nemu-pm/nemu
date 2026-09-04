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

/** Persisted reader display switches: keep-awake (default on) and portrait lock (default off). */
export function useReaderDisplayPrefs(): {
  keepAwake: boolean;
  setKeepAwake: (enabled: boolean) => Promise<void>;
  lockPortrait: boolean;
  setLockPortrait: (enabled: boolean) => Promise<void>;
} {
  const store = useMobileDataStore();
  const revision = useMobileDataRevision(["settings"]);
  const [keepAwake, setKeepAwakeState] = useState(DEFAULT_READER_KEEP_AWAKE);
  const [lockPortrait, setLockPortraitState] = useState(
    DEFAULT_READER_LOCK_PORTRAIT,
  );
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

  return { keepAwake, setKeepAwake, lockPortrait, setLockPortrait };
}
