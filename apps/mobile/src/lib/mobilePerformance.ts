const mobilePerformanceEnabled =
  process.env.EXPO_PUBLIC_MOBILE_PERF === "1" ||
  process.env.NODE_ENV === "development";

export const MOBILE_PERFORMANCE_MARKS = {
  bootJsEntry: "boot.js-entry",
  bootRootModule: "boot.root-module",
  bootFontsReady: "boot.fonts-ready",
  bootProfileReady: "boot.profile-ready",
  bootDatabaseReady: "boot.database-ready",
  bootRootLayout: "boot.root-layout",
  routeChange: "route.change",
  readerPagesRequest: "reader.pages-request",
  readerFirstPage: "reader.first-page",
} as const;

export type MobileSyncPerformancePhase =
  | "library"
  | "collections"
  | "progress"
  | "settings"
  | "packages";

export type MobilePerformanceEntry = {
  sequence: number;
  label: string;
  kind: "mark" | "measure";
  at: number;
  durationMs?: number;
  metadata?: Record<string, unknown>;
};

const MAX_MOBILE_PERFORMANCE_ENTRIES = 200;
const mobilePerformanceEntries: MobilePerformanceEntry[] = [];
let nextMobilePerformanceSequence = 0;
let mobilePerformanceEnabledOverride: boolean | null = null;

function isMobilePerformanceEnabled(): boolean {
  return mobilePerformanceEnabledOverride ?? mobilePerformanceEnabled;
}

function recordMobilePerformanceEntry(
  entry: Omit<MobilePerformanceEntry, "sequence">,
): void {
  if (!isMobilePerformanceEnabled()) return;
  const recorded = { ...entry, sequence: nextMobilePerformanceSequence };
  const index = nextMobilePerformanceSequence % MAX_MOBILE_PERFORMANCE_ENTRIES;
  nextMobilePerformanceSequence += 1;
  if (mobilePerformanceEntries.length < MAX_MOBILE_PERFORMANCE_ENTRIES) {
    mobilePerformanceEntries.push(recorded);
  } else {
    mobilePerformanceEntries[index] = recorded;
  }
}

export function getMobilePerformanceEntries(): MobilePerformanceEntry[] {
  return [...mobilePerformanceEntries].sort((left, right) =>
    left.sequence - right.sequence,
  );
}

export function resetMobilePerformanceEntriesForTesting(): void {
  mobilePerformanceEntries.length = 0;
  nextMobilePerformanceSequence = 0;
}

export function setMobilePerformanceEnabledForTesting(
  enabled: boolean | null,
): void {
  mobilePerformanceEnabledOverride = enabled;
}

type IdleCallback = (deadline: {
  didTimeout: boolean;
  timeRemaining: () => number;
}) => void;

type MobileIdleScheduler = (
  callback: IdleCallback,
  options?: { timeout?: number },
) => unknown;

function nowMs(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

export function markMobilePerformance(
  label: string,
  metadata?: Record<string, unknown>,
): number {
  const startedAt = nowMs();
  recordMobilePerformanceEntry({
    label,
    kind: "mark",
    at: startedAt,
    ...(metadata ? { metadata } : {}),
  });
  if (mobilePerformanceEnabled) {
    console.debug("[mobile-perf]", label, {
      at: Math.round(startedAt),
      ...(metadata ?? {}),
    });
  }
  return startedAt;
}

export function measureMobilePerformance(
  label: string,
  startedAt: number,
  metadata?: Record<string, unknown>,
): number {
  const durationMs = Math.max(0, nowMs() - startedAt);
  recordMobilePerformanceEntry({
    label,
    kind: "measure",
    at: startedAt,
    durationMs,
    ...(metadata ? { metadata } : {}),
  });
  if (mobilePerformanceEnabled) {
    console.debug("[mobile-perf]", label, {
      durationMs: Math.round(durationMs),
      ...(metadata ?? {}),
    });
  }
  return durationMs;
}

export function startMobileSyncPerformancePhase(
  phase: MobileSyncPerformancePhase,
  metadata?: Record<string, unknown>,
): { finish: (metadata?: Record<string, unknown>) => number } {
  const startedAt = markMobilePerformance(`sync.${phase}.start`, metadata);
  let finished = false;
  return {
    finish(finishMetadata) {
      if (finished) return 0;
      finished = true;
      return measureMobilePerformance(`sync.${phase}`, startedAt, {
        ...(metadata ?? {}),
        ...(finishMetadata ?? {}),
      });
    },
  };
}

export function runAfterMobileInteractions<T>(
  task: () => T | Promise<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const runTask = () => {
      Promise.resolve()
        .then(task)
        .then(resolve, reject);
    };
    const scheduleIdle = (
      globalThis as { requestIdleCallback?: MobileIdleScheduler }
    ).requestIdleCallback;
    const scheduleFrame =
      typeof requestAnimationFrame === "function"
        ? requestAnimationFrame
        : (callback: FrameRequestCallback) => setTimeout(callback, 0);

    scheduleFrame(() => {
      if (typeof scheduleIdle === "function") {
        scheduleIdle(runTask, { timeout: 700 });
        return;
      }
      setTimeout(runTask, 0);
    });
  });
}
