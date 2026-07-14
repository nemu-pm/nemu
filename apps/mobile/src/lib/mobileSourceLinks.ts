import type {
  ChapterSummary,
  InstalledSource,
  LibraryEntry,
  LocalChapterProgress,
  LocalCollectionItem,
  LocalLibraryItem,
  LocalMangaProgress,
  LocalSourceLink,
} from "@/data/schema";
import { makeMangaProgressId, makeSourceLinkId } from "@/data/schema";
import { makeSourceKey, parseSourceKey } from "@/sources/aidokuRegistry";
import {
  getMobileSourceLinkRegistryKeys,
  mobileInstalledSourceMatchesLink,
} from "./mobileInstalledSourceKeys";
import { formatMobileString, type MobileStrings } from "./mobileI18n";

export type MobileSourceLinkInput = {
  registryId: string;
  sourceId: string;
  sourceMangaId: string;
  sourceKeys?: Iterable<string | null | undefined>;
  latestChapter?: ChapterSummary;
};

export function sortMobileSourceLinks(
  sources: LocalSourceLink[],
  sourceOrder: string[] | undefined
): LocalSourceLink[] {
  const positions = sourceOrder?.length
    ? new Map(sourceOrder.map((id, index) => [id, index]))
    : null;

  return [...sources].sort((a, b) => {
    if (positions) {
      const aPos = positions.get(a.id);
      const bPos = positions.get(b.id);
      if (aPos !== undefined && bPos !== undefined) return aPos - bPos;
      if (aPos !== undefined) return -1;
      if (bPos !== undefined) return 1;
    }
    if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
    return a.id.localeCompare(b.id);
  });
}

function joinAccessibilityParts(parts: Array<string | false | undefined>): string {
  return parts.filter(Boolean).join(", ");
}

export function formatMobileSourceCountText(
  count: number,
  strings: MobileStrings
): string {
  return formatMobileString(
    count === 1
      ? strings.sourceManager.sourceCountOne
      : strings.sourceManager.sourceCountOther,
    { count }
  );
}

export function formatSourceManagerSelectAccessibilityLabel(
  name: string,
  positionLabel: string,
  selected: boolean,
  strings: MobileStrings,
  detail?: string
): string {
  return joinAccessibilityParts([
    formatMobileString(strings.sourceManager.selectSource, {
      name,
      positionLabel,
    }),
    detail,
    selected && strings.sourceManager.active,
  ]);
}

export function formatAddSourceResultAccessibilityLabel({
  title,
  sourceName,
  authors,
  added,
  strings,
}: {
  title: string;
  sourceName: string;
  authors?: string[];
  added: boolean;
  strings: MobileStrings;
}): string {
  return joinAccessibilityParts([
    formatMobileString(strings.sourceManager.addSourceResult, {
      title,
      source: sourceName,
    }),
    authors?.length ? authors.join(", ") : undefined,
    added && strings.sourceManager.added,
  ]);
}

export function formatMergeCandidateAccessibilityLabel({
  title,
  sourceCount,
  likelyMatch,
  strings,
}: {
  title: string;
  sourceCount: number;
  likelyMatch: boolean;
  strings: MobileStrings;
}): string {
  return joinAccessibilityParts([
    formatMobileString(strings.sourceManager.mergeWithTitle, { title }),
    formatMobileSourceCountText(sourceCount, strings),
    likelyMatch && strings.sourceManager.likelyMatch,
  ]);
}

export function makeMobileSourceAddResultKey(
  registryId: string,
  sourceId: string,
  mangaId: string
): string {
  return makeSourceLinkId(registryId, sourceId, mangaId);
}

export function getMobileSourceAddResultSourceKey(
  addResultKey: string | null | undefined
): string | null {
  if (!addResultKey) return null;
  const parts = addResultKey.split(":");
  if (parts.length !== 3) return null;
  try {
    return `${decodeURIComponent(parts[0] ?? "")}:${decodeURIComponent(parts[1] ?? "")}`;
  } catch {
    return null;
  }
}

export function canRunMobileSourceAddSearch(
  query: string,
  loading: boolean
): boolean {
  return query.trim().length > 0 && !loading;
}

export type MobileSourceManagerActionState = {
  searching: boolean;
  adding: boolean;
  merging: boolean;
  sourceMutating: boolean;
};

export function isMobileSourceManagerActionBusy(
  state: MobileSourceManagerActionState
): boolean {
  return state.searching || state.adding || state.merging || state.sourceMutating;
}

