import type { MobileReaderPage } from "@/sources/mobileSourcePages";
import type {
  MobileJapaneseLearningChatToolCall,
  MobileJapaneseLearningChatToolResult,
} from "./mobileJapaneseLearningChat";
import {
  MobileJapaneseLearningPageImageUnavailableError,
  mobileJapaneseLearningPageOcrStore,
  type MobileJapaneseLearningPageOcrStore,
} from "./mobileJapaneseLearningPageOcrStore";
import { sanitizeMobileErrorDiagnostic } from "./mobileSourceErrors";

/**
 * Nemu Chat's client tools (`request_transcript`, `trigger_ocr`) for the open
 * chapter — web `chat/service.ts` `executeTool` on mobile.
 *
 * Like web, a tool call never moves the reader: the requested page is read
 * off screen (web `item.page.getImage()`), recognized with the reader's own
 * engine setting, and its transcript lands in the shared per-page store, so
 * turning to that page later shows it straight away. Result strings are web's
 * verbatim — the model reads them, not the user.
 */

export type MobileJapaneseLearningChatPageSnapshot = {
  /** `loading` while the chapter's page list is still being fetched. */
  status: "loading" | "ready" | "unavailable";
  pages: readonly MobileReaderPage[];
  /** Index into `pages` for a 1-based page number; `null` when out of range. */
  indexForPageNumber?: (pageNumber: number) => number | null;
  /** Store key for a page (chapter + page id + engine). */
  pageKey: (page: MobileReaderPage) => string;
  /**
   * The page as the reader would show it (request decoration, descrambling)
   * when it was never on screen. Absent: `pages[index]` is used as is.
   */
  resolvePage?: (
    index: number,
    signal: AbortSignal,
  ) => Promise<MobileReaderPage | null>;
};

export type MobileJapaneseLearningChatPageToolsOptions = {
  /** Read at call time: the page list keeps changing while the chat runs. */
  getSnapshot: () => MobileJapaneseLearningChatPageSnapshot | null;
  store?: Pick<MobileJapaneseLearningPageOcrStore, "peek" | "recognize">;
  /** Aborted when the reader that owns the pages goes away. */
  lifetimeSignal?: AbortSignal;
  /** How long a tool waits for the chapter's page list. */
  pagesTimeoutMs?: number;
  /** Web waits up to 30 s per page; mobile also queues pages on Core ML. */
  ocrTimeoutMs?: number;
  pollMs?: number;
};

export const MOBILE_JAPANESE_LEARNING_CHAT_TOOL_PAGES_TIMEOUT_MS = 15_000;
export const MOBILE_JAPANESE_LEARNING_CHAT_TOOL_OCR_TIMEOUT_MS = 90_000;

const MOBILE_JAPANESE_LEARNING_CHAT_PAGE_TOOLS = new Set([
  "request_transcript",
  "trigger_ocr",
]);

export function isMobileJapaneseLearningChatPageTool(toolName: string): boolean {
  return MOBILE_JAPANESE_LEARNING_CHAT_PAGE_TOOLS.has(toolName);
}

class ToolTimeoutError extends Error {
  constructor() {
    super("timed out");
    this.name = "ToolTimeoutError";
  }
}

class ReaderClosedError extends Error {
  constructor() {
    super("reader closed");
    this.name = "ReaderClosedError";
  }
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("Aborted", "AbortError");
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortReason(signal));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortReason(signal));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function waitForPages(
  getSnapshot: () => MobileJapaneseLearningChatPageSnapshot | null,
  signal: AbortSignal,
  timeoutMs: number,
  pollMs: number,
): Promise<MobileJapaneseLearningChatPageSnapshot | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const snapshot = getSnapshot();
    if (snapshot?.status !== "loading") return snapshot;
    if (Date.now() >= deadline) return snapshot;
    await sleep(pollMs, signal);
  }
}

