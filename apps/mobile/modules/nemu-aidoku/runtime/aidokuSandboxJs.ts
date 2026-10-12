// Aidoku sources may evaluate JavaScript through `aidoku::imports::js::JsContext`
// (zh.copymanga parses its listing pages with `JSON.stringify(<literal>)`).
// The iOS sandbox page forbids `unsafe-eval`, and source scripts must never run
// in the realm that holds the native bridge anyway. Instead each evaluation is
// suspended out of the sandbox exactly like an HTTP request: the operation stops
// with a `js-eval` status, the native host evaluates the script in its own
// isolated JavaScriptCore context, appends the result, and the operation is
// replayed from the start with that result recorded.
//
// The shapes below mirror `JsEvaluator` / `JsEvaluatorContext` from
// `@nemu.pm/aidoku-runtime`; they are declared structurally so this module does
// not depend on a runtime release that exports them.
import { CloudflareBlockedError } from "@nemu.pm/aidoku-runtime";

export const MAX_SANDBOX_JS_SCRIPT_LENGTH = 1024 * 1024;
export const MAX_SANDBOX_JS_RESULT_LENGTH = 4 * 1024 * 1024;
export const MAX_SANDBOX_JS_REPLAY_CHARS_TOTAL = 16 * 1024 * 1024;
export const MAX_SANDBOX_JS_EVALUATIONS = 64;
export const MAX_SANDBOX_JS_CONTEXTS = 16;

export type SandboxJsEvalKind = "eval" | "eval-async" | "get";

export type SandboxJsEvalRequest = {
  contextId: number;
  kind: SandboxJsEvalKind;
  script: string;
};

export type SandboxJsReplayState = {
  jsReplay: { request: SandboxJsEvalRequest; result: string | null }[];
  jsReplayChars: number;
  pendingJs: { cursor: number; request: SandboxJsEvalRequest } | null;
};

export type SandboxJsEvaluatorContext = {
  eval(script: string): string | null;
  evalAsync(script: string): string | null;
  get(name: string): string | null;
};

export type SandboxJsEvaluator = {
  createContext(): SandboxJsEvaluatorContext;
};

/**
 * Thrown from inside the source call. Extends CloudflareBlockedError so the
 * Aidoku runtime rethrows it instead of flattening it into an empty result,
 * the same way the HTTP replay control error escapes.
 */
export class SandboxJsControlError extends CloudflareBlockedError {
  constructor(
    readonly control: "js-eval-needed" | "js-replay-mismatch" | "js-limit",
    readonly cursor: number,
    readonly request: SandboxJsEvalRequest | null,
    message: string,
  ) {
    super("about:blank", 0);
    this.name = "AidokuSandboxJsControlError";
    this.message = message;
  }
}

export function createSandboxJsReplayState(): SandboxJsReplayState {
  return { jsReplay: [], jsReplayChars: 0, pendingJs: null };
}

function sameJsRequest(
  left: SandboxJsEvalRequest,
  right: SandboxJsEvalRequest,
): boolean {
  return (
    left.contextId === right.contextId &&
    left.kind === right.kind &&
    left.script === right.script
  );
}

/**
 * A JsEvaluator whose every evaluation is answered from the operation's
 * recorded results. The first unanswered evaluation suspends the operation.
 * Context IDs come from a per-run counter, so a deterministic source produces
 * the same IDs on every replay and the native host can keep one live context
 * per ID for the whole operation.
 */
export function createSandboxJsEvaluator(state: SandboxJsReplayState): {
  evaluator: SandboxJsEvaluator;
  consumedEvaluations: () => number;
} {
  let cursor = 0;
  let contexts = 0;

  const step = (request: SandboxJsEvalRequest): string | null => {
    if (request.script.length > MAX_SANDBOX_JS_SCRIPT_LENGTH) {
      throw new SandboxJsControlError(
        "js-limit",
        cursor,
        null,
        "Aidoku source script exceeds the safety limit.",
      );
    }
    const recorded = state.jsReplay[cursor];
    if (!recorded) {
      if (cursor >= MAX_SANDBOX_JS_EVALUATIONS) {
        throw new SandboxJsControlError(
          "js-limit",
          cursor,
          null,
          "Aidoku source exceeded the JavaScript evaluation limit.",
        );
      }
      state.pendingJs = { cursor, request };
      throw new SandboxJsControlError(
        "js-eval-needed",
        cursor,
        request,
        "Aidoku source needs a host JavaScript evaluation.",
      );
    }
    if (!sameJsRequest(recorded.request, request)) {
      throw new SandboxJsControlError(
        "js-replay-mismatch",
        cursor,
        request,
        "Aidoku source produced a non-deterministic JavaScript replay request.",
      );
    }
    cursor += 1;
    return recorded.result;
  };

  return {
    evaluator: {
      createContext() {
        if (contexts >= MAX_SANDBOX_JS_CONTEXTS) {
          throw new SandboxJsControlError(
            "js-limit",
            cursor,
            null,
            "Aidoku source exceeded the JavaScript context limit.",
          );
        }
        contexts += 1;
        const contextId = contexts;
        return {
          eval: (script) => step({ contextId, kind: "eval", script }),
          evalAsync: (script) => step({ contextId, kind: "eval-async", script }),
          get: (name) => step({ contextId, kind: "get", script: name }),
        };
      },
    },
    consumedEvaluations: () => cursor,
  };
}

function asJsRequest(raw: unknown): SandboxJsEvalRequest {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Aidoku JavaScript request is invalid.");
  }
  const record = raw as Record<string, unknown>;
  const { contextId, kind, script } = record;
  if (
    typeof contextId !== "number" ||
    !Number.isSafeInteger(contextId) ||
    contextId < 1 ||
    contextId > MAX_SANDBOX_JS_CONTEXTS ||
    (kind !== "eval" && kind !== "eval-async" && kind !== "get") ||
    typeof script !== "string" ||
    script.length > MAX_SANDBOX_JS_SCRIPT_LENGTH
  ) {
    throw new Error("Aidoku JavaScript request is invalid.");
  }
  return { contextId, kind, script };
}

/** Record the host's answer for the pending evaluation. */
export function appendSandboxJsResult(
  state: SandboxJsReplayState,
  cursor: unknown,
  rawRequest: unknown,
  result: unknown,
): void {
  if (
    typeof cursor !== "number" ||
    !Number.isSafeInteger(cursor) ||
    cursor !== state.jsReplay.length
  ) {
    throw new Error("Aidoku JavaScript replay cursor is invalid.");
  }
  const request = asJsRequest(rawRequest);
  if (
    !state.pendingJs ||
    state.pendingJs.cursor !== cursor ||
    !sameJsRequest(state.pendingJs.request, request)
  ) {
    throw new Error(
      "Aidoku JavaScript result does not match the pending evaluation.",
    );
  }
  if (result !== null && typeof result !== "string") {
    throw new Error("Aidoku JavaScript result is invalid.");
  }
  if (result !== null && result.length > MAX_SANDBOX_JS_RESULT_LENGTH) {
    throw new Error("Aidoku JavaScript result exceeds the safety limit.");
  }
  const chars = request.script.length + (result?.length ?? 0);
  if (state.jsReplayChars + chars > MAX_SANDBOX_JS_REPLAY_CHARS_TOTAL) {
    throw new Error(
      "Aidoku JavaScript replay data exceeds the memory safety limit.",
    );
  }
  state.jsReplay.push({ request, result });
  state.jsReplayChars += chars;
  state.pendingJs = null;
}
