/**
 * Bounded write log for `manga_progress` rows.
 *
 * A page turn persists one row and then emits a scope-only `"progress"` event.
 * Without a delta the only way for a subscriber to answer "what changed?" is to
 * re-read and re-parse every stored row — roughly twice a second while reading,
 * growing with every manga the user has ever opened. The stores record each
 * write here so subscribers can re-read just the rows that moved.
 *
 * The log is intentionally lossy: it keeps a small window and reports "unknown"
 * for anything older, for a bulk write, or after a wholesale invalidation. An
 * unknown delta simply falls back to the full scan, so a subscriber can never
 * observe a stale row because the log forgot one.
 */

import type { LocalMangaProgress } from "./schema";

const MAX_TRACKED_WRITES = 256;

type MangaProgressWrite = {
  sequence: number;
  /** `null` marks a change whose affected rows are not enumerable. */
  id: string | null;
};

let writeSequence = 0;
let writes: MangaProgressWrite[] = [];

function append(id: string | null): void {
  writeSequence += 1;
  writes.push({ sequence: writeSequence, id });
  if (writes.length > MAX_TRACKED_WRITES) {
    writes = writes.slice(writes.length - MAX_TRACKED_WRITES);
  }
}

/** The cursor a subscriber should capture before reading the full table. */
export function mangaProgressWriteCursor(): number {
  return writeSequence;
}

export function recordMangaProgressWrite(id: string): void {
  append(id);
}

/** Batch applies, snapshot merges and account wipes touch rows this log does
 * not enumerate, so they force subscribers back to a full read. */
export function recordMangaProgressBulkChange(): void {
  append(null);
}

export type MangaProgressWriteDelta = {
  /** Cursor to store once the reported ids have been re-read. */
  cursor: number;
  ids: string[];
};

/**
 * Ids written after `cursor`, or `null` when the delta cannot be
 * reconstructed and the caller must re-read everything.
 */
export function mangaProgressWritesSince(
  cursor: number,
): MangaProgressWriteDelta | null {
  if (!Number.isSafeInteger(cursor) || cursor < 0 || cursor > writeSequence) {
    return null;
  }
  if (cursor === writeSequence) return { cursor, ids: [] };
  // The oldest retained write must be the very next one after the cursor;
  // otherwise entries between them were already evicted from the window.
  const oldest = writes[0];
  if (!oldest || oldest.sequence > cursor + 1) return null;
  const ids = new Set<string>();
  for (const write of writes) {
    if (write.sequence <= cursor) continue;
    if (write.id === null) return null;
    ids.add(write.id);
  }
  return { cursor: writeSequence, ids: [...ids] };
}

/** Test-only: restore the module to its freshly-imported state. */
export function resetMangaProgressChangeLog(): void {
  writeSequence = 0;
  writes = [];
}

/** Newest-read first, matching the stores' `ORDER BY lastReadAt DESC`. */
function sortMangaProgressByRecency(
  progress: LocalMangaProgress[],
): LocalMangaProgress[] {
  return [...progress].sort(
    (left, right) =>
      right.lastReadAt - left.lastReadAt || left.id.localeCompare(right.id),
  );
}

/**
 * Fold re-read rows into an already-loaded list. `rows` is positional against
 * `changedIds`; a `null` row means the id no longer exists and is dropped.
 * Unchanged entries keep their object identity so memo consumers keyed on a
 * sibling row do not recompute.
 */
export function applyMangaProgressPatch(
  current: readonly LocalMangaProgress[],
  changedIds: readonly string[],
  rows: readonly (LocalMangaProgress | null)[],
): LocalMangaProgress[] {
  const removed = new Set<string>();
  const replacements = new Map<string, LocalMangaProgress>();
  changedIds.forEach((id, index) => {
    const row = rows[index] ?? null;
    if (row) replacements.set(id, row);
    else removed.add(id);
  });
  const next = current.flatMap((entry) => {
    if (removed.has(entry.id)) return [];
    const replacement = replacements.get(entry.id);
    if (!replacement) return [entry];
    replacements.delete(entry.id);
    return [replacement];
  });
  return sortMangaProgressByRecency([...next, ...replacements.values()]);
}
