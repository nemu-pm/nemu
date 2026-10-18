import { expect, test } from "bun:test";
import type { MobileReaderPage } from "@/sources/mobileSourcePages";
import type { MobileJapaneseLearningOcrResult } from "./mobileJapaneseLearningOcr";
import {
  createMobileJapaneseLearningChatPageTools,
  type MobileJapaneseLearningChatPageSnapshot,
} from "./mobileJapaneseLearningChatPageTools";
import { createMobileJapaneseLearningPageOcrStore } from "./mobileJapaneseLearningPageOcrStore";

const result = (text: string): MobileJapaneseLearningOcrResult => ({
  source: "ocr",
  text,
  detections: [],
});

/** A chapter whose pages past the first two still need the page processor. */
function chapter(count: number): MobileReaderPage[] {
  return Array.from({ length: count }, (_, index): MobileReaderPage =>
    index < 2
      ? {
          id: `p${index + 1}`,
          index,
          imageUri: `data:image/jpeg;base64,PAGE${index + 1}`,
          imageUriOwnership: "app",
          imageProcessing: "ready",
        }
      : {
          id: `p${index + 1}`,
          index,
          imageUri: `https://img.example/scrambled-${index + 1}.jpg`,
          imageUriOwnership: "source",
          imageProcessing: "pending",
        },
  );
}

function harness(options: {
  pages?: MobileReaderPage[];
  status?: MobileJapaneseLearningChatPageSnapshot["status"];
  recognize?: (page: MobileReaderPage, signal?: AbortSignal) => Promise<MobileJapaneseLearningOcrResult>;
  resolvePage?: MobileJapaneseLearningChatPageSnapshot["resolvePage"];
  lifetimeSignal?: AbortSignal;
  ocrTimeoutMs?: number;
  pagesTimeoutMs?: number;
} = {}) {
  const recognized: string[] = [];
  const resolved: number[] = [];
  const store = createMobileJapaneseLearningPageOcrStore({
    recognize: (page, recognizeOptions) => {
      recognized.push(page.imageUri ?? page.id);
      return options.recognize
        ? options.recognize(page, recognizeOptions.signal)
        : Promise.resolve(result(`text of ${page.id}`));
    },
  });
  let snapshot: MobileJapaneseLearningChatPageSnapshot = {
    status: options.status ?? "ready",
    pages: options.pages ?? chapter(8),
    pageKey: (page) => `chapter:${page.id}`,
    resolvePage:
      options.resolvePage ??
      (async (index) => {
        resolved.push(index);
        return {
          id: `p${index + 1}`,
          index,
          imageUri: `data:image/jpeg;base64,DESCRAMBLED${index + 1}`,
          imageUriOwnership: "app",
          imageProcessing: "ready",
        };
      }),
  };
  const execute = createMobileJapaneseLearningChatPageTools({
    getSnapshot: () => snapshot,
    store,
    lifetimeSignal: options.lifetimeSignal,
    pollMs: 5,
    pagesTimeoutMs: options.pagesTimeoutMs ?? 200,
    ocrTimeoutMs: options.ocrTimeoutMs,
  });
  const call = (
    toolName: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ) => execute({ toolCallId: `t-${toolName}-${String(args.pageNumber)}`, toolName, args }, { signal });
  return {
    call,
    store,
    recognized,
    resolved,
    setSnapshot: (next: Partial<MobileJapaneseLearningChatPageSnapshot>) => {
      snapshot = { ...snapshot, ...next };
    },
  };
}

test("reads a page that was never on screen through the page processor, without moving the reader", async () => {
  const h = harness();
  const answer = await h.call("request_transcript", { pageNumber: 5, reason: "Reading page 5..." });
  expect(answer).toEqual({
    toolCallId: "t-request_transcript-5",
    toolName: "request_transcript",
    result: "text of p5",
  });
  // The processed (descrambled) image is recognized, never the raw URL.
  expect(h.resolved).toEqual([4]);
  expect(h.recognized).toEqual(["data:image/jpeg;base64,DESCRAMBLED5"]);
  // The reader's own transcript for page 5 is now the same result.
  expect(h.store.peek("chapter:p5")?.text).toBe("text of p5");
});

test("uses a page the reader already processed as is", async () => {
  const h = harness();
  await h.call("request_transcript", { pageNumber: 2 });
  expect(h.resolved).toEqual([]);
  expect(h.recognized).toEqual(["data:image/jpeg;base64,PAGE2"]);
});

test("answers from the per-page cache, with web's trigger_ocr wording", async () => {
  const h = harness();
  expect((await h.call("trigger_ocr", { pageNumber: 3 })).result).toBe("OCR complete for page 3.");
  expect((await h.call("trigger_ocr", { pageNumber: 3 })).result).toBe("Page 3 OCR already available.");
  expect((await h.call("request_transcript", { pageNumber: 3 })).result).toBe("text of p3");
  expect(h.recognized).toHaveLength(1);
});

test("several pages in one turn run once each, in order, one at a time", async () => {
  let running = 0;
  let peak = 0;
  const h = harness({
    recognize: async (page) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
      return result(`text of ${page.id}`);
    },
  });
  const answers = await Promise.all(
    [3, 4, 5, 6].map((pageNumber) => h.call("request_transcript", { pageNumber })),
  );
  expect(answers.map((answer) => answer.result)).toEqual([
    "text of p3",
    "text of p4",
    "text of p5",
    "text of p6",
  ]);
  expect(peak).toBe(1);
  expect(h.recognized).toHaveLength(4);
});

