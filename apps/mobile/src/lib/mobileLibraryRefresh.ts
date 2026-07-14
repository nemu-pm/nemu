import type {
  InstalledSource,
  LibraryEntry,
  LocalSourceLink,
} from "@/data/schema";
import { makeChapterSortKey } from "@/lib/mobileLibraryDetails";
import {
  refreshMobileSourceLatestChapter,
  type MobileSourceDetailsOptions,
  type MobileSourceLatestChapterRefresh,
} from "@/sources/mobileSourceDetails";
import {
  buildMobileSourcePackageLoadPlan,
  normalizeInstalledSource,
} from "@/sources/mobileSourceRuntime";
import { mobileInstalledSourceMatchesLink } from "./mobileInstalledSourceKeys";

export const MOBILE_LIBRARY_REFRESH_INTERVAL_MS = 30 * 60 * 1000;
export const MOBILE_LIBRARY_REFRESH_MAX_CONCURRENT_REQUESTS = 1;

export type MobileLibraryRefreshLifecycleDecision = {
  abortCurrent: boolean;
  refreshNow: boolean;
  refreshAfterInFlight: boolean;
};

export function isMobileLibraryRefreshAppActive(appState: string): boolean {
  return appState === "active";
}

/** Pure AppState transition contract used by LibraryScreen and unit tests. */
export function getMobileLibraryRefreshLifecycleDecision(options: {
  previous: string;
  next: string;
  inFlight: boolean;
}): MobileLibraryRefreshLifecycleDecision {
  if (!isMobileLibraryRefreshAppActive(options.next)) {
    return {
      abortCurrent: true,
      refreshNow: false,
      refreshAfterInFlight: false,
    };
  }
  const resumed = /inactive|background/.test(options.previous);
  return {
    abortCurrent: false,
    refreshNow: resumed && !options.inFlight,
    refreshAfterInFlight: resumed && options.inFlight,
  };
}

export type MobileLibraryRefreshResult = {
  checked: number;
  refreshed: number;
  updated: number;
  skippedFresh: number;
  skippedMissingSource: number;
  blocked: number;
  failed: number;
  /**
   * Present only when the run was interrupted by an abort signal. The library
   * refresh serializes through the same `aidokuRuntimeQueue` as interactive
   * source taps, so a long background refresh would otherwise freeze the UI for
   * every source tap until the whole library is checked. Aborting between
   * chunks lets an interactive tap preempt the remaining work.
   */
  aborted?: boolean;
};

type MobileLibraryRefreshTask = {
  sourceLink: LocalSourceLink;
  installedSource: InstalledSource;
};

export type RefreshMobileLibraryLatestChaptersOptions = {
  entries: LibraryEntry[];
  installedSources: InstalledSource[];
  getSourceSettings?: MobileSourceDetailsOptions["getSourceSettings"];
  saveSourceLink: (sourceLink: LocalSourceLink) => Promise<void>;
  refreshLatestChapter?: (
    source: InstalledSource,
    mangaId: string,
    options?: MobileSourceDetailsOptions
  ) => Promise<MobileSourceLatestChapterRefresh>;
  force?: boolean;
  now?: () => number;
  intervalMs?: number;
  maxConcurrentRequests?: number;
  /**
   * Mutable flag an interactive caller can flip to `true` to interrupt the
   * run between chunks. Checked after each chunk yields to the JS thread.
   */
  signal?: { aborted: boolean };
};

export function sourceLinkNeedsLatestRefresh(
  sourceLink: LocalSourceLink,
  now: number,
  intervalMs = MOBILE_LIBRARY_REFRESH_INTERVAL_MS
): boolean {
  return sourceLink.latestFetchedAt == null || now - sourceLink.latestFetchedAt > intervalMs;
}

export function hasMobileLibraryStaleSourceLinks(
  entries: LibraryEntry[],
  now: number,
  intervalMs = MOBILE_LIBRARY_REFRESH_INTERVAL_MS,
  installedSources?: InstalledSource[]
): boolean {
  return entries.some((entry) =>
    entry.sources.some((sourceLink) => {
      if (!sourceLinkNeedsLatestRefresh(sourceLink, now, intervalMs)) {
        return false;
      }
      if (!installedSources) return true;
      const installedSource = findInstalledSourceForLink(installedSources, sourceLink);
      return installedSource ? canRefreshInstalledSource(installedSource) : false;
    })
  );
}

export function findInstalledSourceForLink(
  installedSources: InstalledSource[],
  sourceLink: LocalSourceLink
): InstalledSource | null {
  return (
    installedSources.find((source) =>
      mobileInstalledSourceMatchesLink(source, sourceLink)
    ) ?? null
  );
}

export function canRefreshInstalledSource(source: InstalledSource): boolean {
  return buildMobileSourcePackageLoadPlan(normalizeInstalledSource(source)).status === "ready";
}

