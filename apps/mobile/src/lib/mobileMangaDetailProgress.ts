import type {
  InstalledSource,
  LocalChapterProgress,
  LocalMangaProgress,
  LocalSourceLink,
} from "@/data/schema";
import { makeMangaProgressId } from "@/data/schema";
import { parseSourceKey } from "@/sources/aidokuRegistry";
import {
  getMobileSourceLinkRegistryKeys,
  mobileInstalledSourceMatchesLink,
} from "./mobileInstalledSourceKeys";

export type MobileChapterProgressLoader = {
  getMangaChapterProgress(
    registryId: string,
    sourceId: string,
    mangaId: string,
  ): Promise<Record<string, LocalChapterProgress>>;
};

function installedSourceForLink(
  source: LocalSourceLink,
  installedSources: InstalledSource[],
): InstalledSource | null {
  return (
    installedSources.find((installed) =>
      mobileInstalledSourceMatchesLink(installed, source),
    ) ?? null
  );
}

function sourceProgressRefs(
  source: LocalSourceLink,
  installedSources: InstalledSource[],
): Array<{ registryId: string; sourceId: string }> {
  return getMobileSourceLinkRegistryKeys(
    source,
    installedSourceForLink(source, installedSources),
  )
    .map(parseSourceKey)
    .filter((ref) => ref.registryId !== "unknown");
}

export function findMobileMangaProgressForSource(
  source: LocalSourceLink,
  installedSources: InstalledSource[],
  progressIndex: Map<string, LocalMangaProgress>,
): LocalMangaProgress | undefined {
  for (const ref of sourceProgressRefs(source, installedSources)) {
    const progress = progressIndex.get(
      makeMangaProgressId(ref.registryId, ref.sourceId, source.sourceMangaId),
    );
    if (progress) return progress;
  }
  return undefined;
}

export async function loadMobileChapterProgressForSource(
  loader: MobileChapterProgressLoader,
  source: LocalSourceLink,
  installedSources: InstalledSource[],
): Promise<Record<string, LocalChapterProgress>> {
  const merged: Record<string, LocalChapterProgress> = {};
  for (const ref of sourceProgressRefs(source, installedSources)) {
    const progress = await loader.getMangaChapterProgress(
      ref.registryId,
      ref.sourceId,
      source.sourceMangaId,
    );
    for (const [chapterId, item] of Object.entries(progress)) {
      merged[chapterId] ??= item;
    }
  }
  return merged;
}

export async function loadMobileChapterProgressForSourceChapter(
  loader: MobileChapterProgressLoader,
  source: LocalSourceLink,
  installedSources: InstalledSource[],
  chapterId: string,
): Promise<LocalChapterProgress | null> {
  const progress = await loadMobileChapterProgressForSource(
    loader,
    source,
    installedSources,
  );
  return progress[chapterId] ?? null;
}
