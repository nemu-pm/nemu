export type MobileJapaneseLearningOperation =
  | "chat"
  | "grammar"
  | "ocr"
  | "tts-playback"
  | "tts-prefetch";

export type MobileJapaneseLearningScreenLifecycle = {
  begin(operation: MobileJapaneseLearningOperation): AbortSignal;
  abort(operation: MobileJapaneseLearningOperation): void;
  abortAll(): void;
};

function cancellationError(): Error {
  const error = new Error("Japanese Learning screen operation cancelled.");
  error.name = "AbortError";
  return error;
}

/** Owns every asynchronous Japanese Learning operation started by one Reader. */
export function createMobileJapaneseLearningScreenLifecycle(): MobileJapaneseLearningScreenLifecycle {
  const controllers = new Map<
    MobileJapaneseLearningOperation,
    AbortController
  >();

  const abort = (operation: MobileJapaneseLearningOperation) => {
    const controller = controllers.get(operation);
    controllers.delete(operation);
    if (controller && !controller.signal.aborted) {
      controller.abort(cancellationError());
    }
  };

  return {
    begin(operation) {
      abort(operation);
      const controller = new AbortController();
      controllers.set(operation, controller);
      return controller.signal;
    },
    abort,
    abortAll() {
      const activeOperations = [...controllers.keys()];
      for (const operation of activeOperations) abort(operation);
    },
  };
}
