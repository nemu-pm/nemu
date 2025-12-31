/**
 * Haptic feedback utilities using ios-haptics
 * Works on iOS Safari and Android via navigator.vibrate
 */
import { haptic as iosHaptic } from "ios-haptics"

/** Single light haptic - for taps, selections */
export function haptic() {
  iosHaptic()
}

/** Double haptic - for confirmations, success */
export function hapticConfirm() {
  iosHaptic.confirm()
}

/** Triple haptic - for errors */
export function hapticError() {
  iosHaptic.error()
}

/** Alias for selection feedback */
export const hapticSelection = haptic

/** Alias for button press feedback */
export const hapticPress = haptic

