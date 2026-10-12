import { describe, expect, test } from "bun:test";
import {
  MOBILE_JAPANESE_LEARNING_QA_DEMO_CHAPTER,
  mobileJapaneseLearningQaDemoChapterHref,
  pickMobileJapaneseLearningQaDetection,
  resolveMobileJapaneseLearningQaScenario,
  resolveMobileJapaneseLearningQaTimelineMode,
  runMobileJapaneseLearningQaChat,
  runMobileJapaneseLearningQaOcr,
} from "./mobileJapaneseLearningQa";
import { runMobileJapaneseLearningOcr } from "./mobileJapaneseLearningOcr";
import { runMobileJapaneseLearningChat } from "./mobileJapaneseLearningChat";

describe("Japanese Learning QA real-pipeline timeline", () => {
  test("real mode needs only the timeline flag and always disables fixtures", () => {
    expect(resolveMobileJapaneseLearningQaTimelineMode(undefined, "real")).toBe("real");
    expect(resolveMobileJapaneseLearningQaTimelineMode("1", "real")).toBe("real");
    expect(resolveMobileJapaneseLearningQaTimelineMode("1", "1")).toBe("fixture");
    expect(resolveMobileJapaneseLearningQaTimelineMode(undefined, "1")).toBeNull();
    expect(resolveMobileJapaneseLearningQaTimelineMode("1", undefined)).toBeNull();
    expect(resolveMobileJapaneseLearningQaScenario("1", "success", "real")).toBeNull();
    expect(resolveMobileJapaneseLearningQaScenario("1", "success", "1")).toBe("success");
  });

  test("fixture mode keeps analyzing the second fixture line", () => {
    const detections = [{ text: "a" }, { text: "b" }, { text: "c" }];
    expect(pickMobileJapaneseLearningQaDetection(detections, "fixture")).toBe(detections[1]!);
    expect(pickMobileJapaneseLearningQaDetection([detections[0]!], null)).toBe(detections[0]!);
    expect(pickMobileJapaneseLearningQaDetection([], "real")).toBeNull();
  });

  test("real mode picks the most substantial Japanese line, not a sound effect", () => {
    const detections = [
      { text: "ドドド", conf: 0.99 },
      { text: "HANAKO", conf: 1 },
      { text: "花子さん、花子さん", conf: 0.4 },
      { text: "いらっしゃいますか？", conf: 0.9 },
    ];
    expect(pickMobileJapaneseLearningQaDetection(detections, "real")).toBe(detections[3]!);
    // Nothing substantial: fall back to the first detection rather than nothing.
    expect(pickMobileJapaneseLearningQaDetection(detections.slice(0, 2), "real")).toBe(detections[0]!);
  });

  test("the demo chapter opens the Hanako-kun raw on its demo page", () => {
    const href = String(mobileJapaneseLearningQaDemoChapterHref());
    expect(href).toBe(
      `/sources/aidoku-community/ja.soraraw/chi-baku-shounen-hanako-kun-57356/57356%2F424746?page=${MOBILE_JAPANESE_LEARNING_QA_DEMO_CHAPTER.page}&mangaTitle=${encodeURIComponent("地縛少年 花子くん")}`,
    );
  });
});

