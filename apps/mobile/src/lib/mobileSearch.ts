import type { InstalledSource, LibraryEntry } from "@/data/schema";
import { getEntryTitle } from "@/data/schema";
import { makeSourceKey } from "@/sources/aidokuRegistry";
import {
  getMobileInstalledSourceRegistryKeys,
  getMobileInstalledSourceRegistryRef,
} from "./mobileInstalledSourceKeys";
import { isMobileUnsupportedInstalledSource } from "./mobileBrowseSources";

export type SearchSourceDisplay = {
  id: string;
  registryId: string;
  rawSourceId: string;
  sourceKeys?: string[];
  name: string;
  icon?: string;
  unsupported?: boolean;
};

export type SearchSourceSelection = string[] | null;

export type SearchSourcePressState = { id: string; time: number } | null;

export type MobileSearchSelectionActionState = {
  savingSelection: boolean;
};

export function canClearMobileSearchQuery(query: string): boolean {
  return query.length > 0;
}

export function shouldRunMobileSearchSubmitFeedback(
  query: string,
  routeQuery: string,
): boolean {
  const nextQuery = normalizeMobileSearchRouteQuery(query);
  return nextQuery.length > 0 && nextQuery !== routeQuery;
}

export type LocalSearchResultGroup = {
  source: SearchSourceDisplay;
  entries: LibraryEntry[];
};

export function normalizeMobileSearchRouteQuery(
  value: string | string[] | undefined,
): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" ? raw.trim() : "";
}

export function toSearchSourceDisplay(source: InstalledSource): SearchSourceDisplay {
  const { registryId, sourceId: rawSourceId } =
    getMobileInstalledSourceRegistryRef(source);

  return {
    id: source.id,
    registryId,
    rawSourceId,
    sourceKeys: getMobileInstalledSourceRegistryKeys(source),
    name: source.name ?? rawSourceId,
    icon: source.icon,
    unsupported: isMobileUnsupportedInstalledSource(source),
  };
}

/**
 * Local saved-title matching includes every installed source, but native live
 * search must only execute source kinds this mobile build can run.
 */
export function selectMobileLiveSearchSources(
  sources: SearchSourceDisplay[],
  selection: SearchSourceSelection,
): SearchSourceDisplay[] {
  const normalizedSelection = normalizeSearchSelectionForSources(sources, selection);
  const selectedIds =
    normalizedSelection === null
      ? new Set(sources.map((source) => source.id))
      : new Set(normalizedSelection);
  return sources.filter(
    (source) => !source.unsupported && selectedIds.has(source.id),
  );
}

export function normalizeSearchSelection(
  availableSourceIds: string[],
  selection: SearchSourceSelection
): SearchSourceSelection {
  if (selection === null) return null;
  const available = new Set(availableSourceIds);
  const next = selection.filter((id) => available.has(id));
  if (next.length === availableSourceIds.length) return null;
  return next;
}

export function normalizeSearchSelectionForSources(
  sources: SearchSourceDisplay[],
  selection: SearchSourceSelection
): SearchSourceSelection {
  if (selection === null) return null;

  const sourceIds = sources.map((source) => source.id);
  const keyCounts = new Map<string, number>();
  const sourceKeySets = sources.map((source) => {
    const keys = new Set([source.id, ...(source.sourceKeys ?? [])]);
    for (const key of keys) {
      keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
    }
    return keys;
  });
  const selected = new Set<string>();
  for (const selectedKey of selection) {
    if ((keyCounts.get(selectedKey) ?? 0) !== 1) continue;
    const sourceIndex = sourceKeySets.findIndex((keys) => keys.has(selectedKey));
    if (sourceIndex >= 0) selected.add(sourceIds[sourceIndex]);
  }

  return normalizeSearchSelection(sourceIds, sourceIds.filter((id) => selected.has(id)));
}

