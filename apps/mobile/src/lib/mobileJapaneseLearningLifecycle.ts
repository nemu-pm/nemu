import {
  createMobileJapaneseLearningAbortScopeCore,
  type MobileJapaneseLearningAbortScope,
} from "./mobileJapaneseLearningLifecycleCore";

export type { MobileJapaneseLearningAbortScope };

export function createMobileJapaneseLearningAbortScope(
  externalSignal?: AbortSignal,
): MobileJapaneseLearningAbortScope {
  return createMobileJapaneseLearningAbortScopeCore(externalSignal);
}
