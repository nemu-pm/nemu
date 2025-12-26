/**
 * Apply functions (Phase 7)
 *
 * Pure functions for applying remote sync data to local stores.
 * These handle merge semantics without any transport/Convex knowledge.
 *
 * Rules:
 * - High-water mark for progress (max)
 * - HLC-based ordering for user intent fields
 * - Idempotent upserts keyed by cursorId
 */

import type {
  LocalLibraryItem,
  LocalSourceLink,
  LocalChapterProgress,
  LocalMangaProgress,
  CompositeCursor,
  IntentClock,
  MangaMetadata,
  ExternalIds,
  UserOverrides,
} from "@/data/schema";
import {
  makeSourceLinkCursorId,
  makeChapterProgressCursorId,
  makeMangaProgressCursorId,
} from "@/data/schema";
import {
  mergeFieldWithClock,
  mergeLibraryMembership,
} from "../hlc";

// ============================================================================
// Repository interfaces (passed in, not imported)
// ============================================================================

/**
 * Minimal repository interface for library items
 */
export interface LibraryItemRepo {
  getLibraryItem(libraryItemId: string): Promise<LocalLibraryItem | null>;
  saveLibraryItem(item: LocalLibraryItem): Promise<void>;
}

/**
 * Minimal repository interface for source links
 */
export interface SourceLinkRepo {
  getSourceLink(cursorId: string): Promise<LocalSourceLink | null>;
  saveSourceLink(link: LocalSourceLink): Promise<void>;
  removeSourceLink(cursorId: string): Promise<void>;
}

/**
 * Minimal repository interface for chapter progress
 */
export interface ChapterProgressRepo {
  getChapterProgressEntry(cursorId: string): Promise<LocalChapterProgress | null>;
  saveChapterProgressEntry(entry: LocalChapterProgress): Promise<void>;
}

/**
 * Minimal repository interface for manga progress
 */
export interface MangaProgressRepo {
  getMangaProgressEntry?(cursorId: string): Promise<LocalMangaProgress | null>;
  saveMangaProgressEntry(entry: LocalMangaProgress): Promise<void>;
}

// ============================================================================
// Sync entry types (transport-agnostic)
// ============================================================================

export interface SyncLibraryItemEntry {
  cursorId: string;
  libraryItemId: string;
  metadata: MangaMetadata;
  externalIds?: ExternalIds;
  inLibrary?: boolean;
  inLibraryClock?: IntentClock;
  overrides?: UserOverrides;
  createdAt: number;
  updatedAt: number;
}

