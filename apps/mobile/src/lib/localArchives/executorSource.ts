import type { AppLanguage, InstalledSource } from "@/data/schema";
import type { MobileAidokuExecutorSource, MobileSourcePage } from "@/sources/mobileSourceExecutor";
import type { ArchiveFs } from "./importArchive";
import {
  LOCAL_ARCHIVE_MISSING_FILE_LABELS,
  liveVolumes,
  volumeAvailability,
  type LocalArchiveVolume,
} from "./library";
import { LOCAL_ARCHIVE_REGISTRY_ID, LOCAL_ARCHIVE_SOURCE_ID } from "./policy";
import { localArchiveRelativeUri, resolveLocalArchiveUri } from "./uris";

export const LOCAL_ARCHIVE_INSTALLED_SOURCE: InstalledSource = {
  id: `${LOCAL_ARCHIVE_REGISTRY_ID}:${LOCAL_ARCHIVE_SOURCE_ID}`,
  registryId: LOCAL_ARCHIVE_REGISTRY_ID,
  sourceKind: "aidoku",
  sourceId: LOCAL_ARCHIVE_SOURCE_ID,
  name: "Local archive",
  version: 1,
  removed: false,
};

/** Display name only; identity is the id/registry/source ids, never this string. */
export const LOCAL_ARCHIVE_SOURCE_NAMES: Record<AppLanguage, string> = {
  en: "Local comics",
  zh: "本地漫画",
  ja: "ローカル漫画",
};

export function localArchiveInstalledSource(language: AppLanguage): InstalledSource {
  return { ...LOCAL_ARCHIVE_INSTALLED_SOURCE, name: LOCAL_ARCHIVE_SOURCE_NAMES[language] };
}

export class LocalArchiveMissingFileError extends Error {
  constructor(label: string) {
    super(label);
    this.name = "LocalArchiveMissingFileError";
  }
}

type Deps = {
  fs: Pick<ArchiveFs, "readIndex" | "listPageNames" | "rootUri">;
  language: () => AppLanguage;
};

/**
 * The `local-archive` source as the reader and detail screens see every
 * source: details, chapters (one per volume) and pages. Pages carry a
 * `localUri` resolved against the current documents directory, so nothing
 * persisted ever holds a container path. Everything else a source can do
 * (search, filters, home, login) does not apply.
 */
export function createLocalArchiveExecutorSource(deps: Deps): MobileAidokuExecutorSource {
  const volumesOf = async (workId: string): Promise<LocalArchiveVolume[]> => {
    const index = await deps.fs.readIndex();
    return liveVolumes(index.volumes)
      .filter((volume) => volume.workId === workId)
      .sort((a, b) => b.importedAt - a.importedAt || a.title.localeCompare(b.title));
  };

  const source = {
    id: LOCAL_ARCHIVE_SOURCE_ID,
    async getMangaDetails(manga: { key: string }) {
      const volumes = await volumesOf(manga.key);
      const first = [...volumes].sort((a, b) => a.importedAt - b.importedAt)[0];
      const cover = first
        ? (() => {
            const name = deps.fs.listPageNames(first.volumeId)[0];
            return name ? localArchiveRelativeUri(first.volumeId, name) : undefined;
          })()
        : undefined;
      return { key: manga.key, title: first?.title ?? manga.key, ...(cover ? { cover } : {}) };
    },
    async getChapterList(manga: { key: string }) {
      const index = await deps.fs.readIndex();
      const label = LOCAL_ARCHIVE_MISSING_FILE_LABELS[deps.language()];
      return (await volumesOf(manga.key)).map((volume) => ({
        key: volume.volumeId,
        title: volume.title,
        // A volume known from sync but not imported here says so on its row.
        ...(volumeAvailability(volume.volumeId, index.files) === "missing-file" ? { scanlator: label } : {}),
      }));
    },
    async getPageList(_manga: { key: string }, chapter: { key: string }): Promise<MobileSourcePage[]> {
      const index = await deps.fs.readIndex();
      if (volumeAvailability(chapter.key, index.files) === "missing-file") {
        throw new LocalArchiveMissingFileError(LOCAL_ARCHIVE_MISSING_FILE_LABELS[deps.language()]);
      }
      const root = deps.fs.rootUri();
      return deps.fs.listPageNames(chapter.key).flatMap((name, position) => {
        const uri = resolveLocalArchiveUri(localArchiveRelativeUri(chapter.key, name), root);
        return uri ? [{ index: position, localUri: uri, id: `${chapter.key}:${position + 1}` }] : [];
      });
    },
    async getSearchMangaList() {
      return { entries: [], hasNextPage: false };
    },
    async getFilters() {
      return [];
    },
    async getListings() {
      return [];
    },
    async getMangaListForListing() {
      return { entries: [], hasNextPage: false };
    },
    async hasListingProvider() {
      return false;
    },
    async hasHomeProvider() {
      return false;
    },
    async hasListings() {
      return false;
    },
    async isOnlySearch() {
      return false;
    },
    async handlesBasicLogin() {
      return false;
    },
    async handlesWebLogin() {
      return false;
    },
    async getHome() {
      return { components: [] };
    },
    async getHomeWithPartials() {
      return { components: [] };
    },
    async modifyImageRequest(url: string) {
      return { url, headers: {} };
    },
    async hasImageProcessor() {
      return false;
    },
    async processPageImage() {
      return null;
    },
    updateSettings() {},
    dispose() {},
  };
  return source as unknown as MobileAidokuExecutorSource;
}