test("rejects invalid and out-of-range pages with web's messages", async () => {
  const h = harness();
  expect(await h.call("request_transcript", { pageNumber: 0 })).toMatchObject({
    result: "Invalid page number provided.",
    isError: true,
  });
  expect(await h.call("request_transcript", { pageNumber: "x" })).toMatchObject({
    result: "Invalid page number provided.",
    isError: true,
  });
  expect(await h.call("trigger_ocr", { pageNumber: 9 })).toMatchObject({
    result: "Page not found in the current chapter.",
    isError: true,
  });
  expect(await h.call("summarize", { pageNumber: 1 })).toMatchObject({
    result: "Unknown tool: summarize",
    isError: true,
  });
  expect(h.recognized).toEqual([]);
});

test("waits for the chapter's page list, then reads the page", async () => {
  const h = harness({ status: "loading", pages: [] });
  const pending = h.call("request_transcript", { pageNumber: 2 });
  await new Promise((resolve) => setTimeout(resolve, 20));
  h.setSnapshot({ status: "ready", pages: chapter(4) });
  expect((await pending).result).toBe("text of p2");
});

test("gives up on a page list that never arrives", async () => {
  const h = harness({ status: "loading", pages: [], pagesTimeoutMs: 30 });
  expect(await h.call("request_transcript", { pageNumber: 2 })).toMatchObject({
    result: "Page not found in the current chapter.",
    isError: true,
  });
});

test("reports a page whose image cannot be produced", async () => {
  const h = harness({ resolvePage: async () => null });
  expect(await h.call("request_transcript", { pageNumber: 6 })).toMatchObject({
    result: "Page 6 image not available yet.",
    isError: true,
  });
});

test("returns OCR failures to the model instead of failing the reply", async () => {
  const h = harness({
    recognize: async () => {
      throw new Error("Core ML model failed to load");
    },
  });
  const answer = await h.call("request_transcript", { pageNumber: 1 });
  expect(answer.isError).toBe(true);
  expect(answer.result.startsWith("OCR processing failed or timed out.")).toBe(true);
  expect(answer.result).toContain("Core ML model failed to load");
});

test("times out a page that takes too long", async () => {
  const h = harness({
    ocrTimeoutMs: 20,
    recognize: (_page, signal) =>
      new Promise((_resolve, reject) =>
        signal?.addEventListener("abort", () => reject(signal.reason), { once: true }),
      ),
  });
  expect(await h.call("request_transcript", { pageNumber: 1 })).toMatchObject({
    result: "OCR processing failed or timed out.",
    isError: true,
  });
});

test("an empty page is an answer, not an error", async () => {
  const h = harness({ recognize: async () => result("  ") });
  expect(await h.call("request_transcript", { pageNumber: 1 })).toEqual({
    toolCallId: "t-request_transcript-1",
    toolName: "request_transcript",
    result: "No text found on this page.",
  });
});

test("source text pages answer without OCR", async () => {
  const h = harness({
    pages: [{ id: "t1", index: 0, text: "本文です" }],
  });
  expect((await h.call("request_transcript", { pageNumber: 1 })).result).toBe("本文です");
  expect((await h.call("trigger_ocr", { pageNumber: 1 })).result).toBe("Page 1 OCR already available.");
  expect(h.recognized).toEqual([]);
});

test("a cancelled reply cancels its page work and propagates the abort", async () => {
  let recognizeSignal: AbortSignal | undefined;
  const h = harness({
    recognize: (_page, signal) => {
      recognizeSignal = signal;
      return new Promise((_resolve, reject) =>
        signal?.addEventListener("abort", () => reject(signal.reason), { once: true }),
      );
    },
  });
  const controller = new AbortController();
  const pending = h.call("request_transcript", { pageNumber: 1 }, controller.signal);
  await new Promise((resolve) => setTimeout(resolve, 5));
  controller.abort(new Error("reply cancelled"));
  await expect(pending).rejects.toThrow("reply cancelled");
  expect(recognizeSignal?.aborted).toBe(true);
});

test("leaving the reader stops queued pages and answers the model gracefully", async () => {
  const lifetime = new AbortController();
  let recognizeSignal: AbortSignal | undefined;
  const h = harness({
    lifetimeSignal: lifetime.signal,
    recognize: (_page, signal) => {
      recognizeSignal = signal;
      return new Promise((_resolve, reject) =>
        signal?.addEventListener("abort", () => reject(signal.reason), { once: true }),
      );
    },
  });
  const pending = h.call("request_transcript", { pageNumber: 4 });
  await new Promise((resolve) => setTimeout(resolve, 5));
  lifetime.abort();
  expect(await pending).toMatchObject({
    result: "Page not available in the current chapter.",
    isError: true,
  });
  expect(recognizeSignal?.aborted).toBe(true);
  expect(await h.call("request_transcript", { pageNumber: 1 })).toMatchObject({
    result: "Page not available in the current chapter.",
    isError: true,
  });
});
