import type { ReadingMode, ReadingModeSetting, UserSettings } from "@/data/schema";
import type { MobileSourceMangaViewer } from "./mobileSourceMangaViewer";
import {
  readMobileReaderTitleReadingModeText,
  writeMobileReaderTitleReadingModeText,
} from "./mobileReaderTitleReadingModeStorage";

/**
 * Which way a title reads, as Aidoku iOS decides it. In order: the mode the user
 * picked for this title in the reader; the mode set in Settings, unless that is
 * Automatic; under Automatic, the format the source declares for the manga
 * (Aidoku has no source-level viewer; `Manga.viewer` is the only one); and
 * right-to-left when it declares none. Title picks are local to this device and
 * keyed like the source detail cache (`makeMobileSourceDetailCacheKey`).
 */
export function getMobileReadingModeForSourceViewer(
  viewer: MobileSourceMangaViewer | null | undefined,
): ReadingMode | null {
  switch (viewer) {
    case 1:
      return "ltr";
    case 2:
      return "rtl";
    case 3:
    case 4:
      return "scrolling";
    default:
      return null;
  }
}

export function resolveMobileReaderReadingMode({
  titleMode,
  viewer,
  globalMode,
}: {
  titleMode: ReadingMode | null | undefined;
  viewer: MobileSourceMangaViewer | null | undefined;
  globalMode: ReadingModeSetting;
}): ReadingMode {
  if (titleMode) return titleMode;
  if (globalMode !== "auto") return globalMode;
  return getMobileReadingModeForSourceViewer(viewer) ?? "rtl";
}

/**
 * The Settings value. `readerReadingMode` holds it since Automatic arrived.
 * Before that `readingMode` was only written by a pick, never as a default, so
 * an unset one is the untouched default: Automatic. A stored `rtl` is migrated
 * to Automatic too: most came from the reader sheet, which wrote this setting
 * before titles had their own, and it reads RTL titles exactly as before. A
 * stored `ltr` or `scrolling` was chosen against the default and is kept.
 */
export function getMobileReadingModeSetting(
  settings: Pick<UserSettings, "readingMode" | "readerReadingMode">,
): ReadingModeSetting {
  const current = settings.readerReadingMode;
  if (current === "auto" || isReadingMode(current)) return current;
  const legacy = settings.readingMode;
  return legacy === "ltr" || legacy === "scrolling" ? legacy : "auto";
}

const ENTRY_LIMIT = 2_000;
const WRITE_DELAY_MS = 300;

function isReadingMode(value: unknown): value is ReadingMode {
  return value === "rtl" || value === "ltr" || value === "scrolling";
}

export function parseMobileReaderTitleReadingModes(
  text: string | null | undefined,
): Map<string, ReadingMode> {
  const modes = new Map<string, ReadingMode>();
  if (!text) return modes;
  try {
    const parsed = JSON.parse(text) as { entries?: unknown };
    if (!parsed || !Array.isArray(parsed.entries)) return modes;
    for (const entry of parsed.entries) {
      if (Array.isArray(entry) && typeof entry[0] === "string" && isReadingMode(entry[1])) {
        modes.set(entry[0], entry[1]);
      }
    }
  } catch {
    return new Map();
  }
  return modes;
}

/** Most recently picked last; the oldest are dropped past the limit. */
export function serializeMobileReaderTitleReadingModes(
  modes: ReadonlyMap<string, ReadingMode>,
  limit = ENTRY_LIMIT,
): string {
  const entries = [...modes.entries()];
  return JSON.stringify({
    version: 1,
    entries: entries.slice(Math.max(0, entries.length - Math.max(0, limit))),
  });
}

let modes: Map<string, ReadingMode> | null = null;
let loading: Promise<Map<string, ReadingMode>> | null = null;
let writeTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function loadModes(): Promise<Map<string, ReadingMode>> {
  if (modes && !loading) return Promise.resolve(modes);
  loading ??= readMobileReaderTitleReadingModeText()
    .then((text) => parseMobileReaderTitleReadingModes(text))
    .catch(() => new Map<string, ReadingMode>())
    .then((loaded) => {
      // Picked while the file was read: those win.
      modes = new Map([...loaded, ...(modes ?? [])]);
      notify();
      return modes;
    });
  return loading;
}

function scheduleWrite(): void {
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    void loadModes().then((map) =>
      writeMobileReaderTitleReadingModeText(serializeMobileReaderTitleReadingModes(map)),
    );
  }, WRITE_DELAY_MS);
}

/** Starts reading the file; `peek` answers once it has. */
export function preloadMobileReaderTitleReadingModes(): void {
  void loadModes();
}

export function peekMobileReaderTitleReadingMode(key: string): ReadingMode | null {
  return modes?.get(key) ?? null;
}

/** `null` clears the pick, so the title follows its source again. */
export function setMobileReaderTitleReadingMode(key: string, mode: ReadingMode | null): void {
  if (!key) return;
  const map = (modes ??= new Map());
  map.delete(key);
  if (mode) map.set(key, mode);
  notify();
  void loadModes();
  scheduleWrite();
}

export function subscribeMobileReaderTitleReadingModes(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test hook. */
export function resetMobileReaderTitleReadingModesForTests(): void {
  modes = null;
  loading = null;
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = null;
  listeners.clear();
}
