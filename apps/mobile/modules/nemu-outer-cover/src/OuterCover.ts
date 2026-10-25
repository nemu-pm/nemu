import { requireOptionalNativeModule } from "expo-modules-core";
import { Platform } from "react-native";

/** `AVCaptureDevice.authorizationStatus(for: .video)`. */
export type OuterCameraAccess = "granted" | "denied" | "restricted" | "undetermined";

export type OuterCoverOptions = {
  /**
   * Who configures the content (one id per reader hook instance). Only this
   * owner's `clearOuterCover` clears it, so a reader's late cleanup never
   * clears the next reader's cover.
   */
  owner: string;
  /** Every condition holds (see `shouldRunMobileOuterCover`): run the camera and offer the accessory. */
  enabled: boolean;
  /** The cover cache's local file (`file://`). Null: the background colour only. */
  coverUri: string | null;
  /** The book / work: the cover crossfades only when this or the image changes. */
  coverKey: string | null;
  /** `#RRGGBB`; black when null. */
  backgroundColor: string | null;
  accessibilityLabel: string;
};

type NativeModule = {
  outerCoverAvailable?: boolean;
  isOuterCoverSupported?: () => boolean;
  cameraAccessStatus?: () => OuterCameraAccess;
  requestCameraAccess?: () => Promise<OuterCameraAccess>;
  setOuterCover?: (options: OuterCoverOptions) => Promise<void>;
  clearOuterCover?: (owner: string) => Promise<void>;
};

const nativeModule = Platform.OS === "ios"
  ? requireOptionalNativeModule<NativeModule>("NemuOuterCover")
  : null;

/**
 * Built with the iOS 27.1+ SDK and running on iOS 27.1+ (camera capture
 * scene accessories). Says nothing about a hinge: callers also require the
 * window layout to report one. False on Android, web, older binaries.
 */
export function isOuterCoverSupported(): boolean {
  try {
    return nativeModule?.isOuterCoverSupported?.() === true;
  } catch {
    return false;
  }
}

export function cameraAccessStatus(): OuterCameraAccess {
  try {
    return nativeModule?.cameraAccessStatus?.() ?? "denied";
  } catch {
    return "denied";
  }
}

/** Asks for the camera if not asked yet (the only prompt the app shows for it). */
export async function requestCameraAccess(): Promise<OuterCameraAccess> {
  if (!nativeModule?.requestCameraAccess) return "denied";
  try {
    return await nativeModule.requestCameraAccess();
  } catch {
    return "denied";
  }
}

export function setOuterCover(options: OuterCoverOptions): void {
  void nativeModule?.setOuterCover?.(options)?.catch(() => undefined);
}

/**
 * Stops the camera, withdraws the accessory and forgets the content, if
 * `owner` configured it (native ignores anyone else's clear).
 */
export function clearOuterCover(owner: string): void {
  void nativeModule?.clearOuterCover?.(owner)?.catch(() => undefined);
}

let nextOwner = 0;
/** A fresh owner id (one per reader hook instance). */
export function makeOuterCoverOwner(): string {
  nextOwner += 1;
  return `reader-${Date.now().toString(36)}-${nextOwner}`;
}
