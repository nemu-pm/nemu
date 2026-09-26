/**
 * Frame of the native iOS switch the SwiftUI host must reserve.
 *
 * UISwitch is a fixed-size control whose size changed with the iOS 26 design:
 * 51x31 through iOS 18, 63x28 from iOS 26 on. The host used to hard-code the
 * old 51x31, so on iOS 26/27 the 63pt switch drew 12pt past its measured
 * frame — clipped by the Installed Sources card and flush against the
 * source-settings card edge. Reserving the real size keeps what Yoga lays out
 * equal to what SwiftUI paints.
 */
export type NemuNativeSwitchFrame = { width: number; height: number };

export const NEMU_IOS_LEGACY_SWITCH_FRAME: NemuNativeSwitchFrame = {
  width: 51,
  height: 31,
};
export const NEMU_IOS_26_SWITCH_FRAME: NemuNativeSwitchFrame = {
  width: 63,
  height: 28,
};

/** `Platform.Version` is a string such as "27.0" on iOS. */
export function parseIosMajorVersion(version: string | number): number {
  const major =
    typeof version === "number"
      ? Math.floor(version)
      : Number.parseInt(String(version).split(".")[0] ?? "", 10);
  return Number.isFinite(major) ? major : 0;
}

export function getNemuIosSwitchFrame(
  version: string | number,
): NemuNativeSwitchFrame {
  return parseIosMajorVersion(version) >= 26
    ? NEMU_IOS_26_SWITCH_FRAME
    : NEMU_IOS_LEGACY_SWITCH_FRAME;
}
