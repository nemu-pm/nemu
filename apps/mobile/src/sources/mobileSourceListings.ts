import type { InstalledSource, SourcePackageListing } from "@/data/schema";
import { toSearchSourceDisplay, type SearchSourceDisplay } from "@/lib/mobileSearch";
import { getMobileSourceListingLabel } from "@/lib/mobileSourceListingsPresentation";
import {
  type MobileSourceExecutorOptions,
  type MobileSourceExecutorRuntime,
} from "./mobileSourceExecutor";
import {
  defaultMobileSourceSessionCache,
  type MobileSourceSessionCache,
} from "./mobileSourceExecutorCache";
import {
  mapAidokuMangasToLiveSearchMangaWithImageRequests,
  type MobileLiveSearchManga,
} from "./mobileSourceSearch";
import {
  defaultMobileSourceSettings, makeMobileRuntimeSourceKey, normalizeInstalledSource,
} from "./mobileSourceRuntime";

export type MobileSourceListingResult =
  | {
      status: "ready";
      source: SearchSourceDisplay;
      runtime: MobileSourceExecutorRuntime;
      listing: SourcePackageListing;
      items: MobileLiveSearchManga[];
      hasMore: boolean;
      page: number;
    }
  | {
      status: "blocked";
      source: SearchSourceDisplay;
      listing: SourcePackageListing;
      reason: string;
      detail: string;
    };

export type MobileSourceListingOptions = {
  page?: number;
  getSourceSettings?: (sourceKey: string, source: InstalledSource) => Promise<Record<string, unknown>>;
  executor?: Pick<MobileSourceExecutorOptions, "bridge" | "readBytes">;
  sessionCache?: MobileSourceSessionCache;
};

export async function fetchMobileSourceListing(
  source: InstalledSource,
  listing: SourcePackageListing,
  options: MobileSourceListingOptions = {}
): Promise<MobileSourceListingResult> {
  const display = toSearchSourceDisplay(source);
  const normalized = normalizeInstalledSource(source);
  const sourceKey = makeMobileRuntimeSourceKey(normalized);
  const settings = await (options.getSourceSettings ?? defaultMobileSourceSettings)(sourceKey, source);
  const cache = options.sessionCache ?? defaultMobileSourceSessionCache;

  return cache.withSession(
    normalized,
    { ...options.executor, settings },
    async (session): Promise<MobileSourceListingResult> => {
      if (session.status === "blocked") {
        return {
          status: "blocked",
          source: display,
          listing,
          reason: session.reason,
          detail: session.detail,
        };
      }

      const page = options.page ?? 1;
      // Aidoku manifests in the wild may omit or blank a listing's display
      // name (MANGA Plus v4 does this for Updates/Ranking). The UI already
      // falls back to the stable listing ID; apply the same normalization at
      // the executor boundary so the isolated runtime receives a complete
      // Aidoku Listing without weakening its strict data validation.
      const runtimeListing = {
        ...listing,
        name: getMobileSourceListingLabel(listing),
      };
      const result = await session.source.getMangaListForListing(
        runtimeListing,
        page,
      );
      return {
        status: "ready",
        source: display,
        runtime: session.runtime,
        listing,
        items: await mapAidokuMangasToLiveSearchMangaWithImageRequests(
          session.source,
          result.entries,
        ),
        hasMore: result.hasNextPage,
        page,
      };
    }
  );
}
