import { useCallback, useEffect, useRef, useState } from "react";
import * as Brightness from "expo-brightness";
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
const BRIGHTNESS_PREVIEW_THROTTLE_MS = 120;

/**
 * Reader session environment: brightness (session-only, restored on exit),
 * keep-awake, and portrait lock. Persistence of the two switches lives in
 * `useReaderDisplayPrefs`; this hook applies them to the device.
 */
export function useReaderDisplayEnvironment({
  keepAwakeEnabled,
  lockPortraitEnabled,
}: {
  keepAwakeEnabled: boolean;
  lockPortraitEnabled: boolean;
}): {
  brightnessPct: number;
  previewBrightness: (pct: number) => void;
  commitBrightness: (pct: number) => void;
} {
  const [brightnessPct, setBrightnessPct] = useState(100);
  const systemBrightnessRef = useRef<number | null>(null);
  const lastPreviewAtRef = useRef(0);
  const pendingCommitRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let mounted = true;
    Brightness.getBrightnessAsync()
      .then((value) => {
        if (!mounted || typeof value !== "number") return;
        systemBrightnessRef.current = value;
        setBrightnessPct(Math.round(value * 100));
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  const applyBrightness = useCallback((pct: number) => {
    const clamped = Math.min(100, Math.max(0, pct));
    void Brightness.setBrightnessAsync(clamped / 100).catch(() => undefined);
  }, []);

  const previewBrightness = useCallback(
    (pct: number) => {
      setBrightnessPct(pct);
      const now = Date.now();
      if (now - lastPreviewAtRef.current < BRIGHTNESS_PREVIEW_THROTTLE_MS) {
        if (pendingCommitRef.current) clearTimeout(pendingCommitRef.current);
        pendingCommitRef.current = setTimeout(() => {
          pendingCommitRef.current = null;
          applyBrightness(pct);
        }, BRIGHTNESS_PREVIEW_THROTTLE_MS);
        return;
      }
      lastPreviewAtRef.current = now;
      applyBrightness(pct);
    },
    [applyBrightness],
  );

  const commitBrightness = useCallback(
    (pct: number) => {
      if (pendingCommitRef.current) {
        clearTimeout(pendingCommitRef.current);
        pendingCommitRef.current = null;
      }
      lastPreviewAtRef.current = Date.now();
      setBrightnessPct(pct);
      applyBrightness(pct);
    },
    [applyBrightness],
  );

  // Restore the system brightness when the reader unmounts.
  useEffect(() => {
    return () => {
      if (pendingCommitRef.current) clearTimeout(pendingCommitRef.current);
      const system = systemBrightnessRef.current;
      if (system != null) {
        void Brightness.setBrightnessAsync(system).catch(() => undefined);
      }
    };
  }, []);

  useEffect(() => {
    if (!keepAwakeEnabled) return;
    void KeepAwake.activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(
      () => undefined,
    );
    return () => {
      void KeepAwake.deactivateKeepAwake(KEEP_AWAKE_TAG).catch(
        () => undefined,
      );
    };
  }, [keepAwakeEnabled]);

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

  return { brightnessPct, previewBrightness, commitBrightness };
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