export function canStartMobileSourceManagerAction(
  state: MobileSourceManagerActionState
): boolean {
  return !isMobileSourceManagerActionBusy(state);
}

export function canRunMobileSourceManagerSearch(
  query: string,
  state: MobileSourceManagerActionState
): boolean {
  return query.trim().length > 0 && canStartMobileSourceManagerAction(state);
}

export function canSelectMobileSourceManagerAddMode({
  selected,
  disabled,
  hasActionError,
}: {
  selected: boolean;
  disabled: boolean;
  hasActionError: boolean;
}): boolean {
  return !disabled && (!selected || hasActionError);
}

export function canSelectMobileSourceManagerSourceRow({
  selected,
  disabled,
}: {
  selected: boolean;
  disabled: boolean;
}): boolean {
  return !selected && !disabled;
}

export type MobileSourceManagerAddPanelToggleAction =
  | "open-add-panel"
  | "close-add-panel"
  | "ignore";

export function getMobileSourceManagerAddPanelToggleAction({
  addPanelOpen,
  state,
}: {
  addPanelOpen: boolean;
  state: MobileSourceManagerActionState;
}): MobileSourceManagerAddPanelToggleAction {
  if (!canStartMobileSourceManagerAction(state)) return "ignore";
  return addPanelOpen ? "close-add-panel" : "open-add-panel";
}

export function makeMobileSourceOrder(sources: LocalSourceLink[]): string[] {
  return sources.map((source) => source.id);
}

export function getMobileSourceLinkInputKeys(
  sourceInput: Pick<MobileSourceLinkInput, "registryId" | "sourceId" | "sourceKeys">,
): string[] {
  const keys = new Set([makeSourceKey(sourceInput.registryId, sourceInput.sourceId)]);

  for (const key of sourceInput.sourceKeys ?? []) {
    const trimmed = key?.trim();
    if (!trimmed) continue;
    const parsed = parseSourceKey(trimmed);
    keys.add(
      parsed.registryId === "unknown"
        ? makeSourceKey(sourceInput.registryId, trimmed)
        : makeSourceKey(parsed.registryId, parsed.sourceId),
    );
  }

  return [...keys];
}

export function findMobileSourceLinkForInput(
  entry: LibraryEntry,
  sourceInput: Pick<
    MobileSourceLinkInput,
    "registryId" | "sourceId" | "sourceMangaId" | "sourceKeys"
  >,
): LocalSourceLink | undefined {
  const sourceKeys = new Set(getMobileSourceLinkInputKeys(sourceInput));
  return entry.sources.find(
    (source) =>
      source.sourceMangaId === sourceInput.sourceMangaId &&
      sourceKeys.has(makeSourceKey(source.registryId, source.sourceId)),
  );
}

export function moveMobileSourceLink(
  entry: LibraryEntry,
  sourceId: string,
  direction: -1 | 1
): string[] {
  const sorted = sortMobileSourceLinks(entry.sources, entry.item.sourceOrder);
  const index = sorted.findIndex((source) => source.id === sourceId);
  if (index < 0) return makeMobileSourceOrder(sorted);

  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= sorted.length) return makeMobileSourceOrder(sorted);

  const next = [...sorted];
  const [source] = next.splice(index, 1);
  next.splice(nextIndex, 0, source);
  return makeMobileSourceOrder(next);
}

export function removeMobileSourceLinkFromEntry(
  entry: LibraryEntry,
  sourceId: string,
  updatedAt: number
): { item: LocalLibraryItem; sources: LocalSourceLink[] } {
  const nextSources = entry.sources.filter((source) => source.id !== sourceId);
  return {
    item: {
      ...entry.item,
      sourceOrder: makeMobileSourceOrder(
        sortMobileSourceLinks(nextSources, entry.item.sourceOrder)
      ),
      updatedAt,
    },
    sources: nextSources,
  };
}

