import { requireOptionalNativeModule } from "expo";
import type { MobileJapaneseLearningDictationModule } from "./mobileJapaneseLearningDictation";

/**
 * `expo-speech-recognition`'s own entry calls `requireNativeModule`, which
 * throws in binaries built before the module was linked. Look the native
 * module up optionally instead so the chat composer just hides the mic there
 * (web hides it when `SpeechRecognition` is missing).
 */
let cached: MobileJapaneseLearningDictationModule | null | undefined;

export function getMobileJapaneseLearningDictationModule(): MobileJapaneseLearningDictationModule | null {
  if (cached !== undefined) return cached;
  try {
    cached = requireOptionalNativeModule<MobileJapaneseLearningDictationModule>(
      "ExpoSpeechRecognition",
    );
  } catch {
    cached = null;
  }
  return cached;
}
