import type { MobileReaderPage } from "@/sources/mobileSourcePages";
import {
  MOBILE_JAPANESE_LEARNING_OCR_MAX_DETECTIONS,
  runMobileJapaneseLearningOcr,
  type MobileJapaneseLearningOcrOptions,
  type MobileJapaneseLearningOcrResult,
} from "./mobileJapaneseLearningOcr";
import { throwIfMobileJapaneseLearningAborted } from "./mobileJapaneseLearningSafety";

/** Pages are in source reading order, independent of their visual RTL/LTR slots. */
export async function runMobileJapaneseLearningSpreadOcr(
  pages: MobileReaderPage[],
  options: MobileJapaneseLearningOcrOptions = {},
  recognize: (
    page: MobileReaderPage,
    options: MobileJapaneseLearningOcrOptions,
  ) => Promise<MobileJapaneseLearningOcrResult> = runMobileJapaneseLearningOcr,
): Promise<MobileJapaneseLearningOcrResult> {
  const results = new Map<string, MobileJapaneseLearningOcrResult>();
  const merge = (): MobileJapaneseLearningOcrResult => ({
    source: [...results.values()].some((result) => result.source === "ocr") ? "ocr" : "source-text",
    detections: pages.flatMap((page, pageIndex) => {
      const result = results.get(page.id);
      return [...(result?.detections ?? [])].sort((a, b) => a.order - b.order).map((detection, index) => ({
        ...detection,
        pageId: page.id,
        imageSize: result?.imageSize,
        order: pageIndex * MOBILE_JAPANESE_LEARNING_OCR_MAX_DETECTIONS + index,
      }));
    }),
    text: pages.map((page) => results.get(page.id)?.text.trim()).filter(Boolean).join("\n"),
  });
  // Serialize native inference to avoid holding two image/model workloads at once.
  for (const page of pages) {
    throwIfMobileJapaneseLearningAborted(options.signal);
    const result = await recognize(page, {
      ...options,
      onPartialResult: (partial) => {
        if (options.signal?.aborted) return;
        results.set(page.id, partial);
        options.onPartialResult?.(merge());
      },
    });
    throwIfMobileJapaneseLearningAborted(options.signal);
    results.set(page.id, result);
    options.onPartialResult?.(merge());
  }
  return merge();
}
