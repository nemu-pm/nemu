import {
  readMobileReaderResumeText,
  writeMobileReaderResumeText,
} from "./mobileReaderResumePositionStorage";

/**
 * Where the reader stopped in a chapter on this device (local only).
 *
 * The synced chapter progress is a high-water mark (the furthest page read,
 * merged with Math.max across devices). Reading back to an earlier page and
 * leaving must still reopen there on this device, so the last position is
 * remembered here, beside — never inside — the synced record.
 */
export type MobileReaderResumePosition = {
  /** Page in source order (independent of the reading direction). */
  sourceIndex: number;
  /** How far into that page the reading line sat (scroll reading), 0–1. */
  fraction: number;
  /** The chapter's page count when saved (a changed chapter is ignored). */
  total: number;
  /** Wall clock of the save. */
  savedAt: number;
  /**
   * The newest `lastReadAt` this device itself wrote to the synced progress
   * of the chapter (sync clocks may run ahead of the wall clock).
   */
  progressAt: number;
};

/** The synced progress fields the choice reads. */
export type MobileReaderResumeSyncedProgress = {
  progress: number;
  total: number;
  lastReadAt: number;
  resetAt?: number;
};

export type MobileReaderResumeChoice = {
  sourceIndex: number;
  fraction: number;
  origin: "local" | "progress";
};

/** Clock skew between devices tolerated before a remote read counts as newer. */
const REMOTE_NEWER_SLACK_MS = 2_000;
const RESUME_ENTRY_LIMIT = 400;

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizePosition(value: unknown): MobileReaderResumePosition | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (
    !finiteNumber(record.sourceIndex) ||
    !finiteNumber(record.total) ||
    !finiteNumber(record.savedAt) ||
    record.sourceIndex < 0 ||
    record.total < 1
  ) {
    return null;
  }
  return {
    sourceIndex: Math.trunc(record.sourceIndex),
    fraction: finiteNumber(record.fraction)
      ? Math.max(0, Math.min(1, record.fraction))
      : 0,
    total: Math.trunc(record.total),
    savedAt: record.savedAt,
    progressAt: finiteNumber(record.progressAt) ? record.progressAt : 0,
  };
}

/**
 * The page to reopen a chapter at: this device's own last position, unless
 * another device has read (or reset) the chapter since — then the synced
 * high-water page. `null`: start at the beginning.
 */
export function chooseMobileReaderResumePosition({
  local,
  progress,
  pageCount,
}: {
  local: MobileReaderResumePosition | null | undefined;
  progress: MobileReaderResumeSyncedProgress | null | undefined;
  pageCount: number;
}): MobileReaderResumeChoice | null {
  const synced: MobileReaderResumeChoice | null =
    progress && progress.total > 1 && finiteNumber(progress.progress)
      ? { sourceIndex: progress.progress, fraction: 0, origin: "progress" }
      : null;
  if (
    !local ||
    !(pageCount > 0) ||
    local.total !== pageCount ||
    local.sourceIndex < 0 ||
    local.sourceIndex >= pageCount
  ) {
    return synced;
  }
  if (progress) {
    const ownLatest = Math.max(local.savedAt, local.progressAt);
    const remoteLatest = Math.max(
      finiteNumber(progress.lastReadAt) ? progress.lastReadAt : 0,
      finiteNumber(progress.resetAt) ? progress.resetAt : 0,
    );
    // Read (or marked unread) somewhere else after this device stopped.
    if (remoteLatest > ownLatest + REMOTE_NEWER_SLACK_MS) return synced;
  }
  return {
    sourceIndex: local.sourceIndex,
    fraction: local.fraction,
    origin: "local",
  };
}

export function parseMobileReaderResumePositions(
  text: string | null | undefined,
): Map<string, MobileReaderResumePosition> {
  const positions = new Map<string, MobileReaderResumePosition>();
  if (!text) return positions;
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object") return positions;
    const entries = (parsed as { entries?: unknown }).entries;
    if (!Array.isArray(entries)) return positions;
    for (const entry of entries) {
      if (!Array.isArray(entry) || typeof entry[0] !== "string") continue;
      const position = normalizePosition(entry[1]);
      if (position) positions.set(entry[0], position);
    }
  } catch {
    return new Map();
  }
  return positions;
}