export function applyMobileLatestChapterRefresh(
  sourceLink: LocalSourceLink,
  refresh: Extract<MobileSourceLatestChapterRefresh, { status: "ready" }>
): LocalSourceLink {
  const latestChapter = refresh.latestChapter;
  const latestChapterSortKey = latestChapter ? makeChapterSortKey(latestChapter) : undefined;

  return {
    ...sourceLink,
    ...(latestChapter
      ? {
          latestChapter,
          latestChapterSortKey,
          updateAckChapter: sourceLink.updateAckChapter ?? latestChapter,
          updateAckChapterSortKey: sourceLink.updateAckChapterSortKey ?? latestChapterSortKey,
        }
      : {}),
    latestFetchedAt: refresh.fetchedAt,
    updatedAt: refresh.fetchedAt,
  };
}

export function applyMobileLatestChapterRefreshAttempt(
  sourceLink: LocalSourceLink,
  attemptedAt: number
): LocalSourceLink {
  return {
    ...sourceLink,
    latestFetchedAt: attemptedAt,
  };
}

function latestChanged(
  previous: LocalSourceLink,
  next: LocalSourceLink
): boolean {
  return (
    previous.latestChapter?.id !== next.latestChapter?.id ||
    previous.latestChapter?.chapterNumber !== next.latestChapter?.chapterNumber
  );
}

async function saveMobileLatestChapterRefreshAttempt(
  saveSourceLink: (sourceLink: LocalSourceLink) => Promise<void>,
  sourceLink: LocalSourceLink,
  attemptedAt: number
) {
  try {
    await saveSourceLink(
      applyMobileLatestChapterRefreshAttempt(sourceLink, attemptedAt)
    );
  } catch (error) {
    console.warn(
      "[MobileLibrary] Failed to record latest chapter refresh attempt",
      error
    );
  }
}

export async function refreshMobileLibraryLatestChapters({
  entries,
  installedSources,
  getSourceSettings,
  saveSourceLink,
  refreshLatestChapter = refreshMobileSourceLatestChapter,
  force = false,
  now = () => Date.now(),
  intervalMs = MOBILE_LIBRARY_REFRESH_INTERVAL_MS,
  maxConcurrentRequests = MOBILE_LIBRARY_REFRESH_MAX_CONCURRENT_REQUESTS,
  signal,
}: RefreshMobileLibraryLatestChaptersOptions): Promise<MobileLibraryRefreshResult> {
  const checkedAt = now();
  const chunkSize = Math.max(1, maxConcurrentRequests);
  const result: MobileLibraryRefreshResult = {
    checked: 0,
    refreshed: 0,
    updated: 0,
    skippedFresh: 0,
    skippedMissingSource: 0,
    blocked: 0,
    failed: 0,
  };
  const tasks: MobileLibraryRefreshTask[] = [];

  for (const entry of entries) {
    for (const sourceLink of entry.sources) {
      if (!force && !sourceLinkNeedsLatestRefresh(sourceLink, checkedAt, intervalMs)) {
        result.skippedFresh += 1;
        continue;
      }

      const installedSource = findInstalledSourceForLink(installedSources, sourceLink);
      if (!installedSource) {
        result.skippedMissingSource += 1;
        continue;
      }
      if (!canRefreshInstalledSource(installedSource)) {
        result.blocked += 1;
        continue;
      }

      tasks.push({ sourceLink, installedSource });
    }
  }

  result.checked = tasks.length;

  let aborted = false;
  for (let i = 0; i < tasks.length; i += chunkSize) {
    if (signal?.aborted) {
      aborted = true;
      break;
    }
    const chunk = tasks.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map(async ({ sourceLink, installedSource }) => {
        try {
          const refresh = await refreshLatestChapter(
            installedSource,
            sourceLink.sourceMangaId,
            { getSourceSettings, now }
          );
          if (refresh.status === "blocked") {
            result.blocked += 1;
            await saveMobileLatestChapterRefreshAttempt(
              saveSourceLink,
              sourceLink,
              checkedAt
            );
            return;
          }

          const updatedSourceLink = applyMobileLatestChapterRefresh(sourceLink, refresh);
          await saveSourceLink(updatedSourceLink);
          result.refreshed += 1;
          if (latestChanged(sourceLink, updatedSourceLink)) {
            result.updated += 1;
          }
        } catch (error) {
          // Native source HTTP is intentionally cancelled when the app enters
          // the background. Treat that lifecycle cancellation as an interrupt,
          // not a network failure: advancing latestFetchedAt here would apply
          // the normal failure cooldown and suppress the foreground catch-up.
          if (signal?.aborted) return;
          result.failed += 1;
          await saveMobileLatestChapterRefreshAttempt(
            saveSourceLink,
            sourceLink,
            checkedAt
          );
          console.warn("[MobileLibrary] Failed to refresh latest chapter", error);
        }
      })
    );

    // Yield to the JS thread between chunks so queued interactive taps (and
    // the abort signal) can run instead of waiting for the whole library.
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (signal?.aborted) {
      aborted = true;
      break;
    }
  }

  return aborted ? { ...result, aborted: true } : result;
}
