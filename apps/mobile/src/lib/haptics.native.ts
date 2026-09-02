import * as Haptics from "expo-haptics";
import { areHapticsFeedbackEnabled } from "./mobileHapticsGate";

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
  await runHaptic(() => Haptics.selectionAsync());
}

export async function hapticPress() {
  await runHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

export async function hapticConfirm() {
  await runHaptic(() =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
  );
}

export async function hapticError() {
  await runHaptic(() =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
  );
}

export async function hapticWarning() {
  await runHaptic(() =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
  );
}
