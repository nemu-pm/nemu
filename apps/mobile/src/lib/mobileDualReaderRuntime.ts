/**
 * Mobile dual-reader alignment runtime — pure logic wrapping `@nemu/core`.
 *
 * Mirrors the decision/plan-building logic scattered across the web
 * `DualReadAutoAligner` (`src/lib/plugins/builtin/dual-reader/components.tsx`)
 * and the dHash worker (`dhash.worker.ts`), but factored as pure functions with
 * injectable platform seams so it is unit-testable without Skia or a worklet
 * runtime:
 *
 * - `computeHashFromBytes` takes a `DualReaderPlatformAdapter` (decode-to-RGBA).
 *   On device this is the Skia adapter (T2); tests inject a fake.
 * - `requestAlignmentFromSamples` takes a `RunAlignmentFn` that runs
 *   `computeAlignmentTransform`. On device this is the worklet background-runtime
 *   bridge (T1.4, `fftBackend: 'js'`); tests inject a fake.
 *
 * The React effect orchestration (visibility gating, in-flight dedup, retry
 * cooldown, abort-on-scroll-off) lives in the AutoAligner component (T3.5) and
 * calls these functions.
 */
import {
  ALIGNMENT_CONFIDENCE_MIN_DEFAULT,
  ALIGNMENT_FFT_MAX_DEFAULT,
  ALIGNMENT_FINE_MAX_DEFAULT,
  buildAlignmentOptions,
  buildAlignmentQueue,
  buildMergeLuma,
  buildMissingRenderPlan,
  buildSecondaryRenderPlan,
  buildSplitLuma,
  computeMultiDhash,
  downsampleToMax,
  findBestSecondaryMatch,
  getAlignmentPlanSignature,
  shouldApplySiblingSplitPlan,
  shouldMarkMissing,
  toLuma,
} from "@nemu/core/dual-reader";
import type {
  AlignmentOptions,
  AlignmentResult,
  DualReaderPlatformAdapter,
  LumaImage,
  MultiDhash,
  SecondaryMatch,
  SecondaryRenderPlan,
} from "@nemu/core/dual-reader";

/**
 * Decode-only seam for `computeHashFromBytes`. The mobile renderer
 * (`MobileDualReaderRenderer`) and a full `DualReaderPlatformAdapter` both
 * satisfy this, so alignment hashing can take the renderer directly without
 * needing the (RGBA-based) `realizeSplit`/`realizeMerge` path.
 */
export type DualReaderDecoder = Pick<DualReaderPlatformAdapter, "decodeToRgba">;

// --- Constants (copied 1:1 from web components.tsx:59-82) ---
export const HOLD_DELAY_MS = 220;
export const DRAG_THRESHOLD_PX = 6;
export const FAB_SIZE = 48;
export const FAB_MARGIN = 12;
export const AUTO_ALIGN_WINDOW = 4;
export const AUTO_ALIGN_BASE_THRESHOLD = 40;
export const AUTO_ALIGN_SOFT_THRESHOLD = 72;
export const AUTO_ALIGN_ADAPTIVE_DELTA = 25;
export const AUTO_ALIGN_MIN_GAP = 6;
export const AUTO_ALIGN_VARIANT_PENALTY = 20;
export const AUTO_ALIGN_FULL_THRESHOLD = 20;
export const AUTO_ALIGN_DEVIATION_BIAS = 1;
export const AUTO_ALIGN_HISTORY_LIMIT = 12;
export const AUTO_ALIGN_CENTER_RATIO = 0.7;
export const AUTO_ALIGN_SPLIT_MARGIN = 8;
export const AUTO_ALIGN_SPLIT_PENALTY = 4;
export const AUTO_ALIGN_MERGE_PENALTY = 6;
export const AUTO_ALIGN_PRIMARY_SPREAD_THRESHOLD = 24;
export const AUTO_ALIGN_SECONDARY_SPREAD_THRESHOLD = 24;
export const AUTO_ALIGN_MISSING_DISTANCE = 45;
export const AUTO_ALIGN_MISSING_GAP = 10;
export const ALIGNMENT_RETRY_MS = 2000;
export const ALIGNMENT_MAX_CONCURRENCY = 2;
export const ALIGNMENT_VISIBLE_DEBOUNCE_MS = 300;