export function addMobileSourceLinkToEntry(
  entry: LibraryEntry,
  sourceInput: MobileSourceLinkInput,
  updatedAt: number
): { entry: LibraryEntry; sourceLink: LocalSourceLink; added: boolean } {
  const id = makeSourceLinkId(
    sourceInput.registryId,
    sourceInput.sourceId,
    sourceInput.sourceMangaId
  );
  const existing = findMobileSourceLinkForInput(entry, sourceInput);
  if (existing) return { entry, sourceLink: existing, added: false };

  const sourceLink: LocalSourceLink = {
    id,
    libraryItemId: entry.item.libraryItemId,
    registryId: sourceInput.registryId,
    sourceId: sourceInput.sourceId,
    sourceMangaId: sourceInput.sourceMangaId,
    latestChapter: sourceInput.latestChapter,
    updateAckChapter: sourceInput.latestChapter,
    createdAt: updatedAt,
    updatedAt,
  };
  const nextSources = [...entry.sources, sourceLink];
  const sourceOrder = [
    ...makeMobileSourceOrder(sortMobileSourceLinks(entry.sources, entry.item.sourceOrder)),
    sourceLink.id,
  ];

  return {
    entry: {
      item: {
        ...entry.item,
        sourceOrder,
        updatedAt,
      },
      sources: nextSources,
    },
    sourceLink,
    added: true,
  };
}

function getMobileSourceLinkMergeKeys(
  source: LocalSourceLink,
  installedSources: InstalledSource[],
): string[] {
  const keys = new Set([makeSourceKey(source.registryId, source.sourceId)]);

  for (const installedSource of installedSources) {
    if (!mobileInstalledSourceMatchesLink(installedSource, source)) continue;
    for (const key of getMobileSourceLinkRegistryKeys(source, installedSource)) {
      keys.add(key);
    }
  }

  return [...keys];
}

function mobileSourceLinksMatchForMerge(
  left: LocalSourceLink,
  right: LocalSourceLink,
  installedSources: InstalledSource[],
): boolean {
  if (left.id === right.id) return true;
  if (left.sourceMangaId !== right.sourceMangaId) return false;

  const rightKeys = new Set(
    getMobileSourceLinkMergeKeys(right, installedSources),
  );
  return getMobileSourceLinkMergeKeys(left, installedSources).some((key) =>
    rightKeys.has(key),
  );
}

export function mergeMobileLibraryEntries(
  targetEntry: LibraryEntry,
  sourceEntry: LibraryEntry,
  updatedAt: number,
  installedSources: InstalledSource[] = [],
): { entry: LibraryEntry; movedSources: LocalSourceLink[]; shouldRemoveSourceEntry: boolean } {
  if (targetEntry.item.libraryItemId === sourceEntry.item.libraryItemId) {
    return { entry: targetEntry, movedSources: [], shouldRemoveSourceEntry: false };
  }

  const movedSources = sortMobileSourceLinks(sourceEntry.sources, sourceEntry.item.sourceOrder)
    .filter(
      (source) =>
        !targetEntry.sources.some((targetSource) =>
          mobileSourceLinksMatchForMerge(
            source,
            targetSource,
            installedSources,
          ),
        ),
    )
    .map((source) => ({
      ...source,
      libraryItemId: targetEntry.item.libraryItemId,
      updatedAt,
    }));
  const sourceOrder = [
    ...makeMobileSourceOrder(
      sortMobileSourceLinks(targetEntry.sources, targetEntry.item.sourceOrder)
    ),
    ...movedSources.map((source) => source.id),
  ];

  return {
    entry: {
      item: {
        ...targetEntry.item,
        sourceOrder,
        updatedAt: movedSources.length ? updatedAt : targetEntry.item.updatedAt,
      },
      sources: [...targetEntry.sources, ...movedSources],
    },
    movedSources,
    shouldRemoveSourceEntry: true,
  };
}

export function collectionIdsToTransferForMobileMerge(
  collectionItems: LocalCollectionItem[],
  targetLibraryItemId: string,
  sourceLibraryItemId: string
): string[] {
  if (targetLibraryItemId === sourceLibraryItemId) return [];

  const targetCollectionIds = new Set<string>();
  const sourceCollectionIds: string[] = [];

  for (const item of collectionItems) {
    if (item.removed) continue;
    if (item.libraryItemId === targetLibraryItemId) {
      targetCollectionIds.add(item.collectionId);
    } else if (item.libraryItemId === sourceLibraryItemId) {
      sourceCollectionIds.push(item.collectionId);
    }
  }

  return [...new Set(sourceCollectionIds)].filter(
    (collectionId) => !targetCollectionIds.has(collectionId)
  );
}

export function retargetMobileMergeProgress<
  T extends LocalChapterProgress | LocalMangaProgress,
