import type { MobileReaderPage } from "@/sources/mobileSourcePages";
import {
  runMobileJapaneseLearningOcr,
  type MobileJapaneseLearningOcrOptions,
  type MobileJapaneseLearningOcrResult,
} from "./mobileJapaneseLearningOcr";
import {
  getMobileJapaneseLearningCapabilities,
  getMobileJapaneseLearningEnginePreference,
  isMobileJapaneseLearningOcrAssistActive,
  resolveMobileJapaneseLearningOcrEngine,
} from "./mobileJapaneseLearningEngine";

/**
 * Per-page OCR results shared by the reader and Nemu Chat's page tools.
 *
 * Web keeps one `transcripts` map in the text-detector store: a page Nemu read
 * through `request_transcript` shows its boxes and transcript the moment the
 * reader turns to it, and a page the reader already scanned answers the tool
 * without another run. This is that map for mobile, plus what web gets for
 * free from its worker and mobile has to do by hand:
 *
 * - one recognition per page at a time (a second caller joins the run),
 * - one recognition at a time overall, so Core ML never holds two page
 *   workloads at once (the reader's own requests jump ahead of Nemu's),
 * - at most two pages' images held while Nemu's queue drains,
 * - a run is cancelled only once every caller waiting on it has gone.
 */

export type MobileJapaneseLearningPageOcrPriority = "reader" | "chat";

type Recognize = (
  page: MobileReaderPage,
  options: MobileJapaneseLearningOcrOptions,
) => Promise<MobileJapaneseLearningOcrResult>;

export type MobileJapaneseLearningPageOcrRequest = {
  /** Page identity (chapter + page id) plus the engine it was read with. */
  key: string;
  /**
   * The page to read, or a loader for it (e.g. the chapter's page processor
   * resolving a page that was never on screen). `null`: no image.
   */
  page: MobileReaderPage | ((signal: AbortSignal) => Promise<MobileReaderPage | null>);
  signal?: AbortSignal;
  priority?: MobileJapaneseLearningPageOcrPriority;
  /** Only the caller that starts the run sees partial results. */
  onPartialResult?: (result: MobileJapaneseLearningOcrResult) => void;
};

export class MobileJapaneseLearningPageImageUnavailableError extends Error {
  constructor() {
    super("Page image not available.");
    this.name = "MobileJapaneseLearningPageImageUnavailableError";
  }
}

export type MobileJapaneseLearningPageOcrStore = {
  peek(key: string): MobileJapaneseLearningOcrResult | undefined;
  isRecognizing(key: string): boolean;
  recognize(
    request: MobileJapaneseLearningPageOcrRequest,
  ): Promise<MobileJapaneseLearningOcrResult>;
  /** Bumped whenever a result lands; pairs with `subscribe` for React. */
  version(): number;
  subscribe(listener: () => void): () => void;
  clear(): void;
};

function abortError(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("Aborted", "AbortError");
}

/** A small priority semaphore: `reader` waiters go before `chat` waiters. */
function createSlots(limit: number) {
  let active = 0;
  const waiting: Array<{
    priority: MobileJapaneseLearningPageOcrPriority;
    grant: () => void;
  }> = [];
  const pump = () => {
    while (active < limit && waiting.length > 0) {
      const readerIndex = waiting.findIndex(
        (entry) => entry.priority === "reader",
      );
      const next = readerIndex >= 0 ? readerIndex : 0;
      const [entry] = waiting.splice(next, 1);
      active += 1;
      entry!.grant();
    }
  };
  return {
    acquire(
      priority: MobileJapaneseLearningPageOcrPriority,
      signal: AbortSignal,
    ): Promise<() => void> {
      return new Promise((resolve, reject) => {
        if (signal.aborted) {
          reject(abortError(signal));
          return;
        }
        let released = false;
        const release = () => {
          if (released) return;
          released = true;
          active -= 1;
          pump();
        };
        const entry = {
          priority,
          grant: () => {
            signal.removeEventListener("abort", onAbort);
            resolve(release);
          },
        };
        const onAbort = () => {
          const index = waiting.indexOf(entry);
          if (index < 0) return;
          waiting.splice(index, 1);
          reject(abortError(signal));
        };
        signal.addEventListener("abort", onAbort, { once: true });
        waiting.push(entry);
        pump();
      });
    },
    get active() {
      return active;
    },
    get waiting() {
      return waiting.length;
    },
  };
}

