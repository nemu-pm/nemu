import type { AppLanguage, ChapterSummary, LocalChapterProgress } from "@/data/schema";
import {
  compareMobileLanguageCodes,
  getLanguagePriorityOrder,
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
  const priorityOrder = getLanguagePriorityOrder(appLanguage);
  return [...new Set(chapters.map((chapter) => chapter.lang).filter((lang): lang is string => Boolean(lang)))]
    .sort((left, right) =>
      compareMobileLanguageCodes(left, right, appLanguage, priorityOrder),
    );
}

/**
 * The chapter list as shown: `chapters` arrive newest first in the source's
 * order (`orderMobileChaptersNewestFirst`), so "desc" keeps that order and
 * "asc" reverses it — the web detail page's and Aidoku's "source order".
 * Chapter numbers never reorder it: many sources omit them, and falling back
 * to an id comparison sorted numeric ids lexicographically.
 */
export function filterAndSortMobileChapters(
  chapters: ChapterSummary[],
  progressByChapterId: Record<string, LocalChapterProgress | undefined>,
  preference: MobileChapterListPreference,
): ChapterSummary[] {
  const selectedLanguages = new Set(preference.languages);
  const visible = chapters.filter((chapter) => {
    if (preference.unreadOnly && progressByChapterId[chapter.id]?.completed) {
      return false;
    }
    return selectedLanguages.size === 0 || Boolean(chapter.lang && selectedLanguages.has(chapter.lang));
  });
  return preference.sortDirection === "asc" ? visible.reverse() : visible;
}
