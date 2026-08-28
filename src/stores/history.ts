import { create, type StoreApi, type UseBoundStore } from "zustand";
import type { LocalChapterProgress } from "@/data/schema";
import { makeChapterProgressId } from "@/data/schema";
import {
  estimatedSyncServerTime,
  mergeChapterProgressForSave,
  nextSyncTimestamp,
} from "@nemu/core";

/** Ops interface for history store (canonical progress tables) */
export interface HistoryStoreOps {
  getChapterProgress(
    registryId: string,
    sourceId: string,
    mangaId: string,
    chapterId: string,
  ): Promise<LocalChapterProgress | null>;
  saveChapterProgress(
    progress: LocalChapterProgress,
    expectedGeneration?: number | null,
  ): Promise<LocalChapterProgress>;
  getMangaChapterProgress(
    registryId: string,
    sourceId: string,
    mangaId: string,
  ): Promise<Record<string, LocalChapterProgress>>;
}

export interface HistoryState {
  // Cache of loaded progress entries (keyed by id)
  entries: Map<string, LocalChapterProgress>;
  // The generation represented by this cache. It is intentionally independent
  // from IndexedDB so a generation reset can invalidate warm React state before
  // an asynchronous snapshot finishes applying.
  syncGeneration: number | null;

  // Actions
  prepareSyncGeneration: (
    generation: number,
    readiness?: Promise<unknown>,
  ) => void;
  replaceSyncSnapshot: (
    progress: LocalChapterProgress[],
    generation: number,
  ) => void;
  /** Keep warm cache linkage aligned with an atomic library-item merge. */
  retargetLibraryItem: (
    sourceLibraryItemId: string,
    targetLibraryItemId: string,
    updatedAt: number,
    expectedGeneration?: number | null,
  ) => void;
  getProgress: (
    registryId: string,
    sourceId: string,
    mangaId: string,
    chapterId: string,
  ) => Promise<LocalChapterProgress | null>;
  getMangaProgress: (
    registryId: string,
    sourceId: string,
    mangaId: string,
  ) => Promise<Record<string, LocalChapterProgress>>;
  saveProgress: (
    registryId: string,
    sourceId: string,
    mangaId: string,
    chapterId: string,
    progress: number,
    total: number,
    chapterMeta?: {
      chapterNumber?: number;
      volumeNumber?: number;
      chapterTitle?: string;
    },
  ) => Promise<void>;
  markCompleted: (
    registryId: string,
    sourceId: string,
    mangaId: string,
    chapterId: string,
    total?: number,
    chapterMeta?: {
      chapterNumber?: number;
      volumeNumber?: number;
      chapterTitle?: string;
    },
  ) => Promise<void>;
}

export type HistoryStore = UseBoundStore<StoreApi<HistoryState>>;

