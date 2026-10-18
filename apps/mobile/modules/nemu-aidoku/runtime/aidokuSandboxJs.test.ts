import { describe, expect, test } from "bun:test";
import { CloudflareBlockedError } from "@nemu.pm/aidoku-runtime";
import {
  appendSandboxJsResult,
  createSandboxJsEvaluator,
  createSandboxJsReplayState,
  MAX_SANDBOX_JS_CONTEXTS,
  MAX_SANDBOX_JS_EVALUATIONS,
  MAX_SANDBOX_JS_RESULT_LENGTH,
  SandboxJsControlError,
} from "./aidokuSandboxJs";

function suspension(run: () => unknown): SandboxJsControlError {
  try {
    run();
  } catch (error) {
    if (error instanceof SandboxJsControlError) return error;
    throw error;
  }
  throw new Error("expected a suspension");
}

const LIST_SCRIPT = "JSON.stringify([{'name':'x','path_word':'y'}])";

describe("sandbox JavaScript replay evaluator", () => {
  test("suspends a copymanga-style evaluation, then replays the host result", () => {
    const state = createSandboxJsReplayState();

    // Round 1: the source's first evaluation suspends the operation.
    const first = createSandboxJsEvaluator(state);
    const error = suspension(() =>
      first.evaluator.createContext().eval(LIST_SCRIPT),
    );
    // Escapes aidoku-runtime's catch blocks like the HTTP control error.
    expect(error).toBeInstanceOf(CloudflareBlockedError);
    expect(error.control).toBe("js-eval-needed");
    expect(error.cursor).toBe(0);
    expect(error.request).toEqual({
      contextId: 1,
      kind: "eval",
      script: LIST_SCRIPT,
    });

    // The native host answers from its isolated context.
    appendSandboxJsResult(
      state,
      0,
      error.request,
      '[{"name":"x","path_word":"y"}]',
    );
    expect(state.pendingJs).toBeNull();

    // Round 2: the same evaluation is answered from the record.
    const second = createSandboxJsEvaluator(state);
    expect(second.evaluator.createContext().eval(LIST_SCRIPT)).toBe(
      '[{"name":"x","path_word":"y"}]',
    );
    expect(second.consumedEvaluations()).toBe(1);
  });

  test("keeps context IDs and kinds stable across replays", () => {
    const state = createSandboxJsReplayState();
    const requests = [
      { contextId: 1, kind: "eval", script: "var a = 1" },
      { contextId: 2, kind: "eval-async", script: "Promise.resolve(2)" },
      { contextId: 1, kind: "get", script: "a" },
    ] as const;
    const results = ["undefined", "2", null];

    const drive = () => {
      const { evaluator } = createSandboxJsEvaluator(state);
      const one = evaluator.createContext();
      const two = evaluator.createContext();
      return [one.eval("var a = 1"), two.evalAsync("Promise.resolve(2)"), one.get("a")];
    };
    for (let cursor = 0; cursor < requests.length; cursor += 1) {
      const error = suspension(drive);
      expect(error.cursor).toBe(cursor);
      expect(error.request).toEqual(requests[cursor]);
      appendSandboxJsResult(state, cursor, error.request, results[cursor]);
    }
    expect(drive()).toEqual(results);
  });

  test("rejects a replay the source does not reproduce", () => {
    const state = createSandboxJsReplayState();
    const error = suspension(() =>
      createSandboxJsEvaluator(state).evaluator.createContext().eval("1"),
    );
    appendSandboxJsResult(state, 0, error.request, "1");

    const mismatch = suspension(() =>
      createSandboxJsEvaluator(state).evaluator.createContext().eval("2"),
    );
    expect(mismatch.control).toBe("js-replay-mismatch");
  });

  test("only accepts the answer for the pending evaluation", () => {
    const state = createSandboxJsReplayState();
    const error = suspension(() =>
      createSandboxJsEvaluator(state).evaluator.createContext().eval("1"),
    );
    const other = { contextId: 1, kind: "eval", script: "2" };

    expect(() => appendSandboxJsResult(state, 1, error.request, "1")).toThrow(
      "cursor",
    );
    expect(() => appendSandboxJsResult(state, 0, other, "2")).toThrow(
      "pending",
    );
    expect(() => appendSandboxJsResult(state, 0, error.request, 42)).toThrow(
      "invalid",
    );
    expect(() =>
      appendSandboxJsResult(
        state,
        0,
        error.request,
        "x".repeat(MAX_SANDBOX_JS_RESULT_LENGTH + 1),
      ),
    ).toThrow("safety limit");
    expect(() =>
      appendSandboxJsResult(state, 0, { ...error.request, kind: "webview" }, "1"),
    ).toThrow("invalid");
    expect(state.jsReplay).toHaveLength(0);

    // A null result is MissingResult and is recorded as such.
    appendSandboxJsResult(state, 0, error.request, null);
    expect(state.jsReplay[0]?.result).toBeNull();
  });

  test("bounds contexts and evaluations per operation", () => {
    const contexts = createSandboxJsEvaluator(createSandboxJsReplayState());
    for (let i = 0; i < MAX_SANDBOX_JS_CONTEXTS; i += 1) {
      contexts.evaluator.createContext();
    }
    expect(
      suspension(() => contexts.evaluator.createContext()).control,
    ).toBe("js-limit");

    const state = createSandboxJsReplayState();
    for (let i = 0; i < MAX_SANDBOX_JS_EVALUATIONS; i += 1) {
      state.jsReplay.push({
        request: { contextId: 1, kind: "eval", script: String(i) },
        result: String(i),
      });
    }
    const { evaluator } = createSandboxJsEvaluator(state);
    const context = evaluator.createContext();
    for (let i = 0; i < MAX_SANDBOX_JS_EVALUATIONS; i += 1) {
      expect(context.eval(String(i))).toBe(String(i));
    }
    expect(suspension(() => context.eval("one more")).control).toBe(
      "js-limit",
    );
  });
});
