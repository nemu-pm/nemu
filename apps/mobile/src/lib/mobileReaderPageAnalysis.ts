/**
 * Page analysis for spread pairing: which pages to measure, in what order,
 * and the per-chapter cache of what was measured.
 *
 * The measuring itself is native (`analyzePageFile`, a small thumbnail of
 * the cached page file, off the main thread). Results are cached per page,
 * in memory and in one small JSON file per chapter, so a page is measured
 * once. Only the numbers are kept, never pixels.
 */

/** What is measured on one page (see `NemuPageAnalysis.swift`). */
export type MobileReaderPageFeatures = {
  width: number;
  height: number;
  marginL: number;
  marginR: number;
  edgeL: number[];
  edgeR: number[];
  edgeColor: string;
  /**
   * Share of pixels whose colour differs from the page's own tint (0 for a
   * black-and-white or evenly yellowed scan); null when not measured.
   */
  chroma: number | null;
};

/** Pages behind the reader that are measured (a reader who turns back). */
export const MOBILE_READER_PAGE_ANALYSIS_BEHIND = 6;
/** Pages ahead of the reader that are measured, so pairing is known before they show. */
export const MOBILE_READER_PAGE_ANALYSIS_AHEAD = 24;

/** The pages to measure, nearest first, ahead before behind. */
export function mobileReaderPageAnalysisOrder(
  pageCount: number,
  currentIndex: number,
  behind = MOBILE_READER_PAGE_ANALYSIS_BEHIND,
  ahead = MOBILE_READER_PAGE_ANALYSIS_AHEAD,
): number[] {
  if (!Number.isFinite(pageCount) || pageCount <= 0) return [];
  const current = Math.max(0, Math.min(pageCount - 1, Math.round(currentIndex)));
  const order: number[] = [];
  for (let distance = 0; distance <= Math.max(ahead, behind); distance += 1) {
    const next = current + distance;
    if (distance <= ahead && next < pageCount) order.push(next);
    const previous = current - distance;
    if (distance > 0 && distance <= behind && previous >= 0) order.push(previous);
  }
  return order;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function profile(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 256) return null;
  const out: number[] = [];
  for (const entry of value) {
    const number = finiteNumber(entry);
    if (number === null) return null;
    out.push(Math.max(0, Math.min(1, number)));
  }
  return out;
}

/** A measured page from native or the cache, or null when it does not hold together. */
export function normalizeMobileReaderPageFeatures(value: unknown): MobileReaderPageFeatures | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const width = finiteNumber(raw.width);
  const height = finiteNumber(raw.height);
  const marginL = finiteNumber(raw.marginL);
  const marginR = finiteNumber(raw.marginR);
  const edgeL = profile(raw.edgeL);
  const edgeR = profile(raw.edgeR);
  if (width === null || height === null || width <= 0 || height <= 0) return null;
  if (marginL === null || marginR === null || !edgeL || !edgeR) return null;
  const edgeColor = typeof raw.edgeColor === "string" && /^#[0-9a-f]{6}$/i.test(raw.edgeColor)
    ? raw.edgeColor.toLowerCase()
    : "#000000";
  const chroma = finiteNumber(raw.chroma);
  return {
    width,
    height,
    marginL: Math.max(0, Math.min(0.5, marginL)),
    marginR: Math.max(0, Math.min(0.5, marginR)),
    edgeL,
    edgeR,
    edgeColor,
    chroma: chroma === null ? null : Math.max(0, Math.min(1, chroma)),
  };
}

/** 2: adds `chroma` (colour pages stand alone); older caches are measured again. */
export const MOBILE_READER_PAGE_ANALYSIS_CACHE_VERSION = 2;

/** One chapter's cache file: page id → features. */
export function serializeMobileReaderPageAnalysisCache(entries: ReadonlyMap<string, MobileReaderPageFeatures>): string {
  return JSON.stringify({ v: MOBILE_READER_PAGE_ANALYSIS_CACHE_VERSION, pages: Object.fromEntries(entries) });
}

export function parseMobileReaderPageAnalysisCache(text: string | null | undefined): Map<string, MobileReaderPageFeatures> {
  const out = new Map<string, MobileReaderPageFeatures>();
  if (!text) return out;
  try {
    const parsed = JSON.parse(text) as { v?: unknown; pages?: unknown };
    if (parsed.v !== MOBILE_READER_PAGE_ANALYSIS_CACHE_VERSION || !parsed.pages || typeof parsed.pages !== "object") {
      return out;
    }
    for (const [id, value] of Object.entries(parsed.pages as Record<string, unknown>)) {
      const features = normalizeMobileReaderPageFeatures(value);
      if (features) out.set(id, features);
    }
  } catch {
    return out;
  }
  return out;
}

/** A short stable file name for a chapter's cache (FNV-1a of its key). */
export function mobileReaderPageAnalysisCacheName(chapterKey: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < chapterKey.length; index += 1) {
    hash ^= chapterKey.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  let second = 0x9e3779b9;
  for (let index = chapterKey.length - 1; index >= 0; index -= 1) {
    second ^= chapterKey.charCodeAt(index);
    second = Math.imul(second, 0x85ebca6b) >>> 0;
  }
  return `${hash.toString(16).padStart(8, "0")}${second.toString(16).padStart(8, "0")}`;
}

export type MobileReaderPageAnalysisJob = {
  id: string;
  /** The page's local file, or null when it cannot be had (offline, text page). */
  resolveFile: (signal: AbortSignal) => Promise<string | null>;
};

/**
 * Measures pages one at a time. A new `run` replaces the previous one (the
 * reader moved on), a page already measured or failed is never measured
 * again, and `cancel` stops everything.
 */
export class MobileReaderPageAnalysisQueue {
  private controller: AbortController | null = null;
  private readonly done = new Set<string>();

  constructor(
    private readonly analyze: (uri: string) => Promise<unknown>,
    private readonly onResult: (id: string, features: MobileReaderPageFeatures) => void,
  ) {}

  /** Pages already measured elsewhere (the cache) are skipped. */
  markDone(ids: Iterable<string>): void {
    for (const id of ids) this.done.add(id);
  }

  run(jobs: readonly MobileReaderPageAnalysisJob[]): Promise<void> {
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    const pending = jobs.filter((job) => !this.done.has(job.id));
    return (async () => {
      for (const job of pending) {
        if (controller.signal.aborted) return;
        if (this.done.has(job.id)) continue;
        let uri: string | null = null;
        try {
          uri = await job.resolveFile(controller.signal);
        } catch {
          uri = null;
        }
        if (controller.signal.aborted) return;
        // Not downloaded (yet): try again on a later run.
        if (!uri) continue;
        let features: MobileReaderPageFeatures | null = null;
        try {
          features = normalizeMobileReaderPageFeatures(await this.analyze(uri));
        } catch {
          features = null;
        }
        // A measurement that finished is kept even if the run was replaced meanwhile.
        this.done.add(job.id);
        if (features) this.onResult(job.id, features);
      }
    })();
  }

  cancel(): void {
    this.controller?.abort();
    this.controller = null;
  }

  reset(): void {
    this.cancel();
    this.done.clear();
  }
}
