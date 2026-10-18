import { useSyncExternalStore } from "react";
import type { MobileDeviceFormFactor } from "@/lib/mobileOrientationPolicy";

/**
 * Shared orientation state: the device's form factor (decided once by the
 * root controller) and the reader's portrait request. Only
 * `MobileOrientationController` calls `ScreenOrientation`, so leaving the
 * reader can never undo the app-wide iPhone lock, and the reader can never
 * leave a lock behind.
 */
type State = { formFactor: MobileDeviceFormFactor; readerPortrait: boolean };

let state: State = { formFactor: "unknown", readerPortrait: false };
const listeners = new Set<() => void>();

function set(next: Partial<State>) {
  const merged = { ...state, ...next };
  if (merged.formFactor === state.formFactor && merged.readerPortrait === state.readerPortrait) return;
  state = merged;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setMobileDeviceFormFactor(formFactor: MobileDeviceFormFactor) {
  set({ formFactor });
}

export function setMobileReaderPortraitRequest(readerPortrait: boolean) {
  set({ readerPortrait });
}

export function useMobileDeviceFormFactor(): MobileDeviceFormFactor {
  return useSyncExternalStore(subscribe, () => state.formFactor);
}

export function useMobileReaderPortraitRequest(): boolean {
  return useSyncExternalStore(subscribe, () => state.readerPortrait);
}
