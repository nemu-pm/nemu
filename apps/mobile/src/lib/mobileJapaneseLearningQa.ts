import type { Href } from "expo-router";
import type { MobileJapaneseLearningOcrResult, MobileOcrDetection } from "./mobileJapaneseLearningOcr";
import { getMobileSourceReaderHref } from "./mobileSourceRoutes";
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
  timeline?: string | undefined,
): MobileJapaneseLearningQaScenario | null {
  // The real-pipeline timeline never serves fixture data, whatever else is set.
  if (enabled !== "1" || timeline === "real") return null;
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
    process.env.EXPO_PUBLIC_JL_QA_TIMELINE,
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

/**
 * `anchors`: real text boxes found on the page (in reading order). The fixture
 * lines take those boxes so the detection overlay and the bubble popout point
 * at actual bubbles on whatever page is open; lines without an anchor keep a
 * synthetic box.
 */
export async function runMobileJapaneseLearningQaOcr(
  scenario: MobileJapaneseLearningQaScenario,
  signal: AbortSignal,
  anchors: ReadonlyArray<Pick<MobileOcrDetection, "x1" | "y1" | "x2" | "y2">> = [],
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
      ...(anchors[order] ?? {
        x1: 40 + order * 20,
        y1: 40 + order * 150,
        x2: 280 + order * 20,
        y2: 160 + order * 150,
      }),
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
  await waitForQaState(
    signal,
    scenario === "loading" ? null : mobileJapaneseLearningQaChatDelayMs(MOBILE_JAPANESE_LEARNING_QA_TIMELINE),
  );
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
 * - `fixture`: `EXPO_PUBLIC_JL_QA_TIMELINE=1` with the QA fixtures
 *   (`EXPO_PUBLIC_JAPANESE_LEARNING_QA=1`) — the fixture sentence, for pixel
 *   comparison with the web reference captures.
 * - `real`: `EXPO_PUBLIC_JL_QA_TIMELINE=real` — the same taps against the
 *   real pipeline (on-device or cloud OCR, the real analyzer, the real chat
 *   backend and TTS). Fixtures are forced off and no artificial holds are
 *   added; only the taps are automated.
 */
export type MobileJapaneseLearningQaTimelineMode = "fixture" | "real";

export function resolveMobileJapaneseLearningQaTimelineMode(
  fixtures: string | undefined,
  timeline: string | undefined,
): MobileJapaneseLearningQaTimelineMode | null {
  if (timeline === "real") return "real";
  return fixtures === "1" && timeline === "1" ? "fixture" : null;
}

export const MOBILE_JAPANESE_LEARNING_QA_TIMELINE_MODE =
  resolveMobileJapaneseLearningQaTimelineMode(
    process.env.EXPO_PUBLIC_JAPANESE_LEARNING_QA,
    process.env.EXPO_PUBLIC_JL_QA_TIMELINE,
  );

/**
 * Once a sentence's tokens are ready the sentence view walks the web
 * reference states for screenshots — select the first word, then the first
 * conjugated word, then a range, then ask nemu about the sentence. For
 * simulators whose synthesized taps do not reach the inner display.
 */
export const MOBILE_JAPANESE_LEARNING_QA_TIMELINE =
  MOBILE_JAPANESE_LEARNING_QA_TIMELINE_MODE !== null;

/**
 * The demo chapter for real-pipeline runs: 地縛少年 花子くん ch.1 (Japanese
 * raw) on the Aidoku community Soraraw source. The `real` timeline opens it
 * on launch (MobileJapaneseLearningQaDemoLauncher);
 * `artifacts/mobile-review-20260926/demo-chapter.txt` mirrors it.
 */
export const MOBILE_JAPANESE_LEARNING_QA_DEMO_CHAPTER = {
  registryId: "aidoku-community",
  sourceId: "ja.soraraw",
  mangaId: "chi-baku-shounen-hanako-kun-57356",
  mangaTitle: "地縛少年 花子くん",
  chapterId: "57356/424746",
  // 「花子さんってどうやって願いを叶えるの？やっぱり特別な道具を使うとか？」
  page: 8,
} as const;

/** The reader route of the demo chapter, opened on its 1-based demo page. */
export function mobileJapaneseLearningQaDemoChapterHref(
  chapter: typeof MOBILE_JAPANESE_LEARNING_QA_DEMO_CHAPTER = MOBILE_JAPANESE_LEARNING_QA_DEMO_CHAPTER,
): Href {
  return getMobileSourceReaderHref({
    registryId: chapter.registryId,
    sourceId: chapter.sourceId,
    mangaId: chapter.mangaId,
    chapter: { id: chapter.chapterId },
    mangaTitle: chapter.mangaTitle,
    page: chapter.page,
  });
}

/**
 * Which detection the QA panel selects. The fixture timeline analyzes the
 * fixture's second line (the web reference captures do); a real page picks
 * the most substantial Japanese line — the most kana/kanji, then the highest
 * confidence — so the demo never lands on a sound effect or a stray glyph.
 */
export function pickMobileJapaneseLearningQaDetection<
  T extends { text?: string; conf?: number },
>(detections: readonly T[], mode: MobileJapaneseLearningQaTimelineMode | null): T | null {
  if (mode !== "real") return detections[1] ?? detections[0] ?? null;
  let best: T | null = null;
  let bestScore = -1;
  for (const detection of detections) {
    const japanese = (detection.text ?? "").match(/[\u3040-\u30ff\u3400-\u9fff]/g)?.length ?? 0;
    if (japanese < 4) continue;
    // Beyond ~24 characters a line is long enough; confidence then decides.
    const score = Math.min(japanese, 24) + (detection.conf ?? 0);
    if (score > bestScore) {
      best = detection;
      bestScore = score;
    }
  }
  return best ?? detections[0] ?? null;
}

export type MobileJapaneseLearningQaTimelineStep =
  | { atMs: number; kind: "token"; index: number }
  | { atMs: number; kind: "range"; start: number; end: number }
  | { atMs: number; kind: "ask" };

/**
 * `conjugatedIndex`: the first token with a conjugation breakdown (web ref 06),
 * or -1 when the sentence has none. `longestIndex`: the token with the most
 * meanings (a definition taller than the details pane), or -1.
 */
export function mobileJapaneseLearningQaTimeline(
  tokenCount: number,
  conjugatedIndex = -1,
  longestIndex = -1,
): MobileJapaneseLearningQaTimelineStep[] {
  if (tokenCount <= 0) return [];
  const steps: MobileJapaneseLearningQaTimelineStep[] = [
    { atMs: 5000, kind: "token", index: 0 },
  ];
  if (conjugatedIndex > 0 && conjugatedIndex < tokenCount) {
    steps.push({ atMs: 11000, kind: "token", index: conjugatedIndex });
  }
  if (longestIndex > 0 && longestIndex < tokenCount && longestIndex !== conjugatedIndex) {
    steps.push({ atMs: 14000, kind: "token", index: longestIndex });
  }
  if (tokenCount >= 4) {
    steps.push({ atMs: 17000, kind: "range", start: 1, end: 3 });
    steps.push({ atMs: 23000, kind: "ask" });
  }
  return steps;
}

/** QA timeline: how long the sentence view stays on "Analyzing sentence…" (web ref 03). */
export const MOBILE_JAPANESE_LEARNING_QA_ANALYZING_HOLD_MS = 3000;

/** QA chat: how long the typing indicator shows before the reply streams (long enough to capture). */
export function mobileJapaneseLearningQaChatDelayMs(timeline: boolean): number {
  return timeline ? 4000 : 800;
}
