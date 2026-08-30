// Base (non-native) background sync stub.
//
// Metro resolves `mobileBackgroundSync.native.ts` on native (iOS/Android),
// which holds the real `expo-background-task` + `expo-task-manager` wiring
// (iOS `BGProcessingTask` via `BGTaskScheduler`, Android WorkManager). This
// base file is what bun's test runner and Expo web resolve instead — it has no
// `expo-*` or `react-native` import, so it loads under bun. Background sync is
// inherently a native-only capability (the OS APIs don't exist on web/sim under
// bun), so no-op stubs are safe: the pure decision logic and the runner live in
// `mobileBackgroundSyncConfig.ts` / `mobileBackgroundSyncRunner.ts` and are
// tested directly. The exported surface here is byte-for-byte type-compatible
// with the native file so tsc (which resolves this base) doesn't break. See
// `CONTRIBUTING.md` for the convention.

import type { MobileDataStore } from "@/data/storeTypes";

export const mobileBackgroundStoreRef: { current: MobileDataStore | null } = {
  current: null,
};

export async function registerMobileBackgroundSyncAsync(): Promise<void> {
  void mobileBackgroundStoreRef;
}

export async function unregisterMobileBackgroundSyncAsync(): Promise<void> {}

export async function isMobileBackgroundSyncRegisteredAsync(): Promise<boolean> {
  return false;
}

export function isMobileBackgroundSyncExpiring(): boolean {
  return false;
}

export function setMobileBackgroundSyncStore(store: MobileDataStore | null): void {
  mobileBackgroundStoreRef.current = store;
}
