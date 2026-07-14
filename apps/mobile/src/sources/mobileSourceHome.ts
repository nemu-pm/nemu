import type { InstalledSource } from "@/data/schema";
import { toSearchSourceDisplay, type SearchSourceDisplay } from "@/lib/mobileSearch";
import type { HomeLink } from "@nemu.pm/aidoku-runtime";
import {
  type AidokuManga,
  type HomeLayout,
  type MobileAidokuExecutorSource,
  type MobileSourceExecutorOptions,
  type MobileSourceExecutorRuntime,
} from "./mobileSourceExecutor";
import {
  defaultMobileSourceSessionCache,
  type MobileSourceSessionCache,
} from "./mobileSourceExecutorCache";
import {
  defaultMobileSourceSettings, makeMobileRuntimeSourceKey, normalizeInstalledSource,
} from "./mobileSourceRuntime";

export type MobileSourceHomeResult =
  | {
      status: "ready";
      source: SearchSourceDisplay;
      runtime: MobileSourceExecutorRuntime;
      hasHomeProvider: boolean;
      onlySearch: boolean;
      home: HomeLayout | null;
    }
  | {
      status: "blocked";
      source: SearchSourceDisplay;
      reason: string;
      detail: string;
    };

export type MobileSourceHomeOptions = {
  getSourceSettings?: (sourceKey: string, source: InstalledSource) => Promise<Record<string, unknown>>;
  onPartial?: (home: HomeLayout) => void;
  executor?: Pick<MobileSourceExecutorOptions, "bridge" | "readBytes">;
  sessionCache?: MobileSourceSessionCache;
};

async function resolveHomeImageRequest(
  source: Pick<MobileAidokuExecutorSource, "modifyImageRequest">,
  url: string | undefined,
): Promise<{ url: string; headers: Record<string, string> } | null> {
  if (!url) return null;
  try {
    return await source.modifyImageRequest(url);
  } catch {
    return null;
  }
}

async function normalizeHomeMangaImage(
  source: Pick<MobileAidokuExecutorSource, "modifyImageRequest">,
  manga: AidokuManga,
): Promise<AidokuManga> {
  const request = await resolveHomeImageRequest(source, manga.cover);
  if (!request) return manga;
  return {
    ...manga,
    cover: request.url,
    coverHeaders: request.headers,
  } as AidokuManga;
}

async function normalizeHomeLinkImages(
  source: Pick<MobileAidokuExecutorSource, "modifyImageRequest">,
  link: HomeLink,
): Promise<HomeLink> {
  const imageRequest = await resolveHomeImageRequest(source, link.imageUrl);
  const valueManga =
    link.value?.type === "manga"
      ? await normalizeHomeMangaImage(source, link.value.manga)
      : null;

  return {
    ...link,
    ...(imageRequest
      ? { imageUrl: imageRequest.url, imageHeaders: imageRequest.headers }
      : {}),
    ...(valueManga
      ? { value: { ...link.value, manga: valueManga } }
      : {}),
  } as HomeLink;
}

async function normalizeMobileSourceHomeImages(
  source: Pick<MobileAidokuExecutorSource, "modifyImageRequest">,
  home: HomeLayout | null,
): Promise<HomeLayout | null> {
  if (!home) return null;

  const components: HomeLayout["components"] = [];
  for (const component of home.components) {
    const { value } = component;

    if (value.type === "scroller" || value.type === "mangaList") {
      const entries: typeof value.entries = [];
      for (const link of value.entries) {
        entries.push(await normalizeHomeLinkImages(source, link));
      }
      components.push({
        ...component,
        value: {
          ...value,
          entries,
        },
      });
      continue;
    }

    if (value.type === "imageScroller") {
      const links: typeof value.links = [];
      for (const link of value.links) {
        links.push(await normalizeHomeLinkImages(source, link));
      }
      components.push({
        ...component,
        value: {
          ...value,
          links,
        },
      });
      continue;
    }

    if (value.type === "bigScroller") {
      const entries: typeof value.entries = [];
      for (const manga of value.entries) {
        entries.push(await normalizeHomeMangaImage(source, manga));
      }
      components.push({
        ...component,
        value: {
          ...value,
          entries,
        },
      });
      continue;
    }

    if (value.type === "mangaChapterList") {
      const entries: typeof value.entries = [];
      for (const entry of value.entries) {
        entries.push({
          ...entry,
          manga: await normalizeHomeMangaImage(source, entry.manga),
        });
      }
      components.push({
        ...component,
        value: {
          ...value,
          entries,
        },
      });
      continue;
    }

    components.push(component);
  }

  return { components };
}

export async function fetchMobileSourceHome(
  source: InstalledSource,
  options: MobileSourceHomeOptions = {}
): Promise<MobileSourceHomeResult> {
  const display = toSearchSourceDisplay(source);
  const normalized = normalizeInstalledSource(source);
  const sourceKey = makeMobileRuntimeSourceKey(normalized);
  const settings = await (options.getSourceSettings ?? defaultMobileSourceSettings)(sourceKey, source);
  const cache = options.sessionCache ?? defaultMobileSourceSessionCache;

  return cache.withSession(
    normalized,
    { ...options.executor, settings },
    async (session): Promise<MobileSourceHomeResult> => {
      if (session.status === "blocked") {
        return {
          status: "blocked",
          source: display,
          reason: session.reason,
          detail: session.detail,
        };
      }

      let acceptingPartials = true;
      try {
        const hasHomeProvider = await session.source.hasHomeProvider();
        const onlySearch = await session.source.isOnlySearch();
        const partials: Promise<void>[] = [];
        const home = hasHomeProvider && !onlySearch
          ? await session.source.getHomeWithPartials((partialHome) => {
              if (!acceptingPartials) return;
              const partial = normalizeMobileSourceHomeImages(
                session.source,
                partialHome,
              ).then((normalized) => {
                if (!acceptingPartials) return;
                options.onPartial?.(normalized ?? partialHome);
              });
              partials.push(partial);
            })
          : null;
        const normalizedHome = await normalizeMobileSourceHomeImages(
          session.source,
          home,
        );
        await Promise.allSettled(partials);
        return {
          status: "ready",
          source: display,
          runtime: session.runtime,
          hasHomeProvider,
          onlySearch,
          home: normalizedHome,
        };
      } finally {
        acceptingPartials = false;
      }
    }
  );
}
