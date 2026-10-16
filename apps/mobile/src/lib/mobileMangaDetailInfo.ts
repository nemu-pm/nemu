/**
 * The manga detail page's description sheet: the synopsis as paragraphs, one
 * per non-empty line (sources separate paragraphs with one or two line
 * breaks), each trimmed.
 */
export function splitMobileDescriptionParagraphs(value: string): string[] {
  return value
    .replace(/\r\n?/g, "\n")
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

/** A line of the description that only states its licence ("Licence: CC BY 4.0, https://…"). */
const LICENCE_LINE = /^\s*(?:licen[cs]e|许可(?:证)?|ライセンス)\s*[:：]/i;

/**
 * The description as the page shows it once the 作品信息 sheet carries the
 * licence: without the line that only restates it (the description sheet
 * keeps the whole text).
 */
export function withoutMobileDescriptionLicence(value: string): string {
  const lines = value.replace(/\r\n?/g, "\n").split("\n");
  if (!lines.some((line) => LICENCE_LINE.test(line))) return value;
  return lines
    .filter((line) => !LICENCE_LINE.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type MobileDetailInfoIcon =
  | "hourglass-outline"
  | "document-text-outline"
  | "globe-outline"
  | "language-outline"
  | "person-outline"
  | "ribbon-outline"
  | "pricetags-outline"
  | "calendar-outline"
  | "book-outline";

/** One row of the 作品信息 sheet: a small label over its value (or the genres, as chips). */
export type MobileDetailInfoRow = {
  key: string;
  icon: MobileDetailInfoIcon;
  label: string;
  value?: string;
  chips?: string[];
};

type MobileDetailInfoStrings = {
  common: { listSeparator: string };
  designExplore: {
    factStatus: string;
    infoLatestChapter: string;
    infoSource: string;
    infoLanguage: string;
    infoAuthor: string;
    infoLicense: string;
    infoGenre: string;
    infoDateAdded: string;
    infoLastRead: string;
  };
};

/**
 * The 作品信息 sheet's rows, in a fixed order, each only when there is
 * something to say. A genre that only restates the licence (a source tagging
 * its titles "CC BY 4.0") is left to the licence row.
 */
export function buildMobileDetailInfoRows(
  info: {
    status?: string | null;
    latest?: string | null;
    source?: string | null;
    languages?: readonly string[] | null;
    authors?: readonly string[] | null;
    license?: string | null;
    tags?: readonly string[] | null;
    added?: string | null;
    lastRead?: string | null;
  },
  strings: MobileDetailInfoStrings,
): MobileDetailInfoRow[] {
  const s = strings.designExplore;
  const join = (values: readonly string[] | null | undefined) =>
    values?.map((value) => value.trim()).filter(Boolean).join(strings.common.listSeparator) || null;
  const languages = join(info.languages);
  const authors = join(info.authors);
  const licence = info.license?.trim() || null;
  const genres = (info.tags ?? [])
    .map((tag) => tag.trim())
    .filter((tag) => tag && (!licence || tag.toLowerCase() !== licence.toLowerCase()));
  const rows: (MobileDetailInfoRow | null)[] = [
    info.status ? { key: "status", icon: "hourglass-outline", label: s.factStatus, value: info.status } : null,
    info.latest ? { key: "latest", icon: "document-text-outline", label: s.infoLatestChapter, value: info.latest } : null,
    info.source ? { key: "source", icon: "globe-outline", label: s.infoSource, value: info.source } : null,
    languages ? { key: "language", icon: "language-outline", label: s.infoLanguage, value: languages } : null,
    authors ? { key: "author", icon: "person-outline", label: s.infoAuthor, value: authors } : null,
    licence ? { key: "license", icon: "ribbon-outline", label: s.infoLicense, value: licence } : null,
    genres.length ? { key: "genre", icon: "pricetags-outline", label: s.infoGenre, chips: [...new Set(genres)] } : null,
    info.added ? { key: "added", icon: "calendar-outline", label: s.infoDateAdded, value: info.added } : null,
    info.lastRead ? { key: "lastRead", icon: "book-outline", label: s.infoLastRead, value: info.lastRead } : null,
  ];
  return rows.filter((row): row is MobileDetailInfoRow => row !== null);
}

const DATE_LOCALES = { en: "en", zh: "zh-Hans", ja: "ja" } as const;

/** A day in the app's language ("Oct 16, 2026", "2026年10月16日"); ISO where there is no Intl. */
export function formatMobileDetailDate(
  timestamp: number | null | undefined,
  appLanguage: keyof typeof DATE_LOCALES,
): string | null {
  if (!timestamp || !Number.isFinite(timestamp) || timestamp <= 0) return null;
  const date = new Date(timestamp);
  try {
    return new Intl.DateTimeFormat(DATE_LOCALES[appLanguage], { dateStyle: "medium" }).format(date);
  } catch {
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }
}

type MobileDetailMetaStrings = {
  designExplore: {
    metaLatest: string;
    metaChapterCountOne: string;
    metaChapterCountOther: string;
  };
};

/**
 * The wide hero column's one meta line, longest first: the status, then how
 * far an ongoing series has got (or how long a finished one is), then the
 * first genre. Each shorter one gives something up: the genre first, then
 * the latest chapter's volume or title (its number alone), then the latest
 * chapter for the count; the status is never cut.
 */
export function buildMobileDetailMetaCandidates(
  {
    status,
    completed,
    latest,
    latestNumber,
    chapters,
    genre,
  }: {
    status?: string | null;
    completed?: boolean;
    latest?: string | null;
    latestNumber?: string | null;
    chapters?: number | null;
    genre?: string | null;
  },
  strings: MobileDetailMetaStrings,
): string[] {
  const s = strings.designExplore;
  const upTo = (chapter: string | null | undefined) => (chapter ? s.metaLatest.replace("{{chapter}}", chapter) : null);
  const count = chapters
    ? (chapters === 1 ? s.metaChapterCountOne : s.metaChapterCountOther).replace("{{count}}", String(chapters))
    : null;
  const facts = completed ? [count] : [upTo(latest), upTo(latestNumber), count];
  const lead = facts.find(Boolean) ?? null;
  const line = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(" · ");
  const candidates = [
    genre ? line(status, lead, genre) : null,
    ...facts.map((fact) => line(status, fact)),
    line(status),
  ];
  return [...new Set(candidates.filter((candidate): candidate is string => Boolean(candidate)))];
}

/**
 * The longest meta line that stays on one line, from each candidate's
 * measured line count at the line's width (undefined until measured). Until
 * the ones before it are measured, the line without the genre stands in, so
 * a genre never shows and then drops away.
 */
export function pickMobileDetailMetaLine(
  candidates: readonly string[],
  lineCounts: readonly (number | undefined)[],
  { hasGenre }: { hasGenre: boolean },
): string | null {
  if (!candidates.length) return null;
  for (let index = 0; index < candidates.length; index += 1) {
    const lines = lineCounts[index];
    if (lines === undefined) return candidates[Math.min(hasGenre ? 1 : 0, candidates.length - 1)] ?? null;
    if (lines <= 1) return candidates[index] ?? null;
  }
  return candidates[candidates.length - 1] ?? null;
}
