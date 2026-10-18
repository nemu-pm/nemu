/**
 * "Shift by One Page" (错开一页). A chapter's choice is its own: it never
 * carries to other chapters, because covers, colour pages and credits
 * differ from chapter to chapter. Only when the reader makes the same
 * correction on two neighbouring chapters does it become the manga's
 * learned default, which then applies to chapters without a choice of their
 * own, and there only where pairing had no confident evidence
 * (`fallbackShift`). A chapter's own choice always wins.
 */
export type MobileReaderPairingShiftEntry = {
  chapters?: Record<string, boolean>;
  /** The manga's learned default (the same correction on two neighbouring chapters). */
  learned?: boolean;
  /** Builds before 2026-10 stored the manga's latest choice here; it is ignored. */
  shift?: boolean;
};
export type MobileReaderPairingShifts = Record<string, MobileReaderPairingShiftEntry>;

/** Chapters remembered per manga; the oldest are dropped first. */
export const MOBILE_READER_PAIRING_SHIFT_CHAPTER_LIMIT = 200;
/** Manga remembered; the oldest are dropped first. */
export const MOBILE_READER_PAIRING_SHIFT_MANGA_LIMIT = 500;

export function mobileReaderPairingShiftKey(registryId: string, sourceId: string, mangaId: string): string {
  return JSON.stringify([registryId, sourceId, mangaId]);
}

/**
 * What applies to one chapter: `shift` flips the whole chapter (its own
 * choice), `fallbackShift` flips only the spreads the fixed rule decided
 * (the manga's learned default, for a chapter without a choice).
 */
export function mobileReaderPairingShiftFor(
  entry: MobileReaderPairingShiftEntry | null | undefined,
  chapterId: string,
): { shift: boolean; fallbackShift: boolean } {
  const own = entry?.chapters?.[chapterId];
  if (typeof own === "boolean") return { shift: own, fallbackShift: false };
  return { shift: false, fallbackShift: entry?.learned === true };
}

/** Whether 错开一页 reads as on for this chapter (its own choice, else the learned default). */
export function mobileReaderPairingShifted(
  entry: MobileReaderPairingShiftEntry | null | undefined,
  chapterId: string,
): boolean {
  const { shift, fallbackShift } = mobileReaderPairingShiftFor(entry, chapterId);
  return shift || fallbackShift;
}

export function normalizeMobileReaderPairingShifts(value: unknown): MobileReaderPairingShifts {
  if (!value || typeof value !== "object") return {};
  const out: MobileReaderPairingShifts = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as { learned?: unknown; chapters?: unknown };
    const chapters: Record<string, boolean> = {};
    if (entry.chapters && typeof entry.chapters === "object") {
      for (const [chapterId, shifted] of Object.entries(entry.chapters as Record<string, unknown>)) {
        if (typeof shifted === "boolean") chapters[chapterId] = shifted;
      }
    }
    out[key] = entry.learned === true ? { chapters, learned: true } : { chapters };
  }
  return out;
}

function lastEntries<T>(record: Record<string, T>, limit: number): Record<string, T> {
  const entries = Object.entries(record);
  return entries.length <= limit ? record : Object.fromEntries(entries.slice(entries.length - limit));
}

/**
 * Flips this chapter's pairing. When a neighbouring chapter (`neighbourIds`:
 * the chapters before and after it) already holds the same choice, that
 * choice becomes the manga's learned default.
 */
export function toggleMobileReaderPairingShift(
  shifts: MobileReaderPairingShifts,
  key: string,
  chapterId: string,
  neighbourIds: ReadonlyArray<string | null | undefined> = [],
): MobileReaderPairingShifts {
  const entry = shifts[key];
  const shift = !mobileReaderPairingShifted(entry, chapterId);
  const { [chapterId]: _previous, ...otherChapters } = entry?.chapters ?? {};
  void _previous;
  const chapters = lastEntries({ ...otherChapters, [chapterId]: shift }, MOBILE_READER_PAIRING_SHIFT_CHAPTER_LIMIT);
  const repeated = neighbourIds.some((id) => id && id !== chapterId && chapters[id] === shift);
  const learned = repeated ? shift : entry?.learned === true;
  const { [key]: _old, ...others } = shifts;
  void _old;
  const next: MobileReaderPairingShiftEntry = learned ? { chapters, learned: true } : { chapters };
  return lastEntries({ ...others, [key]: next }, MOBILE_READER_PAIRING_SHIFT_MANGA_LIMIT);
}
