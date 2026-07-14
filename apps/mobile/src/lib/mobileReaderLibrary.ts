import type {
  InstalledSource,
  LibraryEntry,
  LocalSourceLink,
} from "@/data/schema";
import { mobileInstalledSourceMatchesLink } from "./mobileInstalledSourceKeys";

export type MobileReaderLibrarySource = {
  entry: LibraryEntry | null;
  sourceLink: LocalSourceLink | null;
};

function sourceLinkMatchesReaderRoute(
  link: LocalSourceLink,
  installedSource: InstalledSource | null | undefined,
  registryId: string,
  sourceId: string,
  mangaId: string,
): boolean {
  if (link.sourceMangaId !== mangaId) return false;
  if (installedSource) return mobileInstalledSourceMatchesLink(installedSource, link);
  return link.registryId === registryId && link.sourceId === sourceId;
}

export function findMobileReaderLibrarySource(
  entries: LibraryEntry[],
  installedSource: InstalledSource | null | undefined,
  registryId: string,
  sourceId: string,
  mangaId: string,
): MobileReaderLibrarySource {
  for (const entry of entries) {
    const sourceLink =
      entry.sources.find((link) =>
        sourceLinkMatchesReaderRoute(
          link,
          installedSource,
          registryId,
          sourceId,
          mangaId,
        ),
      ) ?? null;
    if (sourceLink) return { entry, sourceLink };
  }

  return { entry: null, sourceLink: null };
}
