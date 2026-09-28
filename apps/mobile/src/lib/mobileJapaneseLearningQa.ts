import type { MobileJapaneseLearningOcrResult } from "./mobileJapaneseLearningOcr";
import type {
  MobileJapaneseLearningChatResult,
  MobileJapaneseLearningChatStreamCallbacks,
} from "./mobileJapaneseLearningChat";
import { throwIfMobileJapaneseLearningAborted } from "./mobileJapaneseLearningSafety";

export type MobileJapaneseLearningQaScenario =
  | "success"
  | "loading"
  | "empty"
  | "error";

export function resolveMobileJapaneseLearningQaScenario(
  enabled: string | undefined,
  scenario: string | undefined,
): MobileJapaneseLearningQaScenario | null {
  if (enabled !== "1") return null;
  switch (scenario) {
    case "loading":
    case "empty":
    case "error":
      return scenario;
    default:
      return "success";
  }
}

/** Static property accesses are required for Expo's build-time env substitution. */
export function getMobileJapaneseLearningQaScenario(
  service: "ocr" | "chat",
): MobileJapaneseLearningQaScenario | null {
  return resolveMobileJapaneseLearningQaScenario(
    process.env.EXPO_PUBLIC_JAPANESE_LEARNING_QA,
    service === "ocr"
      ? process.env.EXPO_PUBLIC_QA_OCR
      : process.env.EXPO_PUBLIC_QA_CHAT,
  );
}

function waitForQaState(signal: AbortSignal, delayMs: number | null) {
  throwIfMobileJapaneseLearningAborted(signal);
  return new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      if (timer !== undefined) clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    };
    const abort = () => {
      cleanup();
      const error = new Error("QA fixture cancelled.");
      error.name = "AbortError";
      reject(error);
    };
    signal.addEventListener("abort", abort, { once: true });
    if (delayMs !== null) {
      timer = setTimeout(() => {
        cleanup();
        resolve();
      }, delayMs);
    }
  });
}

export async function runMobileJapaneseLearningQaOcr(
  scenario: MobileJapaneseLearningQaScenario,
  signal: AbortSignal,
): Promise<MobileJapaneseLearningOcrResult> {
  await waitForQaState(signal, scenario === "loading" ? null : 800);
  if (scenario === "error") throw new Error("[QA fixture] OCR service unavailable.");
  if (scenario === "empty") return { source: "ocr", detections: [], text: "" };
  const lines = [
    "[QA fixture] 今日はいい天気ですね。",
    "一緒に図書館へ行きませんか？",
    "読みたい本がたくさんあります。ゆっくり探しましょう。",
  ];
  return {
    source: "ocr",
    text: lines.join("\n"),
    // Deliberately synthetic positions, for hit target/selection UI only.
    detections: lines.map((text, order) => ({
      x1: 40 + order * 20,
      y1: 40 + order * 150,
      x2: 280 + order * 20,
      y2: 160 + order * 150,
      conf: 0.99,
      cls: 0,
      label: "ja",
      order,
      text,
    })),
  };
}

export async function runMobileJapaneseLearningQaChat(
  scenario: MobileJapaneseLearningQaScenario,
  signal: AbortSignal,
  callbacks?: MobileJapaneseLearningChatStreamCallbacks,
): Promise<MobileJapaneseLearningChatResult> {
  throwIfMobileJapaneseLearningAborted(signal);
  callbacks?.onStreamStart?.();
  callbacks?.onActivity?.("llm");
  await waitForQaState(signal, scenario === "loading" ? null : 800);
  if (scenario === "error") throw new Error("[QA fixture] Chat service unavailable.");
  if (scenario === "empty") {
    callbacks?.onDone?.();
    return { kind: "text", text: "", suggestions: [] };
  }
  const chunks = [
    "[QA fixture — UI preview]\n\n",
    "「一緒に図書館へ行きませんか？」 means “Would you like to go to the library together?”\n\n",
    "**一緒に** means “together”. **へ** marks the destination, and **ませんか** is a polite invitation.\n\n",
    "Try replying: 「いいですね。一緒に行きましょう！」\n（That sounds good. Let's go together!）",
  ];
  for (const chunk of chunks) {
    await waitForQaState(signal, 160);
    callbacks?.onText?.(chunk);
  }
  const suggestions = [
    "Explain ませんか vs ましょう",
    "この文をもっと簡単な日本語にして",
    "Give me a longer example with furigana and an English translation",
  ];
  callbacks?.onFollowups?.(suggestions);
  callbacks?.onDone?.();
  // No voice/tool callbacks: a visual fixture must not invoke real services.
  return { kind: "text", text: chunks.join(""), suggestions };
}

/**
 * `EXPO_PUBLIC_JL_QA_TIMELINE=1` (with the QA fixtures): once a sentence's
 * tokens are ready the sentence view walks its states for screenshots —
 * select the first word, then a range, then ask nemu about the range. For
 * simulators whose synthesized taps do not reach the inner display.
 */
export const MOBILE_JAPANESE_LEARNING_QA_TIMELINE =
  process.env.EXPO_PUBLIC_JAPANESE_LEARNING_QA === "1" &&
  process.env.EXPO_PUBLIC_JL_QA_TIMELINE === "1";

export type MobileJapaneseLearningQaTimelineStep =
  | { atMs: number; kind: "token"; index: number }
  | { atMs: number; kind: "range"; start: number; end: number }
  | { atMs: number; kind: "ask" };

export function mobileJapaneseLearningQaTimeline(tokenCount: number): MobileJapaneseLearningQaTimelineStep[] {
  if (tokenCount <= 0) return [];
  // The fixture line starts with a "[QA fixture]" marker token: pick the first word after it.
  const steps: MobileJapaneseLearningQaTimelineStep[] = [
    { atMs: 5000, kind: "token", index: Math.min(1, tokenCount - 1) },
  ];
  if (tokenCount >= 4) {
    steps.push({ atMs: 11000, kind: "range", start: 1, end: 3 });
    steps.push({ atMs: 17000, kind: "ask" });
  }
  return steps;
}
