import { throwIfMobileJapaneseLearningAborted } from "./mobileJapaneseLearningSafety";

export type MobileJapaneseLearningAbortScope = {
  signal: AbortSignal;
  abort(reason?: Error): void;
  throwIfAborted(): void;
  dispose(): void;
};

export function createMobileJapaneseLearningAbortScopeCore(
  externalSignal?: AbortSignal,
): MobileJapaneseLearningAbortScope {
  const controller = new AbortController();
  const abort = (reason?: Error) => {
    if (!controller.signal.aborted) {
      controller.abort(
        reason ?? new Error("Japanese Learning operation cancelled."),
      );
    }
  };
  const onExternalAbort = () =>
    abort(
      externalSignal?.reason instanceof Error
        ? externalSignal.reason
        : undefined,
    );
  if (externalSignal?.aborted) onExternalAbort();
  else externalSignal?.addEventListener("abort", onExternalAbort, {
    once: true,
  });

  return {
    signal: controller.signal,
    abort,
    throwIfAborted() {
      throwIfMobileJapaneseLearningAborted(controller.signal);
    },
    dispose() {
      externalSignal?.removeEventListener("abort", onExternalAbort);
    },
  };
}
