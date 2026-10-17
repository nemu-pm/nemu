/**
 * "Shift by One Page" (错开一页), remembered per manga. A chapter keeps its
 * own choice; a chapter the reader has not shifted takes the manga's latest
 * one, since a scan or a publisher tends to keep its page order across
 * chapters.
 */
export type MobileReaderPairingShiftEntry = { shift: boolean; chapters?: Record<string, boolean> };
export type MobileReaderPairingShifts = Record<string, MobileReaderPairingShiftEntry>;

/** Chapters remembered per manga; the oldest are dropped first. */
export const MOBILE_READER_PAIRING_SHIFT_CHAPTER_LIMIT = 200;
/** Manga remembered; the oldest are dropped first. */
export const MOBILE_READER_PAIRING_SHIFT_MANGA_LIMIT = 500;

export function mobileReaderPairingShiftKey(registryId: string, sourceId: string, mangaId: string): string {
  return JSON.stringify([registryId, sourceId, mangaId]);
}

export function mobileReaderPairingShifted(
  entry: MobileReaderPairingShiftEntry | null | undefined,
  chapterId: string,
): boolean {
  if (!entry) return false;
  return entry.chapters?.[chapterId] ?? entry.shift === true;
}

export function normalizeMobileReaderPairingShifts(value: unknown): MobileReaderPairingShifts {
  if (!value || typeof value !== "object") return {};
  const out: MobileReaderPairingShifts = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as { shift?: unknown; chapters?: unknown };
    const chapters: Record<string, boolean> = {};
    if (entry.chapters && typeof entry.chapters === "object") {
      for (const [chapterId, shifted] of Object.entries(entry.chapters as Record<string, unknown>)) {
        if (typeof shifted === "boolean") chapters[chapterId] = shifted;
      }
    }
    out[key] = { shift: entry.shift === true, chapters };
  }
  return out;
}

function lastEntries<T>(record: Record<string, T>, limit: number): Record<string, T> {
  const entries = Object.entries(record);
  return entries.length <= limit ? record : Object.fromEntries(entries.slice(entries.length - limit));
}

/** Flips this chapter's pairing and makes it the manga's latest choice. */
export function toggleMobileReaderPairingShift(
  shifts: MobileReaderPairingShifts,
  key: string,
  chapterId: string,
): MobileReaderPairingShifts {
  const entry = shifts[key];
  const shift = !mobileReaderPairingShifted(entry, chapterId);
  const { [chapterId]: _previous, ...otherChapters } = entry?.chapters ?? {};
  void _previous;
  const chapters = lastEntries({ ...otherChapters, [chapterId]: shift }, MOBILE_READER_PAIRING_SHIFT_CHAPTER_LIMIT);
  const { [key]: _old, ...others } = shifts;
  void _old;
  return lastEntries({ ...others, [key]: { shift, chapters } }, MOBILE_READER_PAIRING_SHIFT_MANGA_LIMIT);
}
