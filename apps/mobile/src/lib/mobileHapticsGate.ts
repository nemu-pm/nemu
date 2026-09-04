/**
 * Module-level gate so haptics wrappers stay synchronous and callable from
 * anywhere (including non-React modules). The settings bridge pushes the
 * persisted user preference in at the root; `undefined` in storage means the
 * feature default: enabled.
 */
let hapticsFeedbackEnabled = true;

export function setHapticsFeedbackEnabled(enabled: boolean): void {
  hapticsFeedbackEnabled = enabled;
}

export function areHapticsFeedbackEnabled(): boolean {
  return hapticsFeedbackEnabled;
}
