import { describe, expect, test } from "bun:test";
import {
  attachMobileJapaneseLearningChatToolResults,
  createMobileJapaneseLearningChatStreamController,
  getMobileJapaneseLearningChatSpeakDelay,
  markMobileJapaneseLearningChatLastUserMessageRead,
  mobileJapaneseLearningChatContextRetryMessages,
  MOBILE_JAPANESE_LEARNING_CHAT_NETWORK_ERROR,
  truncateMobileJapaneseLearningChatOldestHalf,
  upsertMobileJapaneseLearningChatContextSnapshot,
  type MobileJapaneseLearningChatStoreMessage,
  type MobileJapaneseLearningChatTimers,
} from "./mobileJapaneseLearningChatStream";

/** Deterministic stand-in for setTimeout (web actions.ts uses real timers). */
function createFakeTimers() {
  let now = 0;
  let nextId = 1;
  const pending = new Map<number, { at: number; callback: () => void }>();
  const timers: MobileJapaneseLearningChatTimers = {
    setTimeout: (callback, ms) => {
      const id = nextId++;
      pending.set(id, { at: now + ms, callback });
      return id;
    },
    clearTimeout: (handle) => {
      pending.delete(handle as number);
    },
  };
  const advance = (ms: number) => {
    const target = now + ms;
    for (;;) {
      let due: [number, { at: number; callback: () => void }] | null = null;
      for (const entry of pending) {
        if (entry[1].at <= target && (!due || entry[1].at < due[1].at)) due = entry;
      }
      if (!due) break;
      pending.delete(due[0]);
      now = due[1].at;
      due[1].callback();
    }
    now = target;
  };
  return { timers, advance, pendingCount: () => pending.size };
}

/** Minimal web `useNemuChatStore` recording what the drawer would render. */
function createStore() {
  const state = {
    messages: [] as Array<{
      id: string;
      content: string;
      hidden?: boolean;
      kind?: string;
      ttsText?: string;
      toolCalls?: unknown[];
      toolResults?: unknown[];
    }>,
    streaming: true,
    typing: false,
    followUps: [] as string[],
    readMarks: 0,
    snapshots: [] as Array<[string, string]>,
    prefetched: [] as Array<[string, string]>,
  };
  let id = 0;
  return {
    state,
    store: {
      addAssistantMessage: (
        content: string,
        toolCalls?: unknown[],
        options?: { hidden?: boolean; kind?: "text" | "voice"; ttsText?: string },
      ) => {
        id += 1;
        state.messages.push({ id: `m${id}`, content, toolCalls, ...options });
        return `m${id}`;
      },
      setStreaming: (value: boolean) => {
        state.streaming = value;
      },
      setShowTypingIndicator: (value: boolean) => {
        state.typing = value;
      },
      setFollowUps: (value: string[]) => {
        state.followUps = value;
      },
      addToolResults: (results: unknown[]) => {
        const last = state.messages[state.messages.length - 1];
        if (last?.toolCalls) last.toolResults = results;
      },
      markLastUserMessageRead: () => {
        state.readMarks += 1;
      },
      upsertContextSnapshot: (key: string, content: string) => {
        state.snapshots.push([key, content]);
      },
      prefetchVoice: (messageId: string, ttsText: string) => {
        state.prefetched.push([messageId, ttsText]);
      },
    },
  };
}

function setup() {
  const clock = createFakeTimers();
  const { state, store } = createStore();
  const controller = createMobileJapaneseLearningChatStreamController(
    store,
    clock.timers,
  );
  const visible = () => state.messages.filter((m) => !m.hidden).map((m) => m.content);
  return { clock, state, controller, visible };
}

