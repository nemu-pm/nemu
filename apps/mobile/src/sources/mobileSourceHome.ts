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

const MOBILE_HOME_IMAGE_REQUEST_CONCURRENCY = 8;
const mobileHomeImageRequestQueue: Array<() => void> = [];
const mobileHomeImageRequestCache = new WeakMap<
  object,
  Map<string, Promise<{ url: string; headers: Record<string, string> } | null>>
>();
let activeMobileHomeImageRequests = 0;

function runMobileHomeImageRequest<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const start = () => {
      activeMobileHomeImageRequests += 1;
      void task()
        .then(resolve, reject)
        .finally(() => {
          activeMobileHomeImageRequests = Math.max(
            0,
            activeMobileHomeImageRequests - 1,
          );
          mobileHomeImageRequestQueue.shift()?.();
        });
    };

    if (
      activeMobileHomeImageRequests < MOBILE_HOME_IMAGE_REQUEST_CONCURRENCY
    ) {
      start();
    } else {
      mobileHomeImageRequestQueue.push(start);
    }
  });
}

async function resolveHomeImageRequest(
  source: Pick<MobileAidokuExecutorSource, "modifyImageRequest">,
  url: string | undefined,
): Promise<{ url: string; headers: Record<string, string> } | null> {
  if (!url) return null;
  let sourceCache = mobileHomeImageRequestCache.get(source);
  if (!sourceCache) {
    sourceCache = new Map();
    mobileHomeImageRequestCache.set(source, sourceCache);
  }
  const cached = sourceCache.get(url);
  if (cached) return cached;

  const request = runMobileHomeImageRequest(() =>
    source.modifyImageRequest(url),
  ).catch(() => null);
  sourceCache.set(url, request);
  const result = await request;
  if (!result && sourceCache.get(url) === request) sourceCache.delete(url);
  return result;
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

  const components = await Promise.all(home.components.map(async (component) => {
    const { value } = component;

    if (value.type === "scroller" || value.type === "mangaList") {
      const entries = await Promise.all(
        value.entries.map((link) => normalizeHomeLinkImages(source, link)),
      );
      return {
        ...component,
        value: {
          ...value,
          entries,
        },
      };
    }

    if (value.type === "imageScroller") {
      const links = await Promise.all(
        value.links.map((link) => normalizeHomeLinkImages(source, link)),
      );
      return {
        ...component,
        value: {
          ...value,
          links,
        },
      };
    }

    if (value.type === "bigScroller") {
      const entries = await Promise.all(
        value.entries.map((manga) => normalizeHomeMangaImage(source, manga)),
      );
      return {
        ...component,
        value: {
          ...value,
          entries,
        },
      };
    }

    if (value.type === "mangaChapterList") {
      const entries = await Promise.all(
        value.entries.map(async (entry) => ({
          ...entry,
          manga: await normalizeHomeMangaImage(source, entry.manga),
        })),
      );
      return {
        ...component,
        value: {
          ...value,
          entries,
        },
      };
    }

    return component;
  }));

  return { components };
}

export function compactFinalMobileSourceHome(
  home: HomeLayout | null,
): HomeLayout | null {
  if (!home) return null;
  const components = home.components.filter((component) => {
    const value = component.value;
    switch (value.type) {
      case "scroller":
      case "mangaList":
      case "mangaChapterList":
        return value.entries.length > 0 || value.listing !== undefined;
      case "bigScroller":
        return value.entries.length > 0;
      case "imageScroller":
      case "links":
        return value.links.length > 0;
      case "filters":
        return value.items.length > 0;
    }
  });
  return components.length > 0 ? { components } : null;
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
        const normalizedHome = compactFinalMobileSourceHome(
          await normalizeMobileSourceHomeImages(session.source, home),
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
