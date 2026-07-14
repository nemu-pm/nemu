import type { Href } from "expo-router";
import type { ChapterSummary } from "@/data/schema";

const MOBILE_READER_ROUTE_LABEL_MAX_LENGTH = 256;
const MOBILE_READER_ROUTE_NUMBER_MAX_ABS = 1_000_000_000;

type MobileSourceRouteRef = {
  registryId: string;
  sourceId: string;
};

type MobileSourceMangaRouteRef = MobileSourceRouteRef & {
  mangaId: string;
};

type MobileSourceReaderRouteRef = MobileSourceMangaRouteRef & {
  chapter: ChapterSummary;
  mangaTitle: string | null;
  page?: string | number | null;
};

export type MobileSourceMangaBackAction =
  | { type: "back" }
  | { type: "replace"; href: Href };

function firstRouteParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function decodeRouteParam(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function toWellFormedRouteValue(value: string): string {
  return Array.from(value)
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint >= 0xd800 && codePoint <= 0xdfff ? "�" : character;
    })
    .join("");
}

function encodeRouteSegment(value: string): string {
  return encodeURIComponent(toWellFormedRouteValue(value));
}

export function normalizeMobileReaderRouteLabel(
  value: string | string[] | null | undefined,
  opaqueId?: string | null,
): string {
  const raw = firstRouteParam(value ?? undefined).trim();
  if (!raw || raw === opaqueId?.trim()) return "";
  return toWellFormedRouteValue(
    Array.from(raw).slice(0, MOBILE_READER_ROUTE_LABEL_MAX_LENGTH).join(""),
  );
}

export function parseMobileReaderRouteNumber(
  value: string | string[] | undefined,
): number | undefined {
  const raw = firstRouteParam(value).trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(raw)) {
    return undefined;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) &&
    Math.abs(parsed) <= MOBILE_READER_ROUTE_NUMBER_MAX_ABS
    ? parsed
    : undefined;
}

function addUniqueRouteParamCandidate(
  candidates: string[],
  candidate: string | null | undefined,
) {
  const trimmed = candidate?.trim();
  if (!trimmed || candidates.includes(trimmed)) return;
  candidates.push(trimmed);
}

export function normalizeMobileSourceRouteParam(
  value: string | string[] | undefined,
): string {
  const raw = firstRouteParam(value).trim();
  const decoded = decodeRouteParam(raw);
  return decoded?.trim() || raw;
}

export function getMobileSourceRouteParamCandidates(
  value: string | string[] | undefined,
): string[] {
  const raw = firstRouteParam(value);
  const candidates: string[] = [];
  addUniqueRouteParamCandidate(candidates, raw);
  addUniqueRouteParamCandidate(candidates, decodeRouteParam(raw));
  return candidates;
}

export function getMobileSourceBrowseHref({
  registryId,
  sourceId,
}: MobileSourceRouteRef): Href {
  return `/browse/${encodeRouteSegment(registryId)}/${encodeRouteSegment(sourceId)}` as Href;
}

export function getMobileSourceMangaHref({
  registryId,
  sourceId,
  mangaId,
}: MobileSourceMangaRouteRef): Href {
  return `/sources/${encodeRouteSegment(registryId)}/${encodeRouteSegment(sourceId)}/${encodeRouteSegment(mangaId)}` as Href;
}

export function getMobileSourceMangaBackAction({
  canGoBack,
  registryId,
  sourceId,
}: MobileSourceRouteRef & { canGoBack: boolean }): MobileSourceMangaBackAction {
  if (canGoBack) return { type: "back" };
  return {
    type: "replace",
    href: getMobileSourceBrowseHref({ registryId, sourceId }),
  };
}

export function getMobileSourceReaderBackAction({
  canGoBack,
  registryId,
  sourceId,
  mangaId,
}: MobileSourceMangaRouteRef & {
  canGoBack: boolean;
}): MobileSourceMangaBackAction {
  if (canGoBack) return { type: "back" };
  return {
    type: "replace",
    href: getMobileSourceMangaHref({ registryId, sourceId, mangaId }),
  };
}

export function getMobileSourceReaderHref({
  registryId,
  sourceId,
  mangaId,
  chapter,
  page,
  mangaTitle,
}: MobileSourceReaderRouteRef): Href {
  const path = `${getMobileSourceMangaHref({
    registryId,
    sourceId,
    mangaId,
  })}/${encodeRouteSegment(chapter.id)}`;
  const query: string[] = [];
  if (page !== null && page !== undefined && page !== "") {
    query.push(`page=${encodeURIComponent(String(page))}`);
  }
  const resolvedMangaTitle = normalizeMobileReaderRouteLabel(
    mangaTitle,
    mangaId,
  );
  if (resolvedMangaTitle) {
    query.push(`mangaTitle=${encodeURIComponent(resolvedMangaTitle)}`);
  }
  const resolvedChapterTitle = normalizeMobileReaderRouteLabel(
    chapter.title,
    chapter.id,
  );
  if (resolvedChapterTitle) {
    query.push(`chapterTitle=${encodeURIComponent(resolvedChapterTitle)}`);
  }
  if (
    Number.isFinite(chapter.chapterNumber) &&
    Math.abs(chapter.chapterNumber ?? 0) <= MOBILE_READER_ROUTE_NUMBER_MAX_ABS
  ) {
    query.push(`chapterNumber=${encodeURIComponent(String(chapter.chapterNumber))}`);
  }
  if (
    Number.isFinite(chapter.volumeNumber) &&
    Math.abs(chapter.volumeNumber ?? 0) <= MOBILE_READER_ROUTE_NUMBER_MAX_ABS
  ) {
    query.push(`volumeNumber=${encodeURIComponent(String(chapter.volumeNumber))}`);
  }
  return (query.length > 0 ? `${path}?${query.join("&")}` : path) as Href;
}