describe("web speak pacing (actions.ts getSpeakDelay)", () => {
  test("300ms + 25ms per non-space character, clamped to 500–2200ms", () => {
    expect(getMobileJapaneseLearningChatSpeakDelay("hi")).toBe(500);
    expect(getMobileJapaneseLearningChatSpeakDelay("a b c d e f g h i j")).toBe(550);
    expect(getMobileJapaneseLearningChatSpeakDelay("x".repeat(40))).toBe(1300);
    expect(getMobileJapaneseLearningChatSpeakDelay("x".repeat(500))).toBe(2200);
  });
});

describe("createMobileJapaneseLearningChatStreamController", () => {
  test("stream start marks the question read and shows optimistic dots for 5s", () => {
    const { clock, state, controller } = setup();
    controller.onStreamStart();
    expect(state.readMarks).toBe(1);
    expect(state.typing).toBe(true);
    clock.advance(4999);
    expect(state.typing).toBe(true);
    clock.advance(1);
    expect(state.typing).toBe(false);
    // Read receipt flips once per request.
    controller.onSpeak("hello");
    expect(state.readMarks).toBe(1);
  });

  test("backend activity pulses the dots for 700ms; follow-up generation does not", () => {
    const { clock, state, controller } = setup();
    controller.onStreamStart();
    controller.onActivity("llm");
    clock.advance(699);
    expect(state.typing).toBe(true);
    clock.advance(1);
    expect(state.typing).toBe(false);
    controller.onActivity("llm", "suggest_followups");
    expect(state.typing).toBe(false);
  });

  test("the first speak bubble lands at once; later ones wait for their typing delay after a 350ms gap", () => {
    const { clock, state, controller, visible } = setup();
    controller.onStreamStart();
    controller.onSpeak("こんにちは！");
    expect(visible()).toEqual(["こんにちは！"]);
    // Speak bubbles are the output: the optimistic dots go away.
    expect(state.typing).toBe(false);

    const second = "This sentence means “shall we go together?”";
    controller.onSpeak(second);
    controller.onSpeak("Try it!");
    controller.onDone();
    // Still one bubble: the gap timer holds the queue.
    clock.advance(349);
    expect(visible()).toHaveLength(1);
    clock.advance(1);
    // Gap elapsed; the second bubble waits its own delay.
    const secondDelay = getMobileJapaneseLearningChatSpeakDelay(second);
    clock.advance(secondDelay - 1);
    expect(visible()).toHaveLength(1);
    clock.advance(1);
    expect(visible()).toEqual(["こんにちは！", second]);
    expect(state.streaming).toBe(true);

    clock.advance(350 + getMobileJapaneseLearningChatSpeakDelay("Try it!"));
    expect(visible()).toEqual(["こんにちは！", second, "Try it!"]);
    // The stream finishes only after the last gap.
    expect(state.streaming).toBe(true);
    clock.advance(350);
    expect(state.streaming).toBe(false);
    expect(state.typing).toBe(false);
  });

  test("text events are buffered and shown as one bubble at done", () => {
    const { clock, state, controller, visible } = setup();
    controller.onStreamStart();
    controller.onText("Hello ");
    controller.onText("there");
    expect(visible()).toEqual([]);
    expect(state.typing).toBe(true);
    controller.onDone();
    expect(visible()).toEqual(["Hello there"]);
    clock.advance(350);
    expect(state.streaming).toBe(false);
  });

  test("follow-ups stop the dots and publish suggestions", () => {
    const { state, controller } = setup();
    controller.onStreamStart();
    controller.onSpeak("Answer");
    controller.onFollowups(["Explain ませんか"]);
    expect(state.followUps).toEqual(["Explain ませんか"]);
    expect(state.typing).toBe(false);
    // No dots once the follow-up phase began.
    controller.onActivity("llm");
    expect(state.typing).toBe(false);
  });

  test("client tools: hidden tool turn, dots until results, then silence", () => {
    const { clock, state, controller } = setup();
    controller.onStreamStart();
    controller.onActivity("client_tools");
    const toolCalls = [{ toolCallId: "t1", toolName: "request_transcript", args: { pageNumber: 3 } }];
    controller.onToolsAwaiting(toolCalls, "");
    expect(state.messages).toEqual([
      { id: "m1", content: "", toolCalls, hidden: true },
    ]);
    expect(state.typing).toBe(true);
    // Activity pulses cannot end client-tool dots.
    controller.onActivity("llm");
    clock.advance(5000);
    expect(state.typing).toBe(true);
    const results = [{ toolCallId: "t1", toolName: "request_transcript", result: "text" }];
    controller.onToolResults(results);
    expect(state.messages[0]?.toolResults).toEqual(results);
    expect(state.typing).toBe(false);
  });

  test("voice bubbles land immediately with audio tags stripped and are prefetched", () => {
    const { state, controller } = setup();
    controller.onStreamStart();
    controller.onVoice("[cheerful] こんにちは [laughs]");
    expect(state.messages).toEqual([
      { id: "m1", content: "こんにちは", toolCalls: undefined, kind: "voice", ttsText: "[cheerful] こんにちは [laughs]" },
    ]);
    expect(state.prefetched).toEqual([["m1", "[cheerful] こんにちは [laughs]"]]);
  });

  test("errors add web's plain assistant bubble and end the stream at once", () => {
    const { clock, state, controller, visible } = setup();
    controller.onStreamStart();
    controller.onSpeak("one");
    controller.onSpeak("two");
    controller.onError("");
    expect(visible()).toEqual(["one", MOBILE_JAPANESE_LEARNING_CHAT_NETWORK_ERROR]);
    expect(state.streaming).toBe(false);
    expect(state.typing).toBe(false);
    clock.advance(10_000);
    // The queued speak line was dropped.
    expect(visible()).toEqual(["one", MOBILE_JAPANESE_LEARNING_CHAT_NETWORK_ERROR]);
    expect(controller.isCompleted()).toBe(true);
  });

  test("JSON-shaped error payloads fall back to the network error text; plain ones show as-is", () => {
    const first = setup();
    first.controller.onError('{"error":"boom"}');
    expect(first.visible()).toEqual([MOBILE_JAPANESE_LEARNING_CHAT_NETWORK_ERROR]);
    const second = setup();
    second.controller.onError("Please sign in to use this feature");
    expect(second.visible()).toEqual(["Please sign in to use this feature"]);
  });

  test("cancellation drops queued bubbles without touching the shared streaming flags", () => {
    const { clock, state, controller, visible } = setup();
    controller.onStreamStart();
    controller.onSpeak("one");
    controller.onSpeak("two");
    state.typing = true;
    controller.onCancelled();
    clock.advance(10_000);
    expect(visible()).toEqual(["one"]);
    // The replacing request owns these now.
    expect(state.streaming).toBe(true);
    expect(state.typing).toBe(true);
    expect(clock.pendingCount()).toBe(0);
  });
});

