import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import * as ScreenOrientation from "expo-screen-orientation";
import { useMobileObservedWindowLayout } from "@/lib/MobileWindowLayoutContext";
import {
  MOBILE_FOLDABLE_PROBE_MS,
  mobileDeviceFormFactor,
  mobileOrientationLock,
  mobileOrientationLockWaitsForTransition,
} from "@/lib/mobileOrientationPolicy";
import { afterViewControllerTransitions, forgetFoldableDevice } from "../../modules/nemu-window-layout";
import {
  setMobileDeviceFormFactor,
  useMobileDeviceFormFactor,
  useMobileReaderPortraitRequest,
} from "@/lib/mobileOrientationStore";

/**
 * Applies the app orientation policy (`mobileOrientationPolicy.ts`): an
 * ordinary iPhone is held portrait everywhere; iPhone Duo and iPad rotate
 * unless the reader asks for portrait. Mounted once under the window
 * observer, before the splash screen hides.
 */
export function MobileOrientationController() {
  const layout = useMobileObservedWindowLayout();
  const formFactor = useMobileDeviceFormFactor();
  const readerPortrait = useMobileReaderPortraitRequest();
  const [probeElapsed, setProbeElapsed] = useState(false);
  const observed = layout !== null;
  useEffect(() => {
    if (!observed || probeElapsed) return;
    const timer = setTimeout(() => setProbeElapsed(true), MOBILE_FOLDABLE_PROBE_MS);
    return () => clearTimeout(timer);
  }, [observed, probeElapsed]);
  const next = mobileDeviceFormFactor({
    platform: Platform.OS,
    isPad: Platform.OS === "ios" && Platform.isPad,
    layout,
    previous: formFactor,
    probeElapsed,
  });
  useEffect(() => {
    if (next !== formFactor) setMobileDeviceFormFactor(next);
  }, [formFactor, next]);
  // The native gate remembers a hinge across launches (a sideways Duo launch
  // never turns through portrait); an ordinary iPhone clears it.
  useEffect(() => {
    if (next === "phone") forgetFoldableDevice();
  }, [next]);

  const lock = mobileOrientationLock({ formFactor: next, readerWantsPortrait: readerPortrait });
  const applied = useRef<"portrait" | "default">("default");
  useEffect(() => {
    if (Platform.OS === "web" || lock === applied.current) return;
    const waits = mobileOrientationLockWaitsForTransition(applied.current, lock);
    applied.current = lock;
    let current = true;
    const apply = () => {
      if (!current) return;
      // A request: the Duo inner display and resizable windows may refuse it.
      void (lock === "portrait"
        ? ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP)
        : ScreenOrientation.unlockAsync()
      ).catch(() => undefined);
    };
    // Back from the reader: rotate once the pop has finished, never under it.
    if (waits) void afterViewControllerTransitions().then(apply);
    else apply();
    return () => {
      current = false;
    };
  }, [lock]);
  return null;
}