export function createMobileJapaneseLearningChatPageTools(
  options: MobileJapaneseLearningChatPageToolsOptions,
): (
  toolCall: MobileJapaneseLearningChatToolCall,
  callOptions?: { signal?: AbortSignal },
) => Promise<MobileJapaneseLearningChatToolResult> {
  const store = options.store ?? mobileJapaneseLearningPageOcrStore;
  const pagesTimeoutMs =
    options.pagesTimeoutMs ?? MOBILE_JAPANESE_LEARNING_CHAT_TOOL_PAGES_TIMEOUT_MS;
  const ocrTimeoutMs =
    options.ocrTimeoutMs ?? MOBILE_JAPANESE_LEARNING_CHAT_TOOL_OCR_TIMEOUT_MS;
  const pollMs = options.pollMs ?? 250;

  return async (toolCall, callOptions) => {
    const { toolCallId, toolName } = toolCall;
    const ok = (result: string): MobileJapaneseLearningChatToolResult => ({
      toolCallId,
      toolName,
      result,
    });
    const fail = (result: string): MobileJapaneseLearningChatToolResult => ({
      toolCallId,
      toolName,
      result,
      isError: true,
    });

    if (!isMobileJapaneseLearningChatPageTool(toolName)) {
      return fail(`Unknown tool: ${toolName}`);
    }
    const isTrigger = toolName === "trigger_ocr";
    const pageNumber = Number(toolCall.args.pageNumber);
    if (!Number.isFinite(pageNumber) || pageNumber < 1) {
      return fail("Invalid page number provided.");
    }

    const requestSignal = callOptions?.signal;
    if (requestSignal?.aborted) throw abortReason(requestSignal);
    if (options.lifetimeSignal?.aborted) {
      return fail("Page not available in the current chapter.");
    }

    // One scope per call: the chat request, the reader's lifetime and this
    // call's own deadline all end it.
    const scope = new AbortController();
    const forward = (source: AbortSignal | undefined, reason: () => unknown) => {
      if (!source) return () => undefined;
      const onAbort = () => scope.abort(reason());
      source.addEventListener("abort", onAbort, { once: true });
      return () => source.removeEventListener("abort", onAbort);
    };
    const unforwardRequest = forward(requestSignal, () =>
      abortReason(requestSignal!),
    );
    const unforwardLifetime = forward(
      options.lifetimeSignal,
      () => new ReaderClosedError(),
    );
    let deadline: ReturnType<typeof setTimeout> | null = null;
    const startDeadline = (ms: number) => {
      if (deadline) clearTimeout(deadline);
      deadline = setTimeout(() => scope.abort(new ToolTimeoutError()), ms);
    };

    // The deadline can beat the page wait's own timeout on a busy thread;
    // either way the page list never arrived.
    let waitingForPages = true;
    try {
      startDeadline(pagesTimeoutMs + pollMs);
      const snapshot = await waitForPages(
        options.getSnapshot,
        scope.signal,
        pagesTimeoutMs,
        pollMs,
      );
      waitingForPages = false;
      if (!snapshot || snapshot.status !== "ready" || snapshot.pages.length === 0) {
        return fail("Page not found in the current chapter.");
      }
      const index = snapshot.indexForPageNumber
        ? snapshot.indexForPageNumber(pageNumber)
        : Number.isInteger(pageNumber) && pageNumber <= snapshot.pages.length
          ? pageNumber - 1
          : null;
      if (index == null) return fail("Page not found in the current chapter.");
      const page = snapshot.pages[index];
      if (!page) return fail("Page not available in the current chapter.");

      // Source-provided text (novels, text pages) is the transcript.
      const sourceText = page.text?.trim();
      if (sourceText) {
        return ok(isTrigger ? `Page ${pageNumber} OCR already available.` : sourceText);
      }

      const key = snapshot.pageKey(page);
      const cached = store.peek(key);
      if (cached) {
        const text = cached.text.trim();
        return ok(
          isTrigger
            ? `Page ${pageNumber} OCR already available.`
            : text || "No text found on this page.",
        );
      }

      startDeadline(ocrTimeoutMs);
      const resolvePage = snapshot.resolvePage;
      const result = await store.recognize({
        key,
        priority: "chat",
        signal: scope.signal,
        page:
          resolvePage && page.imageProcessing === "pending"
            ? (signal) => resolvePage(index, signal)
            : page,
      });
      const text = result.text.trim();
      if (isTrigger) return ok(`OCR complete for page ${pageNumber}.`);
      return ok(text || "No text found on this page.");
    } catch (error) {
      if (requestSignal?.aborted) throw abortReason(requestSignal);
      if (error instanceof MobileJapaneseLearningPageImageUnavailableError) {
        return fail(`Page ${pageNumber} image not available yet.`);
      }
      const reason = scope.signal.aborted ? scope.signal.reason : null;
      if (reason instanceof ReaderClosedError) {
        return fail("Page not available in the current chapter.");
      }
      if (reason instanceof ToolTimeoutError) {
        if (waitingForPages) return fail("Page not found in the current chapter.");
        return fail("OCR processing failed or timed out.");
      }
      // The summary leads; a sanitized reason helps the model explain.
      const detail = sanitizeMobileErrorDiagnostic(error);
      return fail(
        detail
          ? `OCR processing failed or timed out. (${detail})`
          : "OCR processing failed or timed out.",
      );
    } finally {
      if (deadline) clearTimeout(deadline);
      unforwardRequest();
      unforwardLifetime();
    }
  };
}
