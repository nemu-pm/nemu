import { Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { areHapticsFeedbackEnabled } from "./mobileHapticsGate";

// `selectionAsync` / `impactAsync` / `notificationAsync` drive the raw Android
// `Vibrator`, which ignores the system "touch feedback" setting (and wants the
// VIBRATE permission). `performAndroidHapticsAsync` goes through
// `View.performHapticFeedback`, so Android users who turned touch feedback off
// get silence. iOS keeps its UIKit generators.
const isAndroid = Platform.OS === "android";

async function runHaptic(action: () => Promise<void>) {
  // The user-level master switch wins over any individual call site.
  if (!areHapticsFeedbackEnabled()) return;
  try {
    await action();
  } catch {
    // Haptics are enhancement-only and should never block the UI action.
  }
}

export async function hapticSelection() {
  await runHaptic(() =>
    isAndroid
      ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Clock_Tick)
      : Haptics.selectionAsync()
  );
}

export async function hapticPress() {
  await runHaptic(() =>
    isAndroid
      ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Virtual_Key)
      : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  );
}

export async function hapticConfirm() {
  await runHaptic(() =>
    isAndroid
      ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Confirm)
      : Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
  );
}

export async function hapticError() {
  await runHaptic(() =>
    isAndroid
      ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Reject)
      : Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
  );
}

export async function hapticWarning() {
  await runHaptic(() =>
    isAndroid
      ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Long_Press)
      : Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
  );
}
