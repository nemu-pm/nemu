import { requireOptionalNativeModule } from "expo-modules-core";
import { Platform } from "react-native";

export type LaunchRevealMode = "full" | "fade";

type NativeModule = {
  launchRevealPending?: () => boolean;
  prepareLaunchReveal?: (mode: LaunchRevealMode, background: string | null) => Promise<boolean>;
  startLaunchReveal?: () => Promise<void>;
};

const nativeModule = Platform.OS === "ios"
  ? requireOptionalNativeModule<NativeModule>("NemuWindowLayout")
  : null;

/**
 * True on a cold launch whose window has not been revealed yet (iOS, with a
 * binary that has the reveal); false after a JS reload into a visible UI,
 * on Android, web and older binaries.
 */
export function isLaunchRevealPending(): boolean {
  return nativeModule?.launchRevealPending?.() === true;
}

/** Puts the window in the reveal's start state under the launch screen. */
export async function prepareLaunchReveal(mode: LaunchRevealMode, background: string): Promise<boolean> {
  try {
    return (await nativeModule?.prepareLaunchReveal?.(mode, background)) === true;
  } catch {
    return false;
  }
}

/** Runs the window's half of the reveal (scale and bar fade, or the cross-fade). */
export function startLaunchReveal(): void {
  void nativeModule?.startLaunchReveal?.()?.catch(() => undefined);
}