export function createHistoryStore(ops: HistoryStoreOps): HistoryStore {
  return create<HistoryState>((set, get) => {
    let readinessGeneration: number | null = null;
    let generationReadiness: Promise<void> = Promise.resolve();
    let readinessPending = false;
    let readinessRevision = 0;

    const pendingReadinessForCurrentGeneration = (): Promise<void> | null =>
      readinessPending && readinessGeneration === get().syncGeneration
        ? generationReadiness
        : null;

    const waitForCurrentGeneration = async (): Promise<number | null> => {
      while (true) {
        const expectedGeneration = get().syncGeneration;
        const readiness = pendingReadinessForCurrentGeneration();
        if (readiness) await readiness;
        if (
          get().syncGeneration === expectedGeneration &&
          !pendingReadinessForCurrentGeneration()
        ) {
          return expectedGeneration;
        }
      }
    };

    return {
      entries: new Map(),
      syncGeneration: null,

      prepareSyncGeneration: (generation, readiness) => {
        const currentGeneration = get().syncGeneration;
        if (currentGeneration !== null && generation < currentGeneration) {
          return;
        }

        if (currentGeneration === generation && readiness === undefined) return;

        readinessGeneration = generation;
        readinessRevision += 1;
        const revision = readinessRevision;
        readinessPending = readiness !== undefined;
        generationReadiness = Promise.resolve(readiness).then(() => {
          if (
            readinessRevision === revision &&
            readinessGeneration === generation
          ) {
            readinessPending = false;
          }
        });
        // Reads and writes await this exact promise. Attach a passive rejection
        // handler as well so a failed reset does not become an unhandled promise
        // when the user performs no history action before the snapshot retry.
        void generationReadiness.catch(() => undefined);
        set({ entries: new Map(), syncGeneration: generation });
      },

      replaceSyncSnapshot: (progress, generation) => {
        set((state) => {
          if (
            state.syncGeneration !== null &&
            generation < state.syncGeneration
          ) {
            return state;
          }
          const snapshot = new Map(progress.map((entry) => [entry.id, entry]));
          if (state.syncGeneration !== generation) {
            return { entries: snapshot, syncGeneration: generation };
          }

          // The IndexedDB snapshot transaction and a local save can complete in
          // either order. A same-generation local save always advances its clock,
          // so preserve only cache rows that are strictly newer than the completed
          // snapshot. Equal clocks remain snapshot/server authoritative.
          for (const cached of state.entries.values()) {
            const applied = snapshot.get(cached.id);
            if (!applied) {
              snapshot.set(cached.id, cached);
            } else if (cached.updatedAt > applied.updatedAt) {
              snapshot.set(
                cached.id,
                mergeChapterProgressForSave(applied, cached),
              );
            }
          }
          return { entries: snapshot };
        });
      },

      retargetLibraryItem: (
        sourceLibraryItemId,
        targetLibraryItemId,
        updatedAt,
        expectedGeneration,
      ) => {
        set((state) => {
          if (
            expectedGeneration !== undefined &&
            state.syncGeneration !== expectedGeneration
          ) {
            return state;
          }
          let changed = false;
          const entries = new Map(state.entries);
          for (const [id, entry] of entries) {
            if (entry.libraryItemId !== sourceLibraryItemId) continue;
            entries.set(id, {
              ...entry,
              libraryItemId: targetLibraryItemId,
              updatedAt: Math.max(entry.updatedAt, updatedAt),
            });
            changed = true;
          }
          return changed ? { entries } : state;
        });
      },

      getProgress: async (registryId, sourceId, mangaId, chapterId) => {
        let expectedGeneration = get().syncGeneration;
        if (pendingReadinessForCurrentGeneration()) {
          expectedGeneration = await waitForCurrentGeneration();
        }
        const id = makeChapterProgressId(
          registryId,
          sourceId,
          mangaId,
          chapterId,
        );
        const cached = get().entries.get(id);
        if (cached) return cached;

        const entry = await ops.getChapterProgress(
          registryId,
          sourceId,
          mangaId,
          chapterId,
        );
        if (get().syncGeneration !== expectedGeneration) {
          return get().entries.get(id) ?? null;
        }
        const cachedAfterRead = get().entries.get(id);
        if (!entry) return cachedAfterRead ?? null;
        const resolved = cachedAfterRead
          ? mergeChapterProgressForSave(entry, cachedAfterRead)
          : entry;
        set((state) => ({
          entries: new Map(state.entries).set(id, resolved),
        }));
        return resolved;
      },

      getMangaProgress: async (registryId, sourceId, mangaId) => {
        let expectedGeneration = get().syncGeneration;
        if (pendingReadinessForCurrentGeneration()) {
          expectedGeneration = await waitForCurrentGeneration();
        }
        const progressMap = await ops.getMangaChapterProgress(
          registryId,
          sourceId,
          mangaId,
        );
        if (get().syncGeneration !== expectedGeneration) {
          return Object.fromEntries(
            [...get().entries.values()]
              .filter(
                (entry) =>
                  entry.registryId === registryId &&
                  entry.sourceId === sourceId &&
                  entry.sourceMangaId === mangaId,
              )
              .map((entry) => [entry.sourceChapterId, entry]),
          );
        }

        let resolvedProgress: Record<string, LocalChapterProgress> = {};
        set((state) => {
          const newEntries = new Map(state.entries);
          resolvedProgress = Object.fromEntries(
            [...state.entries.values()]
              .filter(
                (entry) =>
                  entry.registryId === registryId &&
                  entry.sourceId === sourceId &&
                  entry.sourceMangaId === mangaId,
              )
              .map((entry) => [entry.sourceChapterId, entry]),
          );
          for (const entry of Object.values(progressMap)) {
            const cached = newEntries.get(entry.id);
            const resolved = cached
              ? mergeChapterProgressForSave(entry, cached)
              : entry;
            newEntries.set(entry.id, resolved);
            resolvedProgress[resolved.sourceChapterId] = resolved;
          }
          return { entries: newEntries };
        });

        return resolvedProgress;
      },

      saveProgress: async (
        registryId,
        sourceId,
        mangaId,
        chapterId,
        progress,
        total,
        chapterMeta,
      ) => {
        let expectedGeneration = get().syncGeneration;
        if (pendingReadinessForCurrentGeneration()) {
          expectedGeneration = await waitForCurrentGeneration();
        }
        const id = makeChapterProgressId(
          registryId,
          sourceId,
          mangaId,
          chapterId,
        );
        const existing = get().entries.get(id);
        const lastReadAt = estimatedSyncServerTime();
        const updatedAt = nextSyncTimestamp(existing?.updatedAt);

        // High-water mark: keep highest progress seen, preserve completed state
        const entry: LocalChapterProgress = {
          id,
          registryId,
          sourceId,
          sourceMangaId: mangaId,
          sourceChapterId: chapterId,
          progress: existing ? Math.max(existing.progress, progress) : progress,
          total: existing ? Math.max(existing.total, total) : total,
          completed: existing?.completed ?? false,
          lastReadAt,
          // Include chapter metadata (prefer new, fall back to existing)
          chapterNumber: chapterMeta?.chapterNumber ?? existing?.chapterNumber,
          volumeNumber: chapterMeta?.volumeNumber ?? existing?.volumeNumber,
          chapterTitle: chapterMeta?.chapterTitle ?? existing?.chapterTitle,
          updatedAt,
        };

        const saved = await ops.saveChapterProgress(entry, expectedGeneration);

        set((state) => {
          if (state.syncGeneration !== expectedGeneration) return state;
          const entries = new Map(state.entries);
          entries.set(id, mergeChapterProgressForSave(entries.get(id), saved));
          return { entries };
        });
      },

      markCompleted: async (
        registryId,
        sourceId,
        mangaId,
        chapterId,
        total?: number,
        chapterMeta?,
      ) => {
        let expectedGeneration = get().syncGeneration;
        if (pendingReadinessForCurrentGeneration()) {
          expectedGeneration = await waitForCurrentGeneration();
        }
        const id = makeChapterProgressId(
          registryId,
          sourceId,
          mangaId,
          chapterId,
        );
        const existing = get().entries.get(id);
        const lastReadAt = estimatedSyncServerTime();
        const updatedAt = nextSyncTimestamp(existing?.updatedAt);

        // Use provided total, or existing, or 0
        const finalTotal = total ?? existing?.total ?? 0;

        const entry: LocalChapterProgress = {
          id,
          registryId,
          sourceId,
          sourceMangaId: mangaId,
          sourceChapterId: chapterId,
          // When marking completed, progress should be last page (total - 1)
          progress: finalTotal > 0 ? finalTotal - 1 : (existing?.progress ?? 0),
          total: finalTotal,
          completed: true,
          lastReadAt,
          // Include chapter metadata
          chapterNumber: chapterMeta?.chapterNumber ?? existing?.chapterNumber,
          volumeNumber: chapterMeta?.volumeNumber ?? existing?.volumeNumber,
          chapterTitle: chapterMeta?.chapterTitle ?? existing?.chapterTitle,
          updatedAt,
        };

        const saved = await ops.saveChapterProgress(entry, expectedGeneration);

        set((state) => {
          if (state.syncGeneration !== expectedGeneration) return state;
          const entries = new Map(state.entries);
          entries.set(id, mergeChapterProgressForSave(entries.get(id), saved));
          return { entries };
        });
      },
    };
  });
}