describe("web store thread helpers", () => {
  const message = (
    over: Partial<MobileJapaneseLearningChatStoreMessage> & { id: string },
  ): MobileJapaneseLearningChatStoreMessage => ({
    role: "user",
    text: "x",
    createdAt: 0,
    ...over,
  });

  test("markLastUserMessageRead flips only the newest unread user message", () => {
    const out = markMobileJapaneseLearningChatLastUserMessageRead([
      message({ id: "1" }),
      message({ id: "2", role: "assistant" }),
      message({ id: "3" }),
    ]);
    expect(out.map((m) => m.isRead ?? false)).toEqual([false, false, true]);
  });

  test("context snapshots go before the newest visible question and dedupe on the newest snapshot key", () => {
    const snapshot = (id: string, key: string) =>
      message({ id, text: `NEMU_CTX_SNAPSHOT_V1 key=${key}\nbody`, hidden: true, isRead: true });
    const thread = [message({ id: "q1" }), message({ id: "a1", role: "assistant" }), message({ id: "q2" })];
    const once = upsertMobileJapaneseLearningChatContextSnapshot(thread, "page-3", snapshot("s1", "page-3"));
    expect(once.map((m) => m.id)).toEqual(["q1", "a1", "s1", "q2"]);
    const twice = upsertMobileJapaneseLearningChatContextSnapshot(once, "page-3", snapshot("s2", "page-3"));
    expect(twice).toBe(once);
    const other = upsertMobileJapaneseLearningChatContextSnapshot(once, "page-4", snapshot("s3", "page-4"));
    expect(other.map((m) => m.id)).toEqual(["q1", "a1", "s1", "s3", "q2"]);
  });

  test("tool results attach only to a trailing tool-call turn", () => {
    const results = [{ toolCallId: "t", toolName: "trigger_ocr", result: "ok" }];
    const withCall = [message({ id: "a", role: "assistant", toolCalls: [{ toolCallId: "t", toolName: "trigger_ocr", args: {} }] })];
    expect(attachMobileJapaneseLearningChatToolResults(withCall, results)[0]?.toolResults).toEqual(results);
    const plain = [message({ id: "a", role: "assistant" })];
    expect(attachMobileJapaneseLearningChatToolResults(plain, results)).toBe(plain);
  });
});