describe("Japanese Learning QA fixtures", () => {
  test("requires the explicit QA build flag, including for valid scenarios", () => {
    for (const flag of [undefined, "", "0", "true"]) {
      expect(resolveMobileJapaneseLearningQaScenario(flag, "success")).toBeNull();
      expect(resolveMobileJapaneseLearningQaScenario(flag, "error")).toBeNull();
    }
    expect(resolveMobileJapaneseLearningQaScenario("1", undefined)).toBe("success");
    expect(resolveMobileJapaneseLearningQaScenario("1", "typo")).toBe("success");
    for (const state of ["success", "loading", "empty", "error"] as const) {
      expect(resolveMobileJapaneseLearningQaScenario("1", state)).toBe(state);
    }
  });

  test("loading remains pending until cancellation and emits no late chat text", async () => {
    const controller = new AbortController();
    const text: string[] = [];
    const ocr = runMobileJapaneseLearningQaOcr("loading", controller.signal);
    const chat = runMobileJapaneseLearningQaChat("loading", controller.signal, {
      onText: (chunk) => text.push(chunk),
    });
    const settled = Promise.allSettled([ocr, chat]);
    controller.abort();
    expect(await settled).toEqual([
      expect.objectContaining({ status: "rejected", reason: expect.objectContaining({ name: "AbortError" }) }),
      expect.objectContaining({ status: "rejected", reason: expect.objectContaining({ name: "AbortError" }) }),
    ]);
    expect(text).toEqual([]);
  });

  test("empty and error scenarios reach the real callers' state handlers", async () => {
    const signal = new AbortController().signal;
    const outcomes = await Promise.allSettled([
      runMobileJapaneseLearningQaOcr("empty", signal),
      runMobileJapaneseLearningQaChat("empty", signal),
      runMobileJapaneseLearningQaOcr("error", signal),
      runMobileJapaneseLearningQaChat("error", signal),
    ]);
    expect(outcomes[0]).toMatchObject({ status: "fulfilled", value: { text: "", detections: [] } });
    expect(outcomes[1]).toMatchObject({ status: "fulfilled", value: { text: "", suggestions: [] } });
    expect(outcomes[2]).toMatchObject({ status: "rejected", reason: new Error("[QA fixture] OCR service unavailable.") });
    expect(outcomes[3]).toMatchObject({ status: "rejected", reason: new Error("[QA fixture] Chat service unavailable.") });
  });

  test("opt-in service entries bypass image IO, authentication, and network", async () => {
    const keys = ["EXPO_PUBLIC_JAPANESE_LEARNING_QA", "EXPO_PUBLIC_QA_OCR", "EXPO_PUBLIC_QA_CHAT"] as const;
    const previous = keys.map((key) => process.env[key]);
    try {
      process.env.EXPO_PUBLIC_JAPANESE_LEARNING_QA = "1";
      process.env.EXPO_PUBLIC_QA_OCR = "success";
      process.env.EXPO_PUBLIC_QA_CHAT = "success";
      let networkCalls = 0;
      const noNetwork = (() => { networkCalls++; throw new Error("must not call network"); }) as unknown as typeof fetch;
      const ocr = await runMobileJapaneseLearningOcr({ imageUri: "file:///not-a-real-file.png", text: "real source text" }, {
        fetchImpl: noNetwork,
        readFileBytes: async () => { throw new Error("must not read images"); },
      });
      expect(ocr.text).toContain("[QA fixture]");
      expect(ocr.detections).toHaveLength(3);
      const chunks: string[] = [];
      let done = 0;
      let voiceOrTool = 0;
      const result = await runMobileJapaneseLearningChat({
        appLanguage: "en",
        chapter: { id: "qa-chapter" },
        mangaTitle: "QA fixture",
        pageCount: 1,
        pageNumber: 1,
        fetchImpl: noNetwork,
        getAuthCookie: () => { throw new Error("must not read auth"); },
        callbacks: {
          onText: (chunk) => chunks.push(chunk),
          onDone: () => { done++; },
          onVoice: () => { voiceOrTool++; },
          onToolCall: () => { voiceOrTool++; },
        },
      });
      expect(result.text).toBe(chunks.join(""));
      expect(result.text).toContain("[QA fixture");
      expect(result.suggestions).toHaveLength(3);
      expect(done).toBe(1);
      expect(voiceOrTool).toBe(0);
      expect(networkCalls).toBe(0);
    } finally {
      keys.forEach((key, index) => {
        if (previous[index] === undefined) delete process.env[key];
        else process.env[key] = previous[index];
      });
    }
  });
});

describe("sentence QA timeline", () => {
  test("walks word → conjugated word → range → ask for a multi-word sentence", async () => {
    const { mobileJapaneseLearningQaTimeline } = await import("./mobileJapaneseLearningQa");
    expect(mobileJapaneseLearningQaTimeline(0)).toEqual([]);
    expect(mobileJapaneseLearningQaTimeline(1).map((step) => step.kind)).toEqual(["token"]);
    expect(mobileJapaneseLearningQaTimeline(6).map((step) => step.kind)).toEqual(["token", "range", "ask"]);
    const steps = mobileJapaneseLearningQaTimeline(6, 3);
    expect(steps.map((step) => step.kind)).toEqual(["token", "token", "range", "ask"]);
    expect(steps[1]).toEqual({ atMs: 11000, kind: "token", index: 3 });
    expect(steps.map((step) => step.atMs)).toEqual([...steps.map((step) => step.atMs)].sort((a, b) => a - b));
    // The token with the most meanings gets its own step (a long definition).
    const withLongest = mobileJapaneseLearningQaTimeline(6, 3, 2);
    expect(withLongest.map((step) => step.kind)).toEqual(["token", "token", "token", "range", "ask"]);
    expect(withLongest[2]).toEqual({ atMs: 14000, kind: "token", index: 2 });
    expect(withLongest.map((step) => step.atMs)).toEqual([...withLongest.map((step) => step.atMs)].sort((a, b) => a - b));
    expect(mobileJapaneseLearningQaTimeline(6, 3, 3)).toHaveLength(4);
  });

  test("keeps the typing indicator up long enough to capture in timeline builds", async () => {
    const { mobileJapaneseLearningQaChatDelayMs } = await import("./mobileJapaneseLearningQa");
    expect(mobileJapaneseLearningQaChatDelayMs(false)).toBe(800);
    expect(mobileJapaneseLearningQaChatDelayMs(true)).toBeGreaterThanOrEqual(3000);
  });
});
