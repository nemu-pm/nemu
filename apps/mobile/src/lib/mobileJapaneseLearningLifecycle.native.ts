import { AppState } from "react-native";
import {
  createMobileJapaneseLearningAbortScopeCore,
  type MobileJapaneseLearningAbortScope,
} from "./mobileJapaneseLearningLifecycleCore";

export type { MobileJapaneseLearningAbortScope };

export function createMobileJapaneseLearningAbortScope(
  externalSignal?: AbortSignal,
): MobileJapaneseLearningAbortScope {
  const scope = createMobileJapaneseLearningAbortScopeCore(externalSignal);
  const abortForBackground = () => {
    const error = new Error(
      "Japanese Learning operation cancelled when the app left the foreground.",
    );
    error.name = "AbortError";
    scope.abort(error);
  };
  if (AppState.currentState !== "active") abortForBackground();
  const subscription = AppState.addEventListener("change", (state) => {
    if (state !== "active") abortForBackground();
  });
  const disposeCore = scope.dispose;
  scope.dispose = () => {
    subscription.remove();
    disposeCore();
  };
  return scope;
}
