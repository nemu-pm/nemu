/**
 * Haptic feedback.
 *
 * On Capacitor (iOS/Android), uses the native @capacitor/haptics plugin —
 * this triggers the platform haptic engine (UIImpactFeedbackGenerator on iOS,
 * VibrationEffect on Android), which is meaningfully different from the web
 * `navigator.vibrate` fallback.
 *
 * On the web, falls back to `ios-haptics` (Safari) / `navigator.vibrate`
 * (Android Chrome) via the existing helper.
 */
import { haptic as iosHaptic } from "ios-haptics"
import { Capacitor } from "@capacitor/core"

const isNativeHost = Capacitor.isNativePlatform()

// Lazy import the native plugin so the web bundle stays small.
let nativePlugin: typeof import("@capacitor/haptics") | null = null
const loadNative = isNativeHost
  ? import("@capacitor/haptics").then((m) => { nativePlugin = m; return m })
  : Promise.resolve(null)

async function nativeImpact(style: "Light" | "Medium" | "Heavy") {
  const m = nativePlugin ?? (await loadNative)
  if (!m) return false
  try {
    await m.Haptics.impact({ style: m.ImpactStyle[style] })
    return true
  } catch {
    return false
  }
}

async function nativeNotify(type: "Success" | "Warning" | "Error") {
  const m = nativePlugin ?? (await loadNative)
  if (!m) return false
  try {
    await m.Haptics.notification({ type: m.NotificationType[type] })
    return true
  } catch {
    return false
  }
}

async function nativeSelection() {
  const m = nativePlugin ?? (await loadNative)
  if (!m) return false
  try {
    // Use a light impact for discrete selection feedback.
    // The Haptics.selection* API is designed for continuous scrubbing
    // (selectionStart → selectionChanged → selectionEnd), not one-shot taps.
    // Using it for a single tap produces no feedback because selectionChanged()
    // is never called between start and end.
    await m.Haptics.impact({ style: m.ImpactStyle.Light })
    return true
  } catch {
    return false
  }
}

/** Single light haptic - for taps, selections */
export function haptic() {
  if (isNativeHost) {
    void nativeImpact("Light")
    return
  }
  iosHaptic()
}

/** Double haptic - for confirmations, success */
export function hapticConfirm() {
  if (isNativeHost) {
    void nativeNotify("Success")
    return
  }
  iosHaptic.confirm()
}

/** Triple haptic - for errors */
export function hapticError() {
  if (isNativeHost) {
    void nativeNotify("Error")
    return
  }
  iosHaptic.error()
}

/** Selection feedback - subtler than impact, for picker scrubs */
export function hapticSelection() {
  if (isNativeHost) {
    void nativeSelection()
    return
  }
  iosHaptic()
}

/** Button press feedback */
export function hapticPress() {
  if (isNativeHost) {
    void nativeImpact("Medium")
    return
  }
  iosHaptic()
}
