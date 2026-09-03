import type { AppLanguage, ChapterSummary, LocalChapterProgress } from "@/data/schema";
import {
  compareMobileLanguageCodes,
  DEFAULT_APP_LANGUAGE,
} from "./mobileLanguageSettings";

export type MobileChapterListPreference = {
  sortDirection: "asc" | "desc";
  unreadOnly: boolean;
  languages: string[];
};

export const DEFAULT_MOBILE_CHAPTER_LIST_PREFERENCE: MobileChapterListPreference = {
  sortDirection: "desc",
  unreadOnly: false,
  languages: [],
};

export function normalizeMobileChapterListPreference(
  value: unknown,
): MobileChapterListPreference {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_MOBILE_CHAPTER_LIST_PREFERENCE;
  }
  const candidate = value as Partial<MobileChapterListPreference>;
  return {
    sortDirection: candidate.sortDirection === "asc" ? "asc" : "desc",
    unreadOnly: candidate.unreadOnly === true,
    languages: Array.isArray(candidate.languages)
      ? [...new Set(candidate.languages.filter((item): item is string => typeof item === "string" && item.length > 0))]
      : [],
  };
}

/**
 * Shares the browse filter's ordering so a chapter language list and a source
 * language list never disagree about where `zh-Hant` belongs.
 */
export function getMobileChapterLanguages(
  chapters: ChapterSummary[],
  appLanguage: AppLanguage = DEFAULT_APP_LANGUAGE,
): string[] {
  return [...new Set(chapters.map((chapter) => chapter.lang).filter((lang): lang is string => Boolean(lang)))]
    .sort((left, right) => compareMobileLanguageCodes(left, right, appLanguage));
}

export function filterAndSortMobileChapters(
  chapters: ChapterSummary[],
  progressByChapterId: Record<string, LocalChapterProgress | undefined>,
  preference: MobileChapterListPreference,
): ChapterSummary[] {
  const selectedLanguages = new Set(preference.languages);
  return chapters
    .filter((chapter) => {
      if (preference.unreadOnly && progressByChapterId[chapter.id]?.completed) {
        return false;
      }
      return selectedLanguages.size === 0 || Boolean(chapter.lang && selectedLanguages.has(chapter.lang));
    })
    .sort((left, right) => {
      const leftNumber = left.chapterNumber ?? Number.NEGATIVE_INFINITY;
      const rightNumber = right.chapterNumber ?? Number.NEGATIVE_INFINITY;
      const result = leftNumber === rightNumber
        ? left.id.localeCompare(right.id)
        : leftNumber - rightNumber;
      return preference.sortDirection === "asc" ? result : -result;
    });
}