export interface SyncSourceLinkEntry {
  cursorId: string;
  libraryItemId: string;
  registryId: string;
  sourceId: string;
  sourceMangaId: string;
  latestChapter?: { id: string; title?: string; chapterNumber?: number; volumeNumber?: number };
  latestChapterSortKey?: string;
  latestFetchedAt?: number;
  updateAckChapter?: { id: string; title?: string; chapterNumber?: number; volumeNumber?: number };
  updateAckChapterSortKey?: string;
  updateAckAt?: number;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface SyncChapterProgressEntry {
  cursorId: string;
  registryId: string;
  sourceId: string;
  sourceMangaId: string;
  sourceChapterId: string;
  libraryItemId?: string;
  progress: number;
  total: number;
  completed: boolean;
  lastReadAt: number;
  chapterNumber?: number;
  volumeNumber?: number;
  chapterTitle?: string;
  updatedAt: number;
  deletedAt?: number;
}

export interface SyncMangaProgressEntry {
  cursorId: string;
  registryId: string;
  sourceId: string;
  sourceMangaId: string;
  libraryItemId?: string;
  lastReadAt: number;
  lastReadSourceChapterId?: string;
  lastReadChapterNumber?: number;
  lastReadVolumeNumber?: number;
  lastReadChapterTitle?: string;
  deletedAt?: number;
  updatedAt: number;
}

// ============================================================================
// Apply result types
// ============================================================================

export interface ApplyResult<T> {
  affected: T[];
  nextCursor: CompositeCursor;
}

// ============================================================================
// Apply functions
// ============================================================================

/**
 * Apply library items with HLC-based IntentClock merge rules.
 *
 * Uses explicit state + intent clocks for user-edited fields:
 * - inLibrary + inLibraryClock: library membership state
 * - overrides.metadata + overrides.metadataClock: user metadata overrides
 * - overrides.coverUrl + overrides.coverUrlClock: user cover override
 *
 * Merge rule: If incoming.clock > existing.clock, accept incoming value (including null)
 */
export async function applyLibraryItems(
  entries: SyncLibraryItemEntry[],
  currentCursor: CompositeCursor,
  repo: LibraryItemRepo,
  receiveIntentClock?: (clock: IntentClock) => Promise<void>
): Promise<ApplyResult<LocalLibraryItem>> {
  if (entries.length === 0) {
    return { affected: [], nextCursor: currentCursor };
  }

  const affected: LocalLibraryItem[] = [];
  let maxCursor = currentCursor;

  for (const entry of entries) {
    // Track max cursor
    if (
      entry.updatedAt > maxCursor.updatedAt ||
      (entry.updatedAt === maxCursor.updatedAt && entry.cursorId > maxCursor.cursorId)
    ) {
      maxCursor = { updatedAt: entry.updatedAt, cursorId: entry.cursorId };
    }

    // Receive remote clocks to update local HLC state
    if (receiveIntentClock) {
      if (entry.inLibraryClock) await receiveIntentClock(entry.inLibraryClock);
      if (entry.overrides?.metadataClock) await receiveIntentClock(entry.overrides.metadataClock);
      if (entry.overrides?.coverUrlClock) await receiveIntentClock(entry.overrides.coverUrlClock);
    }

    const existing = await repo.getLibraryItem(entry.libraryItemId);

    // Determine incoming inLibrary state (default true)
    const incomingInLibrary = entry.inLibrary ?? true;
    const incomingInLibraryClock = entry.inLibraryClock;

    if (!existing) {
      // New item - create with incoming values
      const item: LocalLibraryItem = {
        libraryItemId: entry.libraryItemId,
        metadata: entry.metadata,
        externalIds: entry.externalIds,
        inLibrary: incomingInLibrary,
        inLibraryClock: incomingInLibraryClock,
        overrides: entry.overrides,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
      };

      await repo.saveLibraryItem(item);
      if (item.inLibrary) {
        affected.push(item);
      }
    } else {
      // Existing item - merge using HLC rules

      // Merge library membership
      const membershipMerge = mergeLibraryMembership(
        existing.inLibrary ?? true,
        existing.inLibraryClock,
        incomingInLibrary,
        incomingInLibraryClock
      );

      // Merge metadata overrides
      const metadataMerge = mergeFieldWithClock(
        existing.overrides?.metadata,
        existing.overrides?.metadataClock,
        entry.overrides?.metadata,
        entry.overrides?.metadataClock
      );

      // Merge cover override
      const coverMerge = mergeFieldWithClock(
        existing.overrides?.coverUrl,
        existing.overrides?.coverUrlClock,
        entry.overrides?.coverUrl,
        entry.overrides?.coverUrlClock
      );

      const merged: LocalLibraryItem = {
        ...existing,
        // Always update metadata from incoming (source truth)
        metadata: entry.metadata,
        externalIds: entry.externalIds ?? existing.externalIds,
        // HLC merged fields
        inLibrary: membershipMerge.inLibrary,
        inLibraryClock: membershipMerge.clock,
        // Normalized overrides (merged)
        overrides: {
          metadata: metadataMerge.value,
          metadataClock: metadataMerge.clock,
          coverUrl: coverMerge.value,
          coverUrlClock: coverMerge.clock,
        },
        // Sync fields
        updatedAt: Math.max(existing.updatedAt, entry.updatedAt),
      };

      await repo.saveLibraryItem(merged);
      if (merged.inLibrary) {
        affected.push(merged);
      }
    }
  }

  return { affected, nextCursor: maxCursor };
}

/**
 * Apply source links with composite cursor.
 *
 * TOMBSTONE HANDLING: When `deletedAt` is set, we preserve the tombstone locally
 * instead of physically deleting. This prevents resurrection if an older "add"
 * arrives out-of-order. UI queries filter out tombstoned rows.
 */
export async function applySourceLinks(
  entries: SyncSourceLinkEntry[],
  currentCursor: CompositeCursor,
  repo: SourceLinkRepo
): Promise<ApplyResult<LocalSourceLink>> {
  if (entries.length === 0) {
    return { affected: [], nextCursor: currentCursor };
  }

  const affected: LocalSourceLink[] = [];
  let maxCursor = currentCursor;

  for (const entry of entries) {
    const cursorId =
      entry.cursorId ||
      makeSourceLinkCursorId(entry.registryId, entry.sourceId, entry.sourceMangaId);

    // Track max cursor
    if (
      entry.updatedAt > maxCursor.updatedAt ||
      (entry.updatedAt === maxCursor.updatedAt && cursorId > maxCursor.cursorId)
    ) {
      maxCursor = { updatedAt: entry.updatedAt, cursorId };
    }

    const existing = await repo.getSourceLink(cursorId);

    // For tombstones: check if incoming tombstone is newer than existing record
    // If existing has a newer updatedAt (e.g., re-added after delete), don't apply tombstone
    if (entry.deletedAt) {
      if (existing && existing.updatedAt >= entry.updatedAt && !existing.deletedAt) {
        // Existing non-tombstone is newer or same age - skip this tombstone
        continue;
      }
      // Preserve tombstone locally (don't physically delete)
      const tombstone: LocalSourceLink = {
        cursorId,
        libraryItemId: entry.libraryItemId,
        registryId: entry.registryId,
        sourceId: entry.sourceId,
        sourceMangaId: entry.sourceMangaId,
        createdAt: existing?.createdAt ?? entry.createdAt,
        updatedAt: entry.updatedAt,
        deletedAt: entry.deletedAt,
      };
      await repo.saveSourceLink(tombstone);
      // Tombstones are not included in affected (UI shouldn't see them)
      continue;
    }

    // For non-tombstones: check if existing is a tombstone that's newer
    if (existing?.deletedAt && existing.updatedAt >= entry.updatedAt) {
      // Existing tombstone is newer - don't resurrect
      continue;
    }

    const link: LocalSourceLink = {
      cursorId,
      libraryItemId: entry.libraryItemId,
      registryId: entry.registryId,
      sourceId: entry.sourceId,
      sourceMangaId: entry.sourceMangaId,
      latestChapter: entry.latestChapter,
      latestChapterSortKey: entry.latestChapterSortKey,
      latestFetchedAt: entry.latestFetchedAt,
      updateAckChapter: entry.updateAckChapter,
      updateAckChapterSortKey: entry.updateAckChapterSortKey,
      updateAckAt: entry.updateAckAt,
      createdAt: existing?.createdAt ?? entry.createdAt,
      updatedAt: entry.updatedAt,
    };

    await repo.saveSourceLink(link);
    affected.push(link);
  }

  return { affected, nextCursor: maxCursor };
}

/**
 * Apply chapter progress with high-water mark merge semantics.
 *
 * TOMBSTONE HANDLING: When `deletedAt` is set, we preserve the tombstone locally
 * instead of skipping. This prevents resurrection if an older progress entry
 * arrives out-of-order. UI queries filter out tombstoned rows.
 */
export async function applyChapterProgress(
  entries: SyncChapterProgressEntry[],
  currentCursor: CompositeCursor,
  repo: ChapterProgressRepo
): Promise<ApplyResult<LocalChapterProgress>> {
  if (entries.length === 0) {
    return { affected: [], nextCursor: currentCursor };
  }

  const affected: LocalChapterProgress[] = [];
  let maxCursor = currentCursor;

  for (const entry of entries) {
    const cursorId =
      entry.cursorId ||
      makeChapterProgressCursorId(
        entry.registryId,
        entry.sourceId,
        entry.sourceMangaId,
        entry.sourceChapterId
      );

    // Track max cursor
    if (
      entry.updatedAt > maxCursor.updatedAt ||
      (entry.updatedAt === maxCursor.updatedAt && cursorId > maxCursor.cursorId)
    ) {
      maxCursor = { updatedAt: entry.updatedAt, cursorId };
    }

    const existing = await repo.getChapterProgressEntry(cursorId);

    // Handle tombstones
    if (entry.deletedAt) {
      if (existing && existing.updatedAt >= entry.updatedAt && !existing.deletedAt) {
        // Existing non-tombstone is newer or same age - skip this tombstone
        continue;
      }
      // Preserve tombstone locally
      const tombstone: LocalChapterProgress = {
        cursorId,
        registryId: entry.registryId,
        sourceId: entry.sourceId,
        sourceMangaId: entry.sourceMangaId,
        sourceChapterId: entry.sourceChapterId,
        libraryItemId: entry.libraryItemId,
        progress: 0,
        total: 0,
        completed: false,
        lastReadAt: entry.lastReadAt,
        updatedAt: entry.updatedAt,
        deletedAt: entry.deletedAt,
      };
      await repo.saveChapterProgressEntry(tombstone);
      // Tombstones are not included in affected
      continue;
    }

    // For non-tombstones: check if existing is a tombstone that's newer
    if (existing?.deletedAt && existing.updatedAt >= entry.updatedAt) {
      // Existing tombstone is newer - don't resurrect
      continue;
    }

    if (!existing || existing.deletedAt) {
      // New entry or replacing a tombstone
      const progress: LocalChapterProgress = {
        cursorId,
        registryId: entry.registryId,
        sourceId: entry.sourceId,
        sourceMangaId: entry.sourceMangaId,
        sourceChapterId: entry.sourceChapterId,
        libraryItemId: entry.libraryItemId,
        progress: entry.progress,
        total: entry.total,
        completed: entry.completed,
        lastReadAt: entry.lastReadAt,
        chapterNumber: entry.chapterNumber,
        volumeNumber: entry.volumeNumber,
        chapterTitle: entry.chapterTitle,
        updatedAt: entry.updatedAt,
      };
      await repo.saveChapterProgressEntry(progress);
      affected.push(progress);
    } else {
      // High-water mark merge with existing non-tombstone
      const hasIncomingMeta =
        entry.chapterNumber !== undefined ||
        entry.volumeNumber !== undefined ||
        entry.chapterTitle !== undefined;

      const merged: LocalChapterProgress = {
        ...existing,
        libraryItemId: entry.libraryItemId ?? existing.libraryItemId,
        progress: Math.max(existing.progress, entry.progress),
        total: Math.max(existing.total, entry.total),
        completed: existing.completed || entry.completed,
        lastReadAt: Math.max(existing.lastReadAt, entry.lastReadAt),
        chapterNumber: hasIncomingMeta
          ? (entry.chapterNumber ?? existing.chapterNumber)
          : existing.chapterNumber,
        volumeNumber: hasIncomingMeta
          ? (entry.volumeNumber ?? existing.volumeNumber)
          : existing.volumeNumber,
        chapterTitle: hasIncomingMeta
          ? (entry.chapterTitle ?? existing.chapterTitle)
          : existing.chapterTitle,
        updatedAt: Math.max(existing.updatedAt, entry.updatedAt),
      };
      await repo.saveChapterProgressEntry(merged);
      affected.push(merged);
    }
  }

  return { affected, nextCursor: maxCursor };
}

/**
 * Apply manga progress (materialized summary).
 *
 * TOMBSTONE HANDLING: When `deletedAt` is set, we preserve the tombstone locally
 * instead of ignoring. This prevents resurrection if an older progress entry
 * arrives out-of-order. UI queries filter out tombstoned rows.
 */
export async function applyMangaProgress(
  entries: SyncMangaProgressEntry[],
  currentCursor: CompositeCursor,
  repo: MangaProgressRepo
): Promise<ApplyResult<LocalMangaProgress>> {
  if (entries.length === 0) {
    return { affected: [], nextCursor: currentCursor };
  }

  const affected: LocalMangaProgress[] = [];
  let maxCursor = currentCursor;

  for (const entry of entries) {
    const cursorId =
      entry.cursorId ||
      makeMangaProgressCursorId(entry.registryId, entry.sourceId, entry.sourceMangaId);

    // Track max cursor
    if (
      entry.updatedAt > maxCursor.updatedAt ||
      (entry.updatedAt === maxCursor.updatedAt && cursorId > maxCursor.cursorId)
    ) {
      maxCursor = { updatedAt: entry.updatedAt, cursorId };
    }

    const existing = await repo.getMangaProgressEntry?.(cursorId);

    // Handle tombstones
    if (entry.deletedAt) {
      if (existing && existing.updatedAt >= entry.updatedAt && !existing.deletedAt) {
        // Existing non-tombstone is newer or same age - skip this tombstone
        continue;
      }
      // Preserve tombstone locally
      const tombstone: LocalMangaProgress = {
        cursorId,
        registryId: entry.registryId,
        sourceId: entry.sourceId,
        sourceMangaId: entry.sourceMangaId,
        libraryItemId: entry.libraryItemId,
        lastReadAt: entry.lastReadAt,
        updatedAt: entry.updatedAt,
        deletedAt: entry.deletedAt,
      };
      await repo.saveMangaProgressEntry(tombstone);
      // Tombstones are not included in affected
      continue;
    }

    // For non-tombstones: check if existing is a tombstone that's newer
    if (existing?.deletedAt && existing.updatedAt >= entry.updatedAt) {
      // Existing tombstone is newer - don't resurrect
      continue;
    }

    const progress: LocalMangaProgress = {
      cursorId,
      registryId: entry.registryId,
      sourceId: entry.sourceId,
      sourceMangaId: entry.sourceMangaId,
      libraryItemId: entry.libraryItemId,
      lastReadAt: entry.lastReadAt,
      lastReadSourceChapterId: entry.lastReadSourceChapterId,
      lastReadChapterNumber: entry.lastReadChapterNumber,
      lastReadVolumeNumber: entry.lastReadVolumeNumber,
      lastReadChapterTitle: entry.lastReadChapterTitle,
      updatedAt: entry.updatedAt,
    };

    await repo.saveMangaProgressEntry(progress);
    affected.push(progress);
  }

  return { affected, nextCursor: maxCursor };
}

