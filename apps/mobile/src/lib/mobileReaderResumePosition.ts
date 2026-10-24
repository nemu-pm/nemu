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
  /**
   * Saved while re-reading: the reader opened the chapter already completed.
   * A completed chapter reopens only at such a spot (and only short of its
   * last page); any other spot — the one left by finishing it, or a legacy
   * entry without the flag — reopens it at the top of page 1.
   */
  reread?: boolean;
};

/** The synced progress fields the choice reads. */
export type MobileReaderResumeSyncedProgress = {
  progress: number;
  total: number;
  lastReadAt: number;
  resetAt?: number;
  completed?: boolean;
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
    ...(record.reread === true ? { reread: true } : {}),
  };
}

/**
 * The page to reopen a chapter at: this device's own last position, unless
 * another device has read (or reset) the chapter since — then the synced
 * high-water page. `null`: start at the beginning.
 *
 * A completed chapter starts at the top of page 1 (its synced page is the
 * last one, kept there by the high-water merge), unless this device holds a
 * spot from a re-read short of the last page.
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
  const completed = progress?.completed === true;
  const synced: MobileReaderResumeChoice | null =
    !completed && progress && progress.total > 1 && finiteNumber(progress.progress)
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
  if (completed && (!local.reread || local.sourceIndex >= local.total - 1)) {
    return null;
  }
  return {
    sourceIndex: local.sourceIndex,
    fraction: local.fraction,
    origin: "local",
  };
}

/** What a chapter's page row (title page list, Continue card) shows. */
export type MobileChapterOpeningPage = {
  /** Page in source order the reader opens at. */
  sourceIndex: number;
  /** The chapter's page count the page is out of. */
  total: number;
  origin: MobileReaderResumeChoice["origin"];
};

/**
 * The page the reader will open a chapter at, for the rows and cards that
 * show "Page X of Y" outside the reader: the very choice the reader's resume
 * makes (`chooseMobileReaderResumePosition`), from this device's local spot
 * and the synced record, judged against the page count the synced record
 * holds (the reader's own count when it last saved; the local spot's when
 * there is no synced record). `null`: the reader starts at the beginning —
 * an unread chapter, or a completed one without a re-read spot.
 */
export function resolveMobileChapterOpeningPage({
  local,
  progress,
}: {
  local: MobileReaderResumePosition | null | undefined;
  progress: MobileReaderResumeSyncedProgress | null | undefined;
}): MobileChapterOpeningPage | null {
  const pageCount =
    progress && finiteNumber(progress.total) && progress.total > 0
      ? Math.trunc(progress.total)
      : local?.total ?? 0;
  const choice = chooseMobileReaderResumePosition({ local, progress, pageCount });
  if (!choice) return null;
  return { sourceIndex: choice.sourceIndex, total: pageCount, origin: choice.origin };
}

/**
 * Scroll reading: the chapter's last page is on screen — the screen's bottom
 * is at or past that page's top. On a chapter of short slices (Tower of God)
 * the reading line rests a few pages short of the last one at the end, so
 * this, not the saved page, says the chapter was read to its end.
 */
export function isMobileReaderLastPageVisible(
  layout: { readonly starts: readonly number[]; readonly gaps: readonly number[] } | null | undefined,
  viewport: { top: number; height: number } | null | undefined,
): boolean {
  if (!layout || !viewport) return false;
  const last = layout.starts.length - 1;
  if (last < 0 || !Number.isFinite(viewport.top) || !(viewport.height > 0)) return false;
  const lastTop = layout.starts[last]! + (layout.gaps[last] ?? 0);
  return viewport.top + viewport.height >= lastTop;
}

/**
 * The `reread` flag of a save: a session that opened the chapter completed
 * saves re-read spots — until it has seen the last page, which (latched for
 * the session) makes every later save, the unmount's included, a finished
 * one: the chapter reopens at the top of page 1.
 */
export function mobileReaderResumeReread(openedCompleted: boolean, finishedThisSession: boolean): boolean {
  return openedCompleted && !finishedThisSession;
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
const listeners = new Set<() => void>();

function notifyListeners(): void {
  for (const listener of [...listeners]) listener();
}

function loadPositions(): Promise<Map<string, MobileReaderResumePosition>> {
  if (positions) return Promise.resolve(positions);
  loading ??= readMobileReaderResumeText()
    .then((text) => parseMobileReaderResumePositions(text))
    .catch(() => new Map<string, MobileReaderResumePosition>())
    .then((loaded) => {
      // Writes made while the file was read win over what it held.
      positions = new Map([...loaded, ...(positions ?? [])]);
      notifyListeners();
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
    if (apply(positions)) {
      scheduleWrite();
      notifyListeners();
    }
    return;
  }
  void loadPositions().then((map) => {
    if (apply(map)) {
      scheduleWrite();
      notifyListeners();
    }
  });
}

/**
 * Screens outside the reader (the chapter rows, Continue cards): called on
 * every change of the store (and once it has loaded). Starts the load.
 */
export function subscribeMobileReaderResumePositions(listener: () => void): () => void {
  listeners.add(listener);
  void loadPositions();
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The spot held for a chapter right now, without waiting (`null` before the
 * store has loaded). An entry keeps its identity until it changes.
 */
export function peekMobileReaderResumePosition(
  key: string | null | undefined,
): MobileReaderResumePosition | null {
  if (!key || !positions) return null;
  return positions.get(key) ?? null;
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
      existing.progressAt === next.progressAt &&
      (existing.reread ?? false) === (next.reread ?? false)
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

/**
 * The chapter was just completed: the spot this device holds is no longer a
 * re-read spot, so the chapter reopens at the top of page 1.
 */
export function markMobileReaderResumeFinished(key: string): void {
  if (!key) return;
  update((map) => {
    const existing = map.get(key);
    if (!existing || !existing.reread) return false;
    map.set(key, { ...existing, reread: false });
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
