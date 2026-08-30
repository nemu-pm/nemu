import type { ChapterSummary, InstalledSource, LocalSourceLink } from "@/data/schema";
import { pickSecondaryChapterId } from "@nemu/core/dual-reader";
import { formatChapterTitle } from "./formatChapter";
import type { MobileStrings } from "./mobileI18n";
import { mobileInstalledSourceMatchesLink } from "./mobileInstalledSourceKeys";

export type MobileDualReadTarget = {
  source: LocalSourceLink;
  selected: boolean;
  status: "current" | "ready" | "loading" | "blocked";
  chapter: ChapterSummary | null;
  label: string;
  detail: string;
  icon?: string;
  language?: string;
};

export type MobileDualReadSourcePresentation = {
  name?: string;
  icon?: string;
  language?: string;
};

export type MobileDualReadRouteParams = {
  registryId: string;
  sourceId: string;
  mangaId: string;
  chapterId: string;
  page?: string;
};

export type MobileDualReadChapterResolution =
  | {
      status: "loading";
      detail?: string;
    }
  | {
      status: "ready";
      chapter: ChapterSummary | null;
      detail?: string;
    }
  | {
      status: "blocked";
      detail: string;
    };

function sourceDisplayName(source: LocalSourceLink): string {
  return source.sourceId || source.registryId;
}

function isSameMobileRuntimeSource(
  a: LocalSourceLink,
  b: LocalSourceLink,
  installedSources: InstalledSource[] = [],
): boolean {
  if (
    installedSources.some(
      (installed) =>
        mobileInstalledSourceMatchesLink(installed, a) &&
        mobileInstalledSourceMatchesLink(installed, b),
    )
  ) {
    return true;
  }
  return a.registryId === b.registryId && a.sourceId === b.sourceId;
}

export function getMobileDualReadCandidateSources(
  sources: LocalSourceLink[],
  selectedSource: LocalSourceLink | null | undefined,
  installedSources: InstalledSource[] = [],
): LocalSourceLink[] {
  if (!selectedSource) return sources;
  return sources.filter(
    (source) =>
      source.id !== selectedSource.id &&
      !isSameMobileRuntimeSource(source, selectedSource, installedSources),
  );
}

/** Resolve a linked source's display presentation (name/icon/language) from its InstalledSource. */
export function getMobileDualReadSourcePresentation(
  link: LocalSourceLink,
  installedSources: InstalledSource[] = [],
): MobileDualReadSourcePresentation {
  const installed = installedSources.find((item) =>
    mobileInstalledSourceMatchesLink(item, link),
  );
  const language = installed?.languages && installed.languages.length > 0
    ? installed.languages[0]
    : undefined;
  return { name: installed?.name, icon: installed?.icon, language };
}

/**
 * Pick a default secondary source for the config sheet, mirroring web's
 * `pickDefaultSecondary`: prefer a candidate whose language differs from the
 * primary's; otherwise the first candidate. Returns null if there are none.
 */
export function pickDefaultMobileDualReadSecondary(
  primary: LocalSourceLink | null,
  candidates: LocalSourceLink[],
  installedSources: InstalledSource[] = [],
): LocalSourceLink | null {
  if (!primary || candidates.length === 0) return null;
  const primaryLangs = new Set(
    getMobileDualReadSourcePresentation(primary, installedSources).language
      ? [getMobileDualReadSourcePresentation(primary, installedSources).language!]
      : [],
  );
  if (primaryLangs.size > 0) {
    const diffLang = candidates.find((c) => {
      const lang = getMobileDualReadSourcePresentation(c, installedSources).language;
      return lang != null && !primaryLangs.has(lang);
    });
    if (diffLang) return diffLang;
  }
  return candidates[0] ?? null;
}

export function getMobileDualReadDisplaySources(
  sources: LocalSourceLink[],
  selectedSource: LocalSourceLink | null | undefined,
  installedSources: InstalledSource[] = [],
): LocalSourceLink[] {
  if (!selectedSource) return sources;
  const selected =
    sources.find((source) => source.id === selectedSource.id) ?? selectedSource;
  return [
    selected,
    ...getMobileDualReadCandidateSources(
      sources,
      selectedSource,
      installedSources,
    ),
  ];
}

function routePageParam(page: number | null | undefined): string | undefined {
  if (page == null || !Number.isFinite(page) || page < 1) return undefined;
  return String(Math.trunc(page));
}

/**
 * Pick the secondary chapter to pair with the current primary chapter.
 *
 * Delegates to the shared `@nemu/core` matcher (`pickSecondaryChapterId`) so
 * mobile and web use the *same* chapter-resolution logic (number match →
 * title/index scoring → latest-chapter fallback) instead of a duplicated
 * implementation. The core matcher is also seed-pair aware, which the overlay
 * (T3) will use once the dual-reader session is driven by `mobileDualReaderStore`
 * instead of navigation. Returns the resolved `ChapterSummary` (or null) so the
 * existing source-list/config-picker call site keeps its signature.
 */
export function pickMobileDualReadChapter({
  primaryChapter,
  primaryChapters,
  secondaryChapters,
}: {
  primaryChapter: ChapterSummary | null | undefined;
  primaryChapters: ChapterSummary[];
  secondaryChapters: ChapterSummary[];
}): ChapterSummary | null {
  if (secondaryChapters.length === 0) return null;
  const matchedId = pickSecondaryChapterId({
    primaryChapter,
    primaryAll: primaryChapters,
    secondaryAll: secondaryChapters,
  });
  if (!matchedId) return null;
  return secondaryChapters.find((chapter) => chapter.id === matchedId) ?? null;
}

export function buildMobileDualReadTargets(
  sources: LocalSourceLink[],
  selectedSource: LocalSourceLink | null | undefined,
  currentChapter: ChapterSummary,
  strings: MobileStrings,
  chapterResolutions: Map<string, MobileDualReadChapterResolution> = new Map(),
  sourcePresentations: Map<string, MobileDualReadSourcePresentation> = new Map(),
  installedSources: InstalledSource[] = [],
): MobileDualReadTarget[] {
  return getMobileDualReadDisplaySources(
    sources,
    selectedSource,
    installedSources,
  ).map((source) => {
    const selected = selectedSource?.id === source.id;
    const resolution = selected ? null : chapterResolutions.get(source.id);
    const presentation = sourcePresentations.get(source.id);
    const chapter = selected
      ? currentChapter
      : resolution?.status === "ready"
        ? resolution.chapter
        : resolution
          ? null
          : source.latestChapter ?? null;
    const chapterTitle = chapter
      ? formatChapterTitle(chapter, strings)
      : strings.reader.noChapter;
    return {
      source,
      selected,
      status: selected
        ? "current"
        : resolution?.status ?? (chapter ? "ready" : "blocked"),
      chapter,
      label: presentation?.name ?? sourceDisplayName(source),
      detail: selected
        ? `${strings.reader.currentChapter} / ${chapterTitle}`
        : resolution?.detail ?? chapterTitle,
      icon: presentation?.icon,
      language: presentation?.language,
    };
  });
}

export function buildMobileDualReadRouteParams(
  target: MobileDualReadTarget,
  sourcePageNumber: number | null | undefined,
): MobileDualReadRouteParams | null {
  if (!target.chapter) return null;
  const page = routePageParam(sourcePageNumber);
  return {
    registryId: target.source.registryId,
    sourceId: target.source.sourceId,
    mangaId: target.source.sourceMangaId,
    chapterId: target.chapter.id,
    ...(page ? { page } : {}),
  };
}
