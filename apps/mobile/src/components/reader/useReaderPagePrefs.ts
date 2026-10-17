import { useCallback, useEffect, useRef, useState } from "react";
import { useMobileDataStore } from "@/data/mobileDataContext";
import { emitMobileDataChanged, useMobileDataRevision } from "@/data/mobileDataEvents";
import type { UserSettings } from "@/data/schema";
import {
  DEFAULT_MOBILE_READER_SPREAD_PAIRING,
  normalizeMobileReaderSpreadPairing,
  type MobileReaderSpreadPairing,
} from "@/lib/mobileReaderPairing";
import {
  DEFAULT_MOBILE_READER_PAGE_BACKGROUND,
  normalizeMobileReaderPageBackground,
  type MobileReaderPageBackground,
} from "@/lib/mobileReaderPageBackground";
import {
  normalizeMobileReaderPairingShifts,
  toggleMobileReaderPairingShift,
  type MobileReaderPairingShifts,
} from "@/lib/mobileReaderPairingShift";

/** Persisted page prefs: the pairing rule, the per-manga "Shift by One Page" and the page background. */
export function useReaderPagePrefs(): {
  spreadPairing: MobileReaderSpreadPairing;
  setSpreadPairing: (value: MobileReaderSpreadPairing) => Promise<void>;
  pairingShifts: MobileReaderPairingShifts;
  togglePairingShift: (mangaKey: string, chapterId: string) => Promise<void>;
  pageBackground: MobileReaderPageBackground;
  setPageBackground: (value: MobileReaderPageBackground) => Promise<void>;
} {
  const store = useMobileDataStore();
  const revision = useMobileDataRevision(["settings"]);
  const [spreadPairing, setSpreadPairingState] = useState<MobileReaderSpreadPairing>(
    DEFAULT_MOBILE_READER_SPREAD_PAIRING,
  );
  const [pairingShifts, setPairingShiftsState] = useState<MobileReaderPairingShifts>({});
  const savedSpreadPairing = useRef<MobileReaderSpreadPairing>(DEFAULT_MOBILE_READER_SPREAD_PAIRING);
  const savedPairingShifts = useRef<MobileReaderPairingShifts>({});
  const spreadPairingRun = useRef(0);
  const [pageBackground, setPageBackgroundState] = useState<MobileReaderPageBackground>(
    DEFAULT_MOBILE_READER_PAGE_BACKGROUND,
  );
  const savedPageBackground = useRef<MobileReaderPageBackground>(DEFAULT_MOBILE_READER_PAGE_BACKGROUND);
  const pageBackgroundRun = useRef(0);
  const pairingShiftRun = useRef(0);

  useEffect(() => {
    let mounted = true;
    store
      .getSettings()
      .then((settings: UserSettings) => {
        if (!mounted) return;
        const nextPairing = normalizeMobileReaderSpreadPairing(
          settings.readerSpreadPairing,
          settings.readerPagePairingMode,
        );
        setSpreadPairingState(nextPairing);
        savedSpreadPairing.current = nextPairing;
        const nextShifts = normalizeMobileReaderPairingShifts(settings.readerPairingShifts);
        setPairingShiftsState(nextShifts);
        savedPairingShifts.current = nextShifts;
        const nextBackground = normalizeMobileReaderPageBackground(settings.readerPageBackground);
        setPageBackgroundState(nextBackground);
        savedPageBackground.current = nextBackground;
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, [revision, store]);

  const setSpreadPairing = useCallback(
    async (value: MobileReaderSpreadPairing) => {
      if (value === spreadPairing) return;
      const run = spreadPairingRun.current + 1;
      spreadPairingRun.current = run;
      setSpreadPairingState(value);
      try {
        await store.updateSettings((settings) => ({
          ...settings,
          readerSpreadPairing: value,
          // Keep the older choice truthful for builds that still read it.
          readerPagePairingMode: value === "cover-paired" ? "book" : "manga",
        }));
        savedSpreadPairing.current = value;
        emitMobileDataChanged("settings");
      } catch (error) {
        if (spreadPairingRun.current === run) setSpreadPairingState(savedSpreadPairing.current);
        throw error;
      }
    },
    [spreadPairing, store],
  );

  const togglePairingShift = useCallback(
    async (mangaKey: string, chapterId: string) => {
      const run = pairingShiftRun.current + 1;
      pairingShiftRun.current = run;
      const next = toggleMobileReaderPairingShift(pairingShifts, mangaKey, chapterId);
      setPairingShiftsState(next);
      try {
        await store.updateSettings((settings) => ({
          ...settings,
          readerPairingShifts: toggleMobileReaderPairingShift(
            normalizeMobileReaderPairingShifts(settings.readerPairingShifts),
            mangaKey,
            chapterId,
          ),
        }));
        savedPairingShifts.current = next;
        emitMobileDataChanged("settings");
      } catch (error) {
        if (pairingShiftRun.current === run) setPairingShiftsState(savedPairingShifts.current);
        throw error;
      }
    },
    [pairingShifts, store],
  );

  const setPageBackground = useCallback(
    async (value: MobileReaderPageBackground) => {
      if (value === pageBackground) return;
      const run = pageBackgroundRun.current + 1;
      pageBackgroundRun.current = run;
      setPageBackgroundState(value);
      try {
        await store.updateSettings((settings) => ({ ...settings, readerPageBackground: value }));
        savedPageBackground.current = value;
        emitMobileDataChanged("settings");
      } catch (error) {
        if (pageBackgroundRun.current === run) setPageBackgroundState(savedPageBackground.current);
        throw error;
      }
    },
    [pageBackground, store],
  );

  return {
    spreadPairing,
    setSpreadPairing,
    pairingShifts,
    togglePairingShift,
    pageBackground,
    setPageBackground,
  };
}
