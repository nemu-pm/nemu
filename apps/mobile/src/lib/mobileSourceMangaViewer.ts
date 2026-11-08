import {
  readMobileSourceMangaViewerText,
  writeMobileSourceMangaViewerText,
} from "./mobileSourceMangaViewerStorage";

/**
 * The reading format a source declares for each manga, by the aidoku-rs `Viewer`
 * enum: 0 unknown, 1 left-to-right, 2 right-to-left, 3 vertical, 4 webtoon.
 * Legacy-ABI sources (and the runtime's `Viewer` constant) number 1 and 2 the
 * other way round; the sandbox converts them before they get here, as Aidoku
 * iOS's `MangaViewer.toNew()` does. Remembered on this device from its details
 * fetches so the reader knows it without asking the source again. Local only:
 * no library or sync record carries it.
 *
 * Keyed like the source detail cache (`makeMobileSourceDetailCacheKey`).
 */
export type MobileSourceMangaViewer = 0 | 1 | 2 | 3 | 4;

const ENTRY_LIMIT = 2_000;
const WRITE_DELAY_MS = 1_000;

export function normalizeMobileSourceMangaViewer(
  value: unknown,
): MobileSourceMangaViewer | null {
  return value === 0 || value === 1 || value === 2 || value === 3 || value === 4
    ? value
    : null;
}

export function parseMobileSourceMangaViewers(
  text: string | null | undefined,
): Map<string, MobileSourceMangaViewer> {
  const viewers = new Map<string, MobileSourceMangaViewer>();
  if (!text) return viewers;
  try {
    const parsed = JSON.parse(text) as { entries?: unknown };
    if (!parsed || !Array.isArray(parsed.entries)) return viewers;
    for (const entry of parsed.entries) {
      if (!Array.isArray(entry) || typeof entry[0] !== "string") continue;
      const viewer = normalizeMobileSourceMangaViewer(entry[1]);
      if (viewer != null) viewers.set(entry[0], viewer);
    }
  } catch {
    return new Map();
  }
  return viewers;
}

/** Most recently recorded last; the oldest are dropped past the limit. */
export function serializeMobileSourceMangaViewers(
  viewers: ReadonlyMap<string, MobileSourceMangaViewer>,
  limit = ENTRY_LIMIT,
): string {
  const entries = [...viewers.entries()];
  return JSON.stringify({
    version: 1,
    entries: entries.slice(Math.max(0, entries.length - Math.max(0, limit))),
  });
}

let viewers: Map<string, MobileSourceMangaViewer> | null = null;
let loading: Promise<Map<string, MobileSourceMangaViewer>> | null = null;
let writeTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function loadViewers(): Promise<Map<string, MobileSourceMangaViewer>> {
  if (viewers) return Promise.resolve(viewers);
  loading ??= readMobileSourceMangaViewerText()
    .then((text) => parseMobileSourceMangaViewers(text))
    .catch(() => new Map<string, MobileSourceMangaViewer>())
    .then((loaded) => {
      // Recorded while the file was read: those win.
      viewers = new Map([...loaded, ...(viewers ?? [])]);
      notify();
      return viewers;
    });
  return loading;
}

function scheduleWrite(): void {
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    void loadViewers().then((map) =>
      writeMobileSourceMangaViewerText(serializeMobileSourceMangaViewers(map)),
    );
  }, WRITE_DELAY_MS);
}

export async function loadMobileSourceMangaViewer(
  key: string,
): Promise<MobileSourceMangaViewer | null> {
  if (!key) return null;
  return (await loadViewers()).get(key) ?? null;
}

export function rememberMobileSourceMangaViewer(key: string, value: unknown): void {
  const viewer = normalizeMobileSourceMangaViewer(value);
  if (!key || viewer == null) return;
  void loadViewers().then((map) => {
    if (map.get(key) === viewer) return;
    map.delete(key);
    map.set(key, viewer);
    notify();
    scheduleWrite();
  });
}

/** What is known right now, without waiting for the file. */
export function peekMobileSourceMangaViewer(key: string): MobileSourceMangaViewer | null {
  return viewers?.get(key) ?? null;
}

export function subscribeMobileSourceMangaViewers(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test hook. */
export function resetMobileSourceMangaViewersForTests(): void {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = null;
  viewers = null;
  loading = null;
  listeners.clear();
}