export function createMobileJapaneseLearningPageOcrStore(options: {
  recognize: Recognize;
  /** Results kept (detections + text, a few KB each). */
  limit?: number;
  /** Pages recognized at once (Core ML runs one page at a time). */
  recognitionConcurrency?: number;
  /** Nemu pages whose image may be held at once (loading or queued). */
  preparedPageLimit?: number;
}): MobileJapaneseLearningPageOcrStore & {
  /** Test hooks. */
  readonly recognizing: number;
  readonly queued: number;
} {
  const limit = Math.max(1, options.limit ?? 48);
  const recognition = createSlots(Math.max(1, options.recognitionConcurrency ?? 1));
  const prepared = createSlots(Math.max(1, options.preparedPageLimit ?? 2));
  const results = new Map<string, MobileJapaneseLearningOcrResult>();
  const inFlight = new Map<
    string,
    {
      controller: AbortController;
      waiters: number;
      promise: Promise<MobileJapaneseLearningOcrResult>;
    }
  >();
  const listeners = new Set<() => void>();
  let version = 0;

  const remember = (key: string, result: MobileJapaneseLearningOcrResult) => {
    results.delete(key);
    results.set(key, result);
    while (results.size > limit) {
      const oldest = results.keys().next().value;
      if (typeof oldest !== "string") break;
      results.delete(oldest);
    }
    version += 1;
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        // A view subscriber must not break the store.
      }
    }
  };

  const run = async (
    request: MobileJapaneseLearningPageOcrRequest,
    signal: AbortSignal,
  ): Promise<MobileJapaneseLearningOcrResult> => {
    const priority = request.priority ?? "reader";
    // Nemu's pages are loaded (downloaded, descrambled) before they queue for
    // recognition; the prepared slot is held until recognition finishes so a
    // multi-page request never keeps more than a couple of images alive.
    const releasePrepared =
      typeof request.page === "function"
        ? await prepared.acquire(priority, signal)
        : null;
    try {
      const page =
        typeof request.page === "function"
          ? await request.page(signal)
          : request.page;
      if (signal.aborted) throw abortError(signal);
      if (!page || (!page.imageUri && !page.text?.trim())) {
        throw new MobileJapaneseLearningPageImageUnavailableError();
      }
      const releaseRecognition = await recognition.acquire(priority, signal);
      try {
        return await options.recognize(page, {
          signal,
          ...(request.onPartialResult
            ? { onPartialResult: request.onPartialResult }
            : {}),
        });
      } finally {
        releaseRecognition();
      }
    } finally {
      releasePrepared?.();
    }
  };

  return {
    peek(key) {
      const hit = results.get(key);
      if (!hit) return undefined;
      results.delete(key);
      results.set(key, hit);
      return hit;
    },
    isRecognizing(key) {
      return inFlight.has(key);
    },
    recognize(request) {
      const { key } = request;
      const signal = request.signal;
      if (signal?.aborted) return Promise.reject(abortError(signal));
      const hit = results.get(key);
      if (hit) {
        results.delete(key);
        results.set(key, hit);
        return Promise.resolve(hit);
      }
      let entry = inFlight.get(key);
      if (!entry) {
        const controller = new AbortController();
        const created = {
          controller,
          waiters: 0,
          promise: run(request, controller.signal).then(
            (result) => {
              if (inFlight.get(key) === created) inFlight.delete(key);
              if (!controller.signal.aborted) remember(key, result);
              return result;
            },
            (error: unknown) => {
              if (inFlight.get(key) === created) inFlight.delete(key);
              throw error;
            },
          ),
        };
        // Joined callers attach their own handlers; this one only keeps an
        // abandoned run's rejection from surfacing as unhandled.
        created.promise.catch(() => undefined);
        entry = created;
        inFlight.set(key, entry);
      }
      const shared = entry;
      shared.waiters += 1;
      if (!signal) return shared.promise;
      return new Promise<MobileJapaneseLearningOcrResult>((resolve, reject) => {
        let settled = false;
        const detach = () => {
          if (settled) return;
          settled = true;
          signal.removeEventListener("abort", onAbort);
          shared.waiters -= 1;
        };
        const onAbort = () => {
          detach();
          if (shared.waiters <= 0) {
            if (inFlight.get(key) === shared) inFlight.delete(key);
            shared.controller.abort(signal.reason);
          }
          reject(abortError(signal));
        };
        signal.addEventListener("abort", onAbort, { once: true });
        shared.promise.then(
          (result) => {
            if (settled) return;
            detach();
            resolve(result);
          },
          (error: unknown) => {
            if (settled) return;
            detach();
            reject(error);
          },
        );
      });
    },
    version() {
      return version;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    clear() {
      results.clear();
      version += 1;
      for (const listener of [...listeners]) listener();
    },
    get recognizing() {
      return recognition.active;
    },
    get queued() {
      return recognition.waiting;
    },
  };
}

/**
 * The engine a page is read with right now (recognition setting, device
 * capability, online assist): part of every result key, so switching engines
 * reads the page again instead of reusing another engine's transcript.
 *
 * Never throws: the reader computes keys while rendering every page. With no
 * engine to read with (signed out without on-device OCR — every Android
 * device — or on-device forced where it is missing) the key names that state;
 * recognizing the page is what reports it (the sign-in prompt).
 */
export const MOBILE_JAPANESE_LEARNING_OCR_ENGINE_UNAVAILABLE_KEY = "unavailable";

export function mobileJapaneseLearningOcrEngineCacheKey(): string {
  const preference = getMobileJapaneseLearningEnginePreference();
  let engine: string;
  try {
    engine = resolveMobileJapaneseLearningOcrEngine(
      preference,
      getMobileJapaneseLearningCapabilities(),
    );
  } catch {
    return MOBILE_JAPANESE_LEARNING_OCR_ENGINE_UNAVAILABLE_KEY;
  }
  return isMobileJapaneseLearningOcrAssistActive(preference)
    ? `${engine}+assist`
    : engine;
}

export function mobileJapaneseLearningPageOcrKey(
  page: {
    registryId: string;
    sourceId: string;
    mangaId: string;
    chapterId: string;
    pageId: string;
  },
  engineKey: string = mobileJapaneseLearningOcrEngineCacheKey(),
): string {
  return JSON.stringify([
    engineKey,
    page.registryId,
    page.sourceId,
    page.mangaId,
    page.chapterId,
    page.pageId,
  ]);
}

/** The app-wide store: one Core ML queue, whichever reader screen asks. */
export const mobileJapaneseLearningPageOcrStore =
  createMobileJapaneseLearningPageOcrStore({
    recognize: runMobileJapaneseLearningOcr,
  });