/** Oldest saves are dropped past the limit. */
export function serializeMobileReaderResumePositions(
  positions: ReadonlyMap<string, MobileReaderResumePosition>,
  limit = RESUME_ENTRY_LIMIT,
): string {
  const entries = [...positions.entries()]
    .sort((a, b) => b[1].savedAt - a[1].savedAt)
    .slice(0, Math.max(0, limit));
  return JSON.stringify({ version: 1, entries });
}

// --- The device store ------------------------------------------------------

let positions: Map<string, MobileReaderResumePosition> | null = null;
let loading: Promise<Map<string, MobileReaderResumePosition>> | null = null;
let writeTimer: ReturnType<typeof setTimeout> | null = null;
let flushRequested = false;
const WRITE_DELAY_MS = 400;

function loadPositions(): Promise<Map<string, MobileReaderResumePosition>> {
  if (positions) return Promise.resolve(positions);
  loading ??= readMobileReaderResumeText()
    .then((text) => parseMobileReaderResumePositions(text))
    .catch(() => new Map<string, MobileReaderResumePosition>())
    .then((loaded) => {
      // Writes made while the file was read win over what it held.
      positions = new Map([...loaded, ...(positions ?? [])]);
      return positions;
    });
  return loading;
}

function scheduleWrite(): void {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = null;
  if (flushRequested) {
    flushRequested = false;
    void writeNow();
    return;
  }
  writeTimer = setTimeout(() => {
    writeTimer = null;
    void writeNow();
  }, WRITE_DELAY_MS);
}

async function writeNow(): Promise<void> {
  const loaded = await loadPositions();
  await writeMobileReaderResumeText(serializeMobileReaderResumePositions(loaded));
}

function update(
  apply: (map: Map<string, MobileReaderResumePosition>) => boolean,
): void {
  // Applied at once when the store is loaded, so a flush right after a save
  // (leaving the reader) writes it.
  if (positions) {
    if (apply(positions)) scheduleWrite();
    return;
  }
  void loadPositions().then((map) => {
    if (apply(map)) scheduleWrite();
  });
}

/** Key of a chapter: the synced chapter-progress id it sits beside. */
export async function loadMobileReaderResumePosition(
  key: string,
): Promise<MobileReaderResumePosition | null> {
  if (!key) return null;
  return (await loadPositions()).get(key) ?? null;
}

export function saveMobileReaderResumePosition(
  key: string,
  position: Omit<MobileReaderResumePosition, "progressAt"> & { progressAt?: number },
): void {
  if (!key) return;
  update((map) => {
    const existing = map.get(key);
    const next = normalizePosition({
      ...position,
      progressAt: Math.max(position.progressAt ?? 0, existing?.progressAt ?? 0),
    });
    if (!next) return false;
    if (
      existing &&
      existing.sourceIndex === next.sourceIndex &&
      Math.abs(existing.fraction - next.fraction) < 0.001 &&
      existing.total === next.total &&
      existing.progressAt === next.progressAt
    ) {
      return false;
    }
    map.delete(key);
    map.set(key, next);
    return true;
  });
}

/** This device just wrote the chapter's synced progress at `lastReadAt`. */
export function noteMobileReaderResumeProgressWrite(
  key: string,
  lastReadAt: number,
): void {
  if (!key || !finiteNumber(lastReadAt)) return;
  update((map) => {
    const existing = map.get(key);
    if (!existing || existing.progressAt >= lastReadAt) return false;
    map.set(key, { ...existing, progressAt: lastReadAt });
    return true;
  });
}

/** Mark as Unread / a reset: forget where this device stopped. */
export function clearMobileReaderResumePositions(keys: readonly string[]): void {
  if (keys.length === 0) return;
  update((map) => {
    let changed = false;
    for (const key of keys) changed = map.delete(key) || changed;
    return changed;
  });
}

/** Leaving the reader / the app: write what is pending now. */
export function flushMobileReaderResumePositions(): void {
  if (!positions) {
    // Still loading: the save waiting on it writes at once.
    flushRequested = true;
    return;
  }
  if (!writeTimer) return;
  clearTimeout(writeTimer);
  writeTimer = null;
  void writeNow();
}

/** Test hook: forget the in-memory store. */
export function resetMobileReaderResumePositionsForTests(): void {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = null;
  flushRequested = false;
  positions = null;
  loading = null;
}
