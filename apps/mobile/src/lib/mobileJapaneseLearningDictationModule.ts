import type { MobileJapaneseLearningDictationModule } from "./mobileJapaneseLearningDictation";

/** Non-native (web / unit test) builds have no speech recognizer. */
export function getMobileJapaneseLearningDictationModule(): MobileJapaneseLearningDictationModule | null {
  return null;
}