export { buildAlignmentQueue, getAlignmentPlanSignature };
export { ALIGNMENT_CONFIDENCE_MIN_DEFAULT, ALIGNMENT_FINE_MAX_DEFAULT };

/**
 * Build the mobile AutoAligner's candidate primary-page window: the current
 * page first, then expanding outward up to `windowSize` in each direction,
 * clamped to `[0, pageCount-1]`. Mobile processes one chapter at a time (vs
 * web's global-index multi-page queue), so this window keeps the overlay ready
 * as the user pages without web's full loaded-page-url/abort machinery.
 */
export function buildAutoAlignCandidates(input: {
  currentIndex: number;
  pageCount: number;
  windowSize?: number;
}): number[] {
  const windowSize = input.windowSize ?? AUTO_ALIGN_WINDOW;
  if (!Number.isFinite(input.pageCount) || input.pageCount <= 0) return [];
  const cur = Math.max(0, Math.min(input.pageCount - 1, Math.trunc(input.currentIndex)));
  const startP = Math.max(0, cur - windowSize);
  const endP = Math.min(input.pageCount - 1, cur + windowSize);
  const candidates: number[] = [cur];
  for (let i = 1; i <= windowSize; i += 1) {
    if (cur - i >= startP) candidates.push(cur - i);
    if (cur + i <= endP) candidates.push(cur + i);
  }
  return candidates;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
  }
  return sorted[mid]!;
}

/** Options object for `findBestSecondaryMatch`, matching web's call site. */
export function buildAutoAlignMatchOptions() {
  return {
    windowSize: AUTO_ALIGN_WINDOW,
    deviationBias: AUTO_ALIGN_DEVIATION_BIAS,
    variantPenalty: AUTO_ALIGN_VARIANT_PENALTY,
    fullThreshold: AUTO_ALIGN_FULL_THRESHOLD,
    splitMargin: AUTO_ALIGN_SPLIT_MARGIN,
    splitPenalty: AUTO_ALIGN_SPLIT_PENALTY,
    mergePenalty: AUTO_ALIGN_MERGE_PENALTY,
    primarySpreadThreshold: AUTO_ALIGN_PRIMARY_SPREAD_THRESHOLD,
    secondarySpreadThreshold: AUTO_ALIGN_SECONDARY_SPREAD_THRESHOLD,
  };
}

/**
 * Adaptive accept/missing decision for a candidate match, mirroring web
 * (`components.tsx:2224-2261`). Returns whether the match is accepted as a real
 * pairing and/or should be recorded as a missing page.
 */
export function evaluateSecondaryMatch(input: {
  best: SecondaryMatch;
  secondBestDistance: number;
  acceptedDistances: number[];
}): { accept: boolean; missing: boolean } {
  const { best, secondBestDistance, acceptedDistances } = input;
  const missing = shouldMarkMissing({
    bestDistance: best.distance,
    secondBestDistance,
    missingDistance: AUTO_ALIGN_MISSING_DISTANCE,
    missingGap: AUTO_ALIGN_MISSING_GAP,
  });
  const recentMedian =
    acceptedDistances.length > 0 ? median(acceptedDistances) : null;
  const adaptiveThreshold =
    recentMedian === null
      ? AUTO_ALIGN_BASE_THRESHOLD
      : Math.max(AUTO_ALIGN_BASE_THRESHOLD, recentMedian + AUTO_ALIGN_ADAPTIVE_DELTA);
  let accept = best.distance <= adaptiveThreshold;
  if (!accept && best.distance <= AUTO_ALIGN_SOFT_THRESHOLD) {
    const gapOk = secondBestDistance - best.distance >= AUTO_ALIGN_MIN_GAP;
    const medianOk =
      recentMedian === null ? true : best.distance <= recentMedian + AUTO_ALIGN_ADAPTIVE_DELTA;
    accept = gapOk && medianOk;
  }
  return { accept, missing };
}