export function toggleSearchSourceSelection(
  availableSourceIds: string[],
  selection: SearchSourceSelection,
  sourceId: string
): SearchSourceSelection {
  if (!availableSourceIds.includes(sourceId)) return selection;
  if (selection === null) {
    return availableSourceIds.filter((id) => id !== sourceId);
  }

  const next = new Set(selection);
  if (next.has(sourceId)) {
    next.delete(sourceId);
  } else {
    next.add(sourceId);
  }

  if (next.size === availableSourceIds.length) return null;
  return availableSourceIds.filter((id) => next.has(id));
}

export function toggleAllSearchSources(
  selection: SearchSourceSelection
): SearchSourceSelection {
  return selection === null ? [] : null;
}

export function canChangeMobileSearchSourceSelection(
  state: MobileSearchSelectionActionState
): boolean {
  return !state.savingSelection;
}

export function shouldShowMobileSearchNoSourcesEmpty({
  loading,
  installedCount,
  hasError,
}: {
  loading: boolean;
  installedCount: number;
  hasError: boolean;
}): boolean {
  return !loading && installedCount === 0 && !hasError;
}

export function shouldRenderMobileSearchSkeleton({
  loading,
  settingsLoaded,
  installedCount,
  libraryCount,
  hasError,
}: {
  loading: boolean;
  settingsLoaded: boolean;
  installedCount: number;
  libraryCount: number;
  hasError: boolean;
}): boolean {
  if (!loading || hasError) return false;
  if (!settingsLoaded) return true;
  return installedCount === 0 && libraryCount === 0;
}

export function resolveSearchSourcePressSelection(
  availableSourceIds: string[],
  selection: SearchSourceSelection,
  sourceId: string,
  lastPress: SearchSourcePressState,
  now: number,
  doublePressWindowMs = 300
): { selection: SearchSourceSelection; lastPress: SearchSourcePressState } {
  if (!availableSourceIds.includes(sourceId)) {
    return { selection, lastPress };
  }

  if (lastPress?.id === sourceId && now - lastPress.time < doublePressWindowMs) {
    return { selection: [sourceId], lastPress: null };
  }

  return {
    selection: toggleSearchSourceSelection(availableSourceIds, selection, sourceId),
    lastPress: { id: sourceId, time: now },
  };
}

export function searchEntryMatches(entry: LibraryEntry, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return false;
  const sourceMangaIds = entry.sources.flatMap((link) => {
    const normalizedId = link.sourceMangaId.toLowerCase();
    let decodedId = normalizedId;
    try {
      decodedId = decodeURIComponent(link.sourceMangaId).toLowerCase();
    } catch {
      // Keep the raw source id if it is not URL-encoded.
    }
    return [
      normalizedId,
      decodedId,
      normalizedId.replace(/[-_./:]+/g, " "),
      decodedId.replace(/[-_./:]+/g, " "),
    ];
  });
  const haystack = [
    getEntryTitle(entry),
    entry.item.metadata.authors?.join(" ") ?? "",
    entry.item.metadata.tags?.join(" ") ?? "",
    ...sourceMangaIds,
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalized);
}

export function groupLocalSearchResults(
  entries: LibraryEntry[],
  sources: SearchSourceDisplay[],
  selection: SearchSourceSelection,
  query: string
): LocalSearchResultGroup[] {
  const normalizedSelection = normalizeSearchSelectionForSources(sources, selection);
  const selectedIds =
    normalizedSelection === null
      ? new Set(sources.map((source) => source.id))
      : new Set(normalizedSelection);
  const normalizedQuery = query.trim();
  if (!normalizedQuery || selectedIds.size === 0) return [];

  return sources
    .filter((source) => selectedIds.has(source.id))
    .map((source) => {
      const sourceKeys = new Set(
        source.sourceKeys ?? [makeSourceKey(source.registryId, source.rawSourceId)],
      );
      return {
        source,
        entries: entries.filter(
          (entry) =>
            entry.sources.some((link) =>
              sourceKeys.has(makeSourceKey(link.registryId, link.sourceId)),
            ) && searchEntryMatches(entry, normalizedQuery),
        ),
      };
    });
}
