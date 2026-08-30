import type { InstalledSource } from "@/data/schema";
import { toSearchSourceDisplay, type SearchSourceDisplay } from "@/lib/mobileSearch";
import {
  type Filter,
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

export type MobileSourceFiltersResult =
  | {
      status: "ready";
      source: SearchSourceDisplay;
      runtime: MobileSourceExecutorRuntime;
      filters: Filter[];
    }
  | {
      status: "blocked";
      source: SearchSourceDisplay;
      reason: string;
      detail: string;
    };

export type MobileSourceFiltersOptions = {
  getSourceSettings?: (sourceKey: string, source: InstalledSource) => Promise<Record<string, unknown>>;
  executor?: Pick<MobileSourceExecutorOptions, "bridge" | "readBytes">;
  sessionCache?: MobileSourceSessionCache;
};

export async function fetchMobileSourceFilters(
  source: InstalledSource,
  options: MobileSourceFiltersOptions = {}
): Promise<MobileSourceFiltersResult> {
  const display = toSearchSourceDisplay(source);
  const normalized = normalizeInstalledSource(source);
  const sourceKey = makeMobileRuntimeSourceKey(normalized);
  const settings = await (options.getSourceSettings ?? defaultMobileSourceSettings)(sourceKey, source);
  const cache = options.sessionCache ?? defaultMobileSourceSessionCache;

  return cache.withSession(
    normalized,
    { ...options.executor, settings },
    async (session): Promise<MobileSourceFiltersResult> => {
      if (session.status === "blocked") {
        return {
          status: "blocked",
          source: display,
          reason: session.reason,
          detail: session.detail,
        };
      }

      return {
        status: "ready",
        source: display,
        runtime: session.runtime,
        filters: await session.source.getFilters(),
      };
    },
  );
}
