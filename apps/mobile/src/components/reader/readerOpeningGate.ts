/**
 * The reader's opening window: from the zoom landing until the landing cover
 * has faded into the reader. A cold app's first source call boots the Aidoku
 * sandbox's WKWebView on the main thread (~1 s), which would freeze that fade
 * mid-way; work that only refreshes what the cache already painted waits for
 * the window to close instead.
 *
 * Pure (no React Native), so the timing rules are testable.
 */

export type ReaderOpeningSettleReason =
  /** The cover's fade ended (the UI-thread completion, sent to JS). */
  | "fade-end"
  /** No cover fades in this open (no zoom, no cover): nothing to protect. */
  | "no-fade"
  /** The fade's completion never arrived: a guard, not a timing. */
  | "backstop"
  /** The route went away: release whoever still waits. */
  | "disposed";

/**
 * Settles a lost fade completion. Past every fade the route can run (the
 * paged hold's 5 s cap plus its 250 ms fade), so it never cuts a real one.
 */
export const READER_OPENING_SETTLE_BACKSTOP_MS = 6000;

export type ReaderOpeningGate = {
  isSettled: () => boolean;
  /** Resolves once the window has closed (at once when it already has). */
  whenSettled: () => Promise<ReaderOpeningSettleReason>;
  /** Closes the window (idempotent: the first reason wins). */
  settle: (reason: ReaderOpeningSettleReason) => void;
  /** Arms the backstop, counted from the landing (idempotent). */
  armBackstop: () => void;
  dispose: () => void;
};

type Timers = {
  setTimeout: (callback: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
};

const defaultTimers: Timers = {
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function createReaderOpeningGate(options?: {
  backstopMs?: number;
  timers?: Timers;
  onSettled?: (reason: ReaderOpeningSettleReason) => void;
}): ReaderOpeningGate {
  const timers = options?.timers ?? defaultTimers;
  const backstopMs = options?.backstopMs ?? READER_OPENING_SETTLE_BACKSTOP_MS;
  let settledReason: ReaderOpeningSettleReason | null = null;
  let backstop: unknown = null;
  const waiters: ((reason: ReaderOpeningSettleReason) => void)[] = [];

  const settle = (reason: ReaderOpeningSettleReason) => {
    if (settledReason != null) return;
    settledReason = reason;
    if (backstop != null) {
      timers.clearTimeout(backstop);
      backstop = null;
    }
    options?.onSettled?.(reason);
    for (const waiter of waiters.splice(0)) waiter(reason);
  };

  return {
    isSettled: () => settledReason != null,
    whenSettled: () =>
      settledReason != null
        ? Promise.resolve(settledReason)
        : new Promise((resolve) => waiters.push(resolve)),
    settle,
    armBackstop: () => {
      if (settledReason != null || backstop != null) return;
      backstop = timers.setTimeout(() => {
        backstop = null;
        settle("backstop");
      }, backstopMs);
    },
    dispose: () => settle("disposed"),
  };
}

/**
 * Whether a source call that only refreshes the open chapter must wait for
 * the opening window: only when the persisted page list already painted the
 * chapter (without a cache the reader has nothing to show until the source
 * answers, so it asks at once, as before).
 */
export function shouldDeferReaderLiveRefresh(input: {
  paintedFromCache: boolean;
  openingSettled: boolean;
}): boolean {
  return input.paintedFromCache && !input.openingSettled;
}

/**
 * Waits for the opening window before a live source refresh when
 * `shouldDeferReaderLiveRefresh` says so; returns at once otherwise. Resolves
 * whether it waited. One `[reader-open]` line when it defers, one when it
 * resumes.
 */
export async function waitForReaderOpeningWindow(
  gate: ReaderOpeningGate,
  input: {
    paintedFromCache: boolean;
    what: "page-list" | "strip-neighbour";
    now?: () => number;
    log?: (message: string, data: Record<string, unknown>) => void;
  },
): Promise<boolean> {
  if (
    !shouldDeferReaderLiveRefresh({
      paintedFromCache: input.paintedFromCache,
      openingSettled: gate.isSettled(),
    })
  ) {
    return false;
  }
  const now = input.now ?? Date.now;
  const log = input.log ?? ((message, data) => console.info(message, data));
  const startedAt = now();
  log("[reader-open] live refresh deferred", { what: input.what });
  const reason = await gate.whenSettled();
  log("[reader-open] live refresh resumed", {
    what: input.what,
    reason,
    waitedMs: Math.round(now() - startedAt),
  });
  return true;
}