export function buildRenderPlanFromMatch(input: {
  match: SecondaryMatch;
  secondaryChapterId: string;
  driftDelta: number;
}): SecondaryRenderPlan {
  return buildSecondaryRenderPlan(input);
}

export function buildMissingPlan(input: {
  secondaryChapterId: string;
  driftDelta: number;
}): SecondaryRenderPlan {
  return buildMissingRenderPlan(input);
}

export { shouldApplySiblingSplitPlan, findBestSecondaryMatch };

/**
 * Decode image bytes to a dHash + a downsampled luma sample (for alignment).
 * Mirrors the web worker hash path (`dhash.worker.ts:163-177`): decode →
 * `toLuma` → `downsampleToMax` (sample) → `computeMultiDhash({ split: true })`.
 */
export async function computeHashFromBytes(input: {
  bytes: Uint8Array;
  adapter: DualReaderDecoder;
  centerCropRatio?: number;
  sampleMax?: number;
}): Promise<{ hash: MultiDhash; sample: LumaImage }> {
  const rgba = await input.adapter.decodeToRgba(input.bytes);
  const lumaInput = {
    data: rgba.data,
    width: rgba.width,
    height: rgba.height,
    channels: 4 as const,
  };
  const luma = toLuma(lumaInput);
  const sampleMax = input.sampleMax ?? ALIGNMENT_FINE_MAX_DEFAULT;
  const sample = downsampleToMax(luma, rgba.width, rgba.height, sampleMax);
  const hash = computeMultiDhash(lumaInput, {
    split: true,
    centerCropRatio: input.centerCropRatio ?? AUTO_ALIGN_CENTER_RATIO,
    luma,
  });
  return { hash, sample };
}

export type RunAlignmentFn = (input: {
  primary: LumaImage;
  secondary: LumaImage;
  options: AlignmentOptions;
}) => Promise<AlignmentResult>;

/**
 * Build the secondary luma for a render plan (split → `buildSplitLuma`,
 * merge → `buildMergeLuma`, single → as-is) and run alignment. Mirrors the web
 * worker align path (`dhash.worker.ts:96-141`) but with `fftBackend: 'js'`
 * (mobile has no wasm FFT) and an injected `runAlignment` (the worklet bridge).
 */
export async function requestAlignmentFromSamples(input: {
  primarySample: LumaImage;
  secondarySample: LumaImage;
  /** Required for merge plans (the second secondary index's sample). */
  secondarySampleB?: LumaImage;
  plan: SecondaryRenderPlan;
  options?: Partial<AlignmentOptions>;
  runAlignment: RunAlignmentFn;
}): Promise<AlignmentResult> {
  const { plan } = input;
  let secondary: LumaImage;
  if (plan.kind === "split") {
    secondary = buildSplitLuma(input.secondarySample, plan.side);
  } else if (plan.kind === "merge") {
    if (!input.secondarySampleB) {
      throw new Error("merge plan requires secondarySampleB");
    }
    secondary = buildMergeLuma(input.secondarySample, input.secondarySampleB, plan.order);
  } else {
    secondary = input.secondarySample;
  }
  const fineMax = Math.min(
    ALIGNMENT_FINE_MAX_DEFAULT,
    input.options?.fineMax ?? ALIGNMENT_FINE_MAX_DEFAULT,
  );
  const fftMax = Math.min(
    ALIGNMENT_FFT_MAX_DEFAULT,
    input.options?.fftMax ?? ALIGNMENT_FFT_MAX_DEFAULT,
    fineMax,
  );
  const options = buildAlignmentOptions({
    ...input.options,
    fineMax,
    fftMax,
    fftBackend: "js",
  });
  return input.runAlignment({ primary: input.primarySample, secondary, options });
}