import type { AppLanguage, InstalledSource } from "@/data/schema";
import type { MobileAidokuExecutorSource, MobileSourcePage } from "@/sources/mobileSourceExecutor";
import { makeMobileSourceExecutionKey } from "@/sources/mobileSourceProfileScope";
import type { Chapter, FilterValue, Listing, Manga } from "@/sources/aidokuContract";
import { createSelfHostedBackend } from "./backends";
import type { SelfHostedBackend } from "./backend";
import { createNativeTransport, type SelfHostedTransport } from "./http";
import { registerSelfHostedImageUrl } from "./imageScopes";
import { getSelfHostedLanguage } from "./language";
import { selfHostedErrorMessage } from "./messages";
import { SelfHostedError, isSelfHostedError } from "./http";
import { getMobileStrings } from "@/lib/mobileI18n";
import {
  SELF_HOSTED_REGISTRY_ID,
  isSelfHostedConfig,
  readSelfHostedCredentials,
  type SelfHostedConfig,
} from "./policy";

export type SelfHostedExecutorInput = {
  /** The installed row; its `selfHosted` field names the server. */
  source: Pick<InstalledSource, "registryId" | "sourceId" | "selfHosted" | "hasAuthentication"> & { sourceId: string };
  /** Saved per-source settings, where the login lives (Keychain / Keystore vault). */
  settings: Record<string, unknown>;
  executionScope?: string;
  /** Test seam; the app uses native HTTP scoped to this source. */
  transport?: SelfHostedTransport;
  language?: () => AppLanguage;
};

/** Cookie scope native keys this source's cookie jar and local-network grant by. */
export function selfHostedCookieScope(sourceId: string, executionScope?: string): string {
  return makeMobileSourceExecutionKey(`${SELF_HOSTED_REGISTRY_ID}:${sourceId}`, executionScope);
}

/**
 * A built-in server source as the library, browse, reader and updates screens
 * see every source. There is no package and no sandbox: this is app code, so
 * the only network it performs is to the address the user saved for this
 * server, through native HTTP with that source's scoped local-network grant.
 */
export function createSelfHostedExecutorSource(input: SelfHostedExecutorInput): MobileAidokuExecutorSource {
  const config: SelfHostedConfig | undefined = isSelfHostedConfig(input.source.selfHosted)
    ? input.source.selfHosted
    : undefined;
  const cookieScope = selfHostedCookieScope(input.source.sourceId, input.executionScope);
  const transport = input.transport ?? createNativeTransport(cookieScope);
  const language = input.language ?? getSelfHostedLanguage;
  let settings = input.settings;
  let backend: SelfHostedBackend | null = null;

  const current = (): SelfHostedBackend => {
    if (!config) throw new Error("This server source has no address.");
    const credentials = readSelfHostedCredentials(settings);
    if (!backend) {
      // A server synced from another device arrives without its login (the
      // login never leaves the device it was typed on).
      if (input.source.hasAuthentication && Object.keys(credentials).length === 0) {
        throw new SelfHostedError("unauthorized", getMobileStrings(language()).selfHosted.needsSignIn);
      }
      backend = createSelfHostedBackend({ config, credentials, transport, language: language() });
    }
    return backend;
  };

  /** Failures reach the screens as plain exceptions; give them the app language. */
  const localized = async <T>(run: (backend: SelfHostedBackend) => Promise<T>): Promise<T> => {
    try {
      return await run(current());
    } catch (error) {
      if (!isSelfHostedError(error) || !config) throw error;
      const message =
        error.message === getMobileStrings(language()).selfHosted.needsSignIn
          ? error.message
          : selfHostedErrorMessage(error, getMobileStrings(language()), config.kind);
      throw new SelfHostedError(error.code, message, error.status);
    }
  };

  const source = {
    id: input.source.sourceId,

    getSearchMangaList: (query: string | null, page: number, filters: FilterValue[]) =>
      localized((backend) => backend.search(query, page, filters)),
    getMangaDetails: (manga: Manga) => localized((backend) => backend.getMangaDetails(manga)),
    getChapterList: (manga: Manga) => localized((backend) => backend.getChapterList(manga)),
    async getPageList(manga: Manga, chapter: Chapter): Promise<MobileSourcePage[]> {
      const refs = await localized((backend) => backend.getPageList(manga, chapter));
      return refs.map((ref) => ({
        index: ref.index,
        url: ref.url,
        id: `${chapter.key}:${ref.index + 1}`,
        ...(ref.width && ref.height ? { width: ref.width, height: ref.height } : {}),
      }));
    },
    getFilters: async () => current().getFilters(),
    getListings: (): Promise<Listing[]> => localized((backend) => backend.getListings()),
    getMangaListForListing: (listing: Listing, page: number) =>
      localized((backend) => backend.getMangaListForListing(listing, page)),
    hasListingProvider: async () => true,
    hasHomeProvider: async () => false,
    hasListings: async () => true,
    isOnlySearch: async () => false,
    handlesBasicLogin: async () => false,
    handlesWebLogin: async () => false,
    getHome: async () => ({ components: [] }),
    getHomeWithPartials: async () => ({ components: [] }),
    async modifyImageRequest(url: string) {
      const backendNow = current();
      // Only this server's own URLs are decorated with its login or granted
      // its network access; any other URL passes through untouched.
      if (!backendNow.isServerUrl(url)) return { url, headers: {} };
      const request = await localized((backend) => backend.imageRequest(url));
      registerSelfHostedImageUrl(request.url, cookieScope);
      return request;
    },
    hasImageProcessor: async () => false,
    processPageImage: async () => null,
    hasCoverImageProcessor: async () => false,
    updateSettings(next: Record<string, unknown>) {
      settings = next;
      backend?.dispose();
      backend = null;
    },
    dispose() {
      backend?.dispose();
      backend = null;
    },
  };
  return source as unknown as MobileAidokuExecutorSource;
}