describe("context_too_long truncation (web truncateOldestHalf)", () => {
  const thread = (roles: ("user" | "assistant")[]): MobileJapaneseLearningChatStoreMessage[] =>
    roles.map((role, index) => ({
      id: String(index),
      role,
      text: `${role}-${index}`,
      createdAt: index,
    }));

  test("drops the oldest ceil(n/2) messages and keeps two or fewer", () => {
    expect(truncateMobileJapaneseLearningChatOldestHalf([1, 2, 3, 4, 5])).toEqual([4, 5]);
    expect(truncateMobileJapaneseLearningChatOldestHalf([1, 2, 3, 4])).toEqual([3, 4]);
    expect(truncateMobileJapaneseLearningChatOldestHalf([1, 2])).toEqual([1, 2]);
    expect(truncateMobileJapaneseLearningChatOldestHalf([])).toEqual([]);
  });

  test("a stored user turn is replaced by the prompt (web withoutLastUser)", () => {
    const truncated = truncateMobileJapaneseLearningChatOldestHalf(
      thread(["user", "assistant", "user", "assistant", "user"]),
    );
    expect(
      mobileJapaneseLearningChatContextRetryMessages(truncated, "prompt", true),
    ).toEqual([
      { role: "assistant", content: "assistant-3" },
      { role: "user", content: "prompt" },
    ]);
  });

  test("the unstored greeting prompt is appended to the truncated thread", () => {
    const truncated = truncateMobileJapaneseLearningChatOldestHalf(
      thread(["user", "assistant", "user", "assistant"]),
    );
    expect(
      mobileJapaneseLearningChatContextRetryMessages(truncated, "hello", false),
    ).toEqual([
      { role: "user", content: "user-2" },
      { role: "assistant", content: "assistant-3" },
      { role: "user", content: "hello" },
    ]);
  });

  test("tool results stay attached to their assistant turn", () => {
    const [first, second] = thread(["user", "assistant"]);
    const withTools: MobileJapaneseLearningChatStoreMessage[] = [
      first!,
      {
        ...second!,
        toolCalls: [{ toolCallId: "t", toolName: "ocr", args: {} }],
        toolResults: [{ toolCallId: "t", toolName: "ocr", result: "ok" }],
      },
    ];
    expect(
      mobileJapaneseLearningChatContextRetryMessages(withTools, "p", true),
    ).toEqual([
      { role: "user", content: "user-0" },
      {
        role: "assistant",
        content: "assistant-1",
        toolCalls: [{ toolCallId: "t", toolName: "ocr", args: {} }],
      },
      { role: "tool", toolResults: [{ toolCallId: "t", toolName: "ocr", result: "ok" }] },
      { role: "user", content: "p" },
    ]);
  });
});
