import { expect, test } from "bun:test";
import { runMobileJapaneseLearningSpreadOcr } from "./mobileJapaneseLearningSpreadOcr";
import type { MobileJapaneseLearningOcrResult } from "./mobileJapaneseLearningOcr";
import { computeMobileOcrDetectionRect } from "./mobileJapaneseLearningOverlay";

const pages = [
  { id: "right", index: 0, imageUri: "file:///right.jpg", imageUriOwnership: "app" as const },
  { id: "left", index: 1, imageUri: "file:///left.jpg", imageUriOwnership: "app" as const },
];
const result = (text: string, width = 100): MobileJapaneseLearningOcrResult => ({
  source: "ocr", text, imageSize: { width, height: width * 2 },
  detections: [{ x1: 10, y1: 20, x2: 30, y2: 40, conf: 1, cls: 0, label: "ja", order: 0, text }],
});

test("recognizes both visible pages in reading order with distinct selections and crop spaces", async () => {
  const calls: string[] = [];
  const partials: MobileJapaneseLearningOcrResult[] = [];
  const final = await runMobileJapaneseLearningSpreadOcr(pages, {
    onPartialResult: (partial) => partials.push(partial),
  }, async (page, options) => {
    calls.push(page.imageUri!);
    const read = result(page.imageUri!, page.imageUri === pages[0].imageUri ? 100 : 200);
    options?.onPartialResult?.(read);
    return read;
  });
  expect(calls).toEqual(pages.map((page) => page.imageUri));
  expect(final.detections.map((d) => d.pageId)).toEqual(["right", "left"]);
  expect(new Set(final.detections.map((d) => d.order)).size).toBe(2);
  expect(final.text).toBe("file:///right.jpg\nfile:///left.jpg");
  expect(partials[0]!.detections[0]!.order).toBe(final.detections[0]!.order);
  expect(partials.at(-1)!.detections).toEqual(final.detections);
  const left = final.detections[1]!;
  expect(left.imageSize).toEqual({ width: 200, height: 400 });
  expect(computeMobileOcrDetectionRect(left, { width: 200, height: 400 }, left.imageSize!))
    .toEqual({ left: 10, top: 20, width: 20, height: 20 });
});

test("page turn cancellation stops before scanning the next page or publishing stale results", async () => {
  const controller = new AbortController();
  const partials: MobileJapaneseLearningOcrResult[] = [];
  let calls = 0;
  const run = runMobileJapaneseLearningSpreadOcr(pages, {
    signal: controller.signal, onPartialResult: (partial) => partials.push(partial),
  }, async (_, options) => {
    calls++;
    controller.abort();
    options?.onPartialResult?.(result("stale"));
    return result("stale");
  });
  await expect(run).rejects.toThrow();
  expect(calls).toBe(1);
  expect(partials).toEqual([]);
});

test("single pages and source-text pages remain usable without a phantom second page", async () => {
  const single = await runMobileJapaneseLearningSpreadOcr(pages.slice(0, 1), {}, async () => result("hello"));
  expect(single.detections.map((d) => d.pageId)).toEqual(["right"]);
  const text = await runMobileJapaneseLearningSpreadOcr([{ id: "text", index: 0, text: "文章" }], {},
    async () => ({ source: "source-text", text: "文章", detections: [] }));
  expect(text).toEqual({ source: "source-text", text: "文章", detections: [] });
});
