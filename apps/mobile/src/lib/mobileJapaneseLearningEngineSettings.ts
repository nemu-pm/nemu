import {
  MOBILE_JAPANESE_LEARNING_ENGINE_SETTING_KEY,
  setMobileJapaneseLearningEnginePreference,
} from "./mobileJapaneseLearningEngine";
import type { MobileReaderPluginState } from "./mobileReaderPlugins";

/** Pushes the Japanese Learning plugin's engine setting into the engine layer. */
export function syncMobileJapaneseLearningEnginePreference(
  plugins: ReadonlyArray<Pick<MobileReaderPluginState, "id" | "values">>,
): void {
  const plugin = plugins.find((item) => item.id === "japanese-learning");
  setMobileJapaneseLearningEnginePreference(
    plugin?.values[MOBILE_JAPANESE_LEARNING_ENGINE_SETTING_KEY],
  );
}

// QA builds only (flag inlined at bundle time): exercise the real engines once
// after launch and write Documents/nemu-engine-selftest/result.json.
if (process.env.EXPO_PUBLIC_NEMU_JL_ENGINE_SELFTEST === "1") {
  setTimeout(() => {
    void import("./mobileJapaneseLearningEngineSelfTest")
      .then((selfTest) => selfTest.runMobileJapaneseLearningEngineSelfTest())
      .catch((error: unknown) => {
        console.warn("[japanese-learning] engine self-test failed", error);
      });
  }, 6_000);
}
