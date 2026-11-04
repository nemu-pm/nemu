/**
 * Online OCR assist (opt-in, off by default): after on-device manga-ocr has
 * read a page, bubbles it read with low confidence take the cloud reading
 * (ocr.nemu.pm: comic-text-detector + PaddleOCR-VL-For-Manga) of the same
 * area. Only the page image is sent, and only when the page has such a
 * bubble; any cloud failure keeps the on-device text silently.
 *
 * Benchmark (`artifacts/mobile-review-20260926/ocr-benchmark/v3-opt`, 70
 * pages / 451 text blocks, local server.py → MLX PaddleOCR-VL as the stand-in
 * for ocr.nemu.pm): with the threshold below, 11% of blocks and 54% of pages
 * were routed; end-to-end loose CER 6.2% → 4.9%, strict 7.3% → 5.9%, exact
 * blocks 80.5% → 82.7%; dialogue did not get worse. manga-ocr's mean token
 * probability predicts its own errors well (AUROC 0.95 for "block has an
 * error"), which is what makes the routing cheap.
 */
import type { MobileOcrDetection } from "./mobileJapaneseLearningOcr";

/** Blocks read with a lower recognition confidence are routed. */
export const MOBILE_OCR_ASSIST_CONFIDENCE_THRESHOLD = 0.9;
/**
 * A cloud box counts as the same text when it overlaps a routed block by at
 * least this share of the smaller box (CTD and the on-device detector draw
 * different boxes around the same bubble).
 */
export const MOBILE_OCR_ASSIST_MIN_COVER = 0.5;

/** Indices of the Japanese blocks worth a cloud reading. */
export function selectMobileOcrAssistTargets(
  detections: readonly MobileOcrDetection[],
  recognitionConfidences: readonly (number | null)[] | undefined,
  threshold = MOBILE_OCR_ASSIST_CONFIDENCE_THRESHOLD,
): number[] {
  if (!recognitionConfidences || recognitionConfidences.length !== detections.length) return [];
  const targets: number[] = [];
  detections.forEach((detection, index) => {
    const confidence = recognitionConfidences[index];
    if (detection.label === "eng" || confidence == null) return;
    if (confidence < threshold) targets.push(index);
  });
  return targets;
}

function area(box: Pick<MobileOcrDetection, "x1" | "y1" | "x2" | "y2">): number {
  return Math.max(0, box.x2 - box.x1) * Math.max(0, box.y2 - box.y1);
}

function intersection(
  a: Pick<MobileOcrDetection, "x1" | "y1" | "x2" | "y2">,
  b: Pick<MobileOcrDetection, "x1" | "y1" | "x2" | "y2">,
): number {
  return (
    Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1)) *
    Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1))
  );
}

const ELLIPSIS_RUN = /[．.・･]{2,}/g;
const DASH_RUN = /[―—－‐─]{2,}/g;

/**
 * The cloud service's `restore_symbols` (services/ocr/ocr_text.py), for
 * servers deployed before it: `...` → `…`, `～` → `〜`, `――` → `──`.
 * Idempotent.
 */
export function restoreMobileOcrSymbols(text: string): string {
  return text
    .replace(ELLIPSIS_RUN, (run) => "…".repeat(Math.max(1, Math.floor(run.length / 3 + 0.5))))
    .replace(/[～~]/g, "〜")
    .replace(DASH_RUN, (run) => "─".repeat(run.length));
}

/**
 * Whether the cloud boxes are in the on-device boxes' pixel space: most
 * cloud boxes must be centred inside an on-device box (both detectors see the
 * same bubbles), and none may run past the on-device image. A page decoded at
 * another scale fails this and keeps its on-device text.
 */
export function mobileOcrAssistSpacesAgree(
  detections: readonly MobileOcrDetection[],
  cloud: readonly MobileOcrDetection[],
  imageSize?: { width: number; height: number },
): boolean {
  const boxes = cloud.filter((detection) => detection.label !== "eng");
  if (boxes.length === 0) return false;
  if (
    imageSize &&
    boxes.some((box) => box.x2 > imageSize.width * 1.02 || box.y2 > imageSize.height * 1.02)
  ) {
    return false;
  }
  const centred = boxes.filter((box) => {
    const cx = (box.x1 + box.x2) / 2;
    const cy = (box.y1 + box.y2) / 2;
    return detections.some((d) => cx >= d.x1 && cx <= d.x2 && cy >= d.y1 && cy <= d.y2);
  }).length;
  return centred >= 0.5 * boxes.length;
}

/**
 * Each target block takes the text of the cloud detections it overlaps (in
 * the cloud's reading order); a target no cloud box covers keeps its own
 * text. Boxes, order and every other block are unchanged.
 */
export function applyMobileOcrAssist(
  detections: readonly MobileOcrDetection[],
  targets: readonly number[],
  cloud: readonly MobileOcrDetection[],
  minCover = MOBILE_OCR_ASSIST_MIN_COVER,
): { detections: MobileOcrDetection[]; replaced: number } {
  const next = detections.slice();
  const ordered = cloud
    .filter((detection) => detection.label !== "eng" && detection.text.trim())
    .slice()
    .sort((a, b) => a.order - b.order);
  let replaced = 0;
  for (const index of targets) {
    const block = detections[index];
    if (!block) continue;
    const hits = ordered.filter(
      (candidate) =>
        intersection(block, candidate) >= minCover * Math.min(area(block), area(candidate)) &&
        intersection(block, candidate) > 0,
    );
    if (hits.length === 0) continue;
    const text = hits.map((hit) => restoreMobileOcrSymbols(hit.text.trim())).join("");
    if (!text) continue;
    next[index] = { ...block, text };
    replaced += 1;
  }
  return { detections: next, replaced };
}