>(
  progressItems: T[],
  targetLibraryItemId: string,
  sourceLibraryItemId: string,
  updatedAt: number,
): T[] {
  if (targetLibraryItemId === sourceLibraryItemId) return [];

  return progressItems
    .filter((item) => item.libraryItemId === sourceLibraryItemId)
    .map((item) => ({
      ...item,
      libraryItemId: targetLibraryItemId,
      updatedAt,
    }));
}

function newerMobileProgressMetadata<
  T extends LocalChapterProgress | LocalMangaProgress,
>(left: T, right: T): T {
  return left.lastReadAt >= right.lastReadAt ? left : right;
}

function mergeMobileChapterProgressRows(
  existing: LocalChapterProgress,
  incoming: LocalChapterProgress,
): LocalChapterProgress {
  const metadata = newerMobileProgressMetadata(existing, incoming);
  return {
    ...incoming,
    progress: Math.max(existing.progress, incoming.progress),
    total: Math.max(existing.total, incoming.total),
    completed: existing.completed || incoming.completed,
    lastReadAt: Math.max(existing.lastReadAt, incoming.lastReadAt),
    chapterNumber:
      metadata.chapterNumber ?? existing.chapterNumber ?? incoming.chapterNumber,
    volumeNumber:
      metadata.volumeNumber ?? existing.volumeNumber ?? incoming.volumeNumber,
    chapterTitle:
      metadata.chapterTitle ?? existing.chapterTitle ?? incoming.chapterTitle,
  };
}

export function mergeMobileRetargetedChapterProgress(
  retargetedChapterProgress: LocalChapterProgress[],
  existingChapterProgress: LocalChapterProgress[],
): LocalChapterProgress[] {
  const affectedIds = new Set(retargetedChapterProgress.map((item) => item.id));
  const progressById = new Map(
    existingChapterProgress
      .filter((item) => affectedIds.has(item.id))
      .map((item) => [item.id, item]),
  );

  for (const progress of retargetedChapterProgress) {
    const existing = progressById.get(progress.id);
    progressById.set(
      progress.id,
      existing
        ? mergeMobileChapterProgressRows(existing, progress)
        : progress,
    );
  }

  return [...progressById.values()];
}

function mobileMangaProgressFromChapterProgress(
  progress: LocalChapterProgress,
): LocalMangaProgress {
  return {
    id: makeMangaProgressId(
      progress.registryId,
      progress.sourceId,
      progress.sourceMangaId,
    ),
    registryId: progress.registryId,
    sourceId: progress.sourceId,
    sourceMangaId: progress.sourceMangaId,
    libraryItemId: progress.libraryItemId,
    lastReadAt: progress.lastReadAt,
    lastReadSourceChapterId: progress.sourceChapterId,
    lastReadChapterNumber: progress.chapterNumber,
    lastReadVolumeNumber: progress.volumeNumber,
    lastReadChapterTitle: progress.chapterTitle,
    updatedAt: progress.updatedAt,
  };
}

function keepNewestMobileMangaProgress(
  progressById: Map<string, LocalMangaProgress>,
  progress: LocalMangaProgress,
) {
  const existing = progressById.get(progress.id);
  if (!existing || progress.lastReadAt >= existing.lastReadAt) {
    progressById.set(progress.id, progress);
  }
}

export function mergeMobileRetargetedMangaProgress(
  retargetedChapterProgress: LocalChapterProgress[],
  retargetedMangaProgress: LocalMangaProgress[],
  existingMangaProgress: LocalMangaProgress[] = [],
): LocalMangaProgress[] {
  const affectedIds = new Set<string>();
  for (const progress of retargetedMangaProgress) affectedIds.add(progress.id);
  for (const progress of retargetedChapterProgress) {
    affectedIds.add(
      makeMangaProgressId(
        progress.registryId,
        progress.sourceId,
        progress.sourceMangaId,
      ),
    );
  }

  const progressById = new Map<string, LocalMangaProgress>();

  for (const progress of existingMangaProgress) {
    if (affectedIds.has(progress.id)) {
      keepNewestMobileMangaProgress(progressById, progress);
    }
  }
  for (const progress of retargetedMangaProgress) {
    keepNewestMobileMangaProgress(progressById, progress);
  }
  for (const progress of retargetedChapterProgress) {
    keepNewestMobileMangaProgress(
      progressById,
      mobileMangaProgressFromChapterProgress(progress),
    );
  }

  return [...progressById.values()];
}
