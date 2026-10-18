import { requireOptionalNativeModule } from "expo-modules-core";
import { Platform } from "react-native";

type NativeModule = {
  interfaceOrientationLockAvailable?: boolean;
  setInterfaceOrientationLocked?: (locked: boolean) => Promise<void>;
  afterTransitions?: () => Promise<void>;
  forgetFoldableDevice?: () => Promise<void>;
};

const nativeModule = Platform.OS === "ios"
  ? requireOptionalNativeModule<NativeModule>("NemuWindowLayout")
  : null;

/** This binary can lock the scene's current orientation (iOS 26+ API present in the module). */
export const interfaceOrientationLockAvailable = nativeModule?.interfaceOrientationLockAvailable === true;

/**
 * Keeps the scene in the orientation it has (`prefersInterfaceOrientationLocked`),
 * as the system's own Orientation Lock does: what works where a forced
 * orientation is only a preference (iPad, the iPhone Duo's inner display,
 * resizable scenes on iOS 27). No-op elsewhere and on older binaries.
 */
export function setInterfaceOrientationLocked(locked: boolean): void {
  void nativeModule?.setInterfaceOrientationLocked?.(locked)?.catch(() => undefined);
}

/**
 * The device turned out to be an ordinary iPhone: the native orientation gate
 * forgets a hinge it remembered (a foldable's backup restored here) and holds
 * portrait again. No-op elsewhere and on older binaries.
 */
export function forgetFoldableDevice(): void {
  void nativeModule?.forgetFoldableDevice?.()?.catch(() => undefined);
}

/**
 * Resolves once no view controller transition (a push, a pop, a sheet) is
 * running in the app's windows, so an orientation change never lands under
 * one. Resolves at once on Android, web and binaries built before it.
 */
export function afterViewControllerTransitions(): Promise<void> {
  const settle = nativeModule?.afterTransitions;
  return settle ? settle().catch(() => undefined) : Promise.resolve();
}
