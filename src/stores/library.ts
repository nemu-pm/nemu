import { create, type StoreApi, type UseBoundStore } from "zustand";
import type {
  ChapterSummary,
  LocalLibraryItem,
  LocalSourceLink,
  MangaMetadata,
  ExternalIds,
} from "@/data/schema";
import { makeSourceLinkId } from "@/data/schema";
import type { LibraryEntry } from "@/data/view";
import { safeErrorCategory } from "@/lib/error-diagnostic";
import { nextSyncTimestamp } from "@nemu/core";
import {
  StoreGenerationGate,
  type StoreGenerationToken,
} from "./sync-generation-gate";

/** Generate a UUID for new library entries */
function generateId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

// ============================================================================
// Canonical Library Store Interface (Phase 8 - simplified)
// ============================================================================

/**
 * Interface for canonical library operations.
 * Provider implements this with sync-aware wrappers.
 */
export interface CanonicalLibraryOps {
  // Read
  getLibraryEntries(): Promise<LibraryEntry[]>;
  getLibraryItem(libraryItemId: string): Promise<LocalLibraryItem | null>;
  getSourceLinksForItem(libraryItemId: string): Promise<LocalSourceLink[]>;

  // Write library items
  saveLibraryItem(
    item: LocalLibraryItem,
    expectedGeneration?: number | null,
  ): Promise<void>;
  removeLibraryItem(
    libraryItemId: string,
    expectedGeneration?: number | null,
  ): Promise<void>;

  // Write source links
  saveSourceLink(
    link: LocalSourceLink,
    expectedGeneration?: number | null,
  ): Promise<void>;
  removeSourceLink(
    registryId: string,
    sourceId: string,
    sourceMangaId: string,
    expectedGeneration?: number | null,
  ): Promise<void>;

  /** Atomically merge all local relationships and enqueue resumable cloud work. */
  mergeLibraryItems(
    targetLibraryItemId: string,
    sourceLibraryItemId: string,
    expectedGeneration?: number | null,
  ): Promise<boolean>;
  /** Best-effort replay of generation-scoped merge outbox entries. */
  retryPendingLibraryItemMerges?(): Promise<void>;
}

// ============================================================================
// Input types
// ============================================================================

/** Input for adding a new manga to library */
export interface AddToLibraryInput {
  metadata: MangaMetadata;
  externalIds?: ExternalIds;
  source: {
    registryId: string;
    sourceId: string;
    sourceMangaId: string;
    latestChapter?: ChapterSummary;
  };
}

/** Input for adding a source to existing library item */
export interface AddSourceInput {
  registryId: string;
  sourceId: string;
  sourceMangaId: string;
  latestChapter?: ChapterSummary;
}

// ============================================================================
// Library State
// ============================================================================

interface LibraryState {
  entries: LibraryEntry[];
  loading: boolean;
  error: string | null;
  syncGeneration: number | null;

  // Actions
  /**
   * Load library from store.
   *
   * - keepLoading=false (default): this is a foreground load; flips `loading` true → false.
   * - keepLoading=true: this is a background refresh; does NOT change `loading` (prevents UI from getting stuck in skeleton).
   */
  load: (keepLoading?: boolean) => Promise<void>;
  prepareSyncGeneration: (
    generation: number,
    readiness?: Promise<unknown>,
  ) => void;
  replaceSyncSnapshot: (entries: LibraryEntry[], generation: number) => void;

  /** Add a new manga to library (generates UUID) */
  add: (input: AddToLibraryInput) => Promise<LibraryEntry>;

  /** Add a source to an existing library item */
  addSource: (libraryItemId: string, source: AddSourceInput) => Promise<void>;

  /** Remove a source from a library item */
  removeSource: (
    libraryItemId: string,
    registryId: string,
    sourceId: string,
    sourceMangaId: string,
  ) => Promise<void>;

  /** Reorder sources for a library item */
  reorderSources: (libraryItemId: string, sourceIds: string[]) => void;

  /** Remove item from library (hard delete) */
  remove: (libraryItemId: string) => Promise<void>;

  /** Get entry by libraryItemId */
  get: (libraryItemId: string) => LibraryEntry | undefined;

  /** Get entry by source reference */
  getBySource: (
    registryId: string,
    sourceId: string,
    sourceMangaId: string,
  ) => LibraryEntry | undefined;

  /** Check if source is in library */
  isInLibrary: (
    registryId: string,
    sourceId: string,
    sourceMangaId: string,
  ) => boolean;

  /** Update metadata (from external APIs) */
  updateMetadata: (
    libraryItemId: string,
    metadata: MangaMetadata,
    externalIds?: ExternalIds,
  ) => Promise<void>;

  /** Update user metadata overrides */
  updateOverrides: (
    libraryItemId: string,
    overrides: Partial<MangaMetadata>,
  ) => Promise<void>;

  /** Clear user overrides */
  clearOverrides: (libraryItemId: string) => Promise<void>;

  /** Update user cover override */
  updateCoverOverride: (
    libraryItemId: string,
    coverUrl: string | null,
  ) => Promise<void>;

  /** Update all user edits in one operation (metadata overrides + cover + externalIds) */
  updateUserEdits: (
    libraryItemId: string,
    edits: {
      metadataOverrides?: Partial<MangaMetadata>;
      coverUrl?: string | null;
      externalIds?: ExternalIds;
    },
  ) => Promise<void>;

  /** Merge another library item into this one (moves sources, deletes other) */
  mergeManga: (
    targetLibraryItemId: string,
    sourceLibraryItemId: string,
  ) => Promise<void>;

  /** Acknowledge updates for a source */
  acknowledgeUpdate: (
    registryId: string,
    sourceId: string,
    sourceMangaId: string,
    latestChapter: ChapterSummary,
  ) => Promise<void>;

  /** Update latestChapter for a source (triggers "Updated" badge) */
  updateLatestChapter: (
    registryId: string,
    sourceId: string,
    sourceMangaId: string,
    latestChapter: ChapterSummary,
  ) => Promise<void>;
}

export type LibraryStore = UseBoundStore<StoreApi<LibraryState>>;

// ============================================================================
// Store Factory
// ============================================================================

let storeCounter = 0;

export function createLibraryStore(ops: CanonicalLibraryOps): LibraryStore {
  const storeId = ++storeCounter;
  let pendingRetry: ReturnType<typeof setTimeout> | null = null;
  let retryAttempts = 0;
  // Latest-load-wins guard. Prevents stale loads (e.g. during profile switches)
  // from overwriting the current state or reporting spurious errors.
  let loadSeq = 0;
  const generationGate = new StoreGenerationGate();

  const store = create<LibraryState>((set, get) => {
    const beginAction = async (): Promise<StoreGenerationToken> => {
      const token = generationGate.capture();
      if (!(await generationGate.wait(token))) {
        throw new Error(
          "Library action cancelled because synced account data was reset.",
        );
      }
      return token;
    };
    const setIfCurrent = (
      token: StoreGenerationToken,
      update:
        | Partial<LibraryState>
        | ((state: LibraryState) => Partial<LibraryState>),
    ) => {
      if (generationGate.isCurrent(token)) set(update);
    };

    return {
      entries: [],
      loading: true,
      error: null,
      syncGeneration: null,

      prepareSyncGeneration: (generation, readiness) => {
        if (!generationGate.prepare(generation, readiness)) return;
        loadSeq += 1;
        retryAttempts = 0;
        if (pendingRetry) clearTimeout(pendingRetry);
        pendingRetry = null;
        set({
          entries: [],
          loading: true,
          error: null,
          syncGeneration: generation,
        });
      },

      replaceSyncSnapshot: (entries, generation) => {
        if (generationGate.currentGeneration !== generation) return;
        set({
          entries,
          loading: false,
          error: null,
          syncGeneration: generation,
        });
      },

      load: async (keepLoading = false) => {
        const seq = ++loadSeq;
        const token = generationGate.capture();
        try {
          if (!(await generationGate.wait(token))) return;
          if (!keepLoading) {
            setIfCurrent(token, { loading: true, error: null });
            retryAttempts = 0;
          } else {
            setIfCurrent(token, { error: null });
          }
          const entries = await ops.getLibraryEntries();
          if (seq !== loadSeq || !generationGate.isCurrent(token)) return;

          // NOTE: During sync (or partial hydration), library_items may arrive before source_links.
          // Keep the UI stable by *temporarily* hiding entries with no sources, and scheduling a retry.
          // This avoids treating a transient state as corruption/tombstone.
          const invalid = entries.filter(
            (e) => !e.sources || e.sources.length === 0,
          );
          const valid = entries.filter(
            (e) => e.sources && e.sources.length > 0,
          );
          if (invalid.length > 0) {
            console.warn(
              "[LibraryStore] load(): hiding invalid library entries (missing sources)",
              {
                storeId,
                count: invalid.length,
              },
            );

            // Retry a few times to let source_links hydrate before the UI gets "stuck" hiding items.
            retryAttempts += 1;
            if (retryAttempts <= 6) {
              if (pendingRetry) clearTimeout(pendingRetry);
              pendingRetry = setTimeout(() => {
                pendingRetry = null;
                // Background refresh: don't flip loading skeletons again.
                get()
                  .load(true)
                  .catch(() => {});
              }, 250);
            }
          }

          if (!keepLoading) {
            setIfCurrent(token, { entries: valid, loading: false });
          } else {
            // Background refresh: keep current loading state unchanged.
            setIfCurrent(token, { entries: valid });
          }
          // A prior session may have committed locally before its idempotent
          // cloud follow-up completed. Never block rendering on this replay.
          void ops.retryPendingLibraryItemMerges?.();
        } catch (e) {
          if (seq !== loadSeq || !generationGate.isCurrent(token)) return;
          console.error("[LibraryStore] Load error:", safeErrorCategory(e));
          setIfCurrent(token, {
            error: e instanceof Error ? e.message : String(e),
            loading: false,
          });
        }
      },

      add: async (input) => {
        const token = await beginAction();
        const now = nextSyncTimestamp();
        const libraryItemId = generateId();

        const item: LocalLibraryItem = {
          libraryItemId,
          metadata: input.metadata,
          externalIds: input.externalIds,
          inLibrary: true,
          createdAt: now,
          updatedAt: now,
        };

        const source: LocalSourceLink = {
          id: makeSourceLinkId(
            input.source.registryId,
            input.source.sourceId,
            input.source.sourceMangaId,
          ),
          libraryItemId,
          registryId: input.source.registryId,
          sourceId: input.source.sourceId,
          sourceMangaId: input.source.sourceMangaId,
          latestChapter: input.source.latestChapter,
          updateAckChapter: input.source.latestChapter, // Initialize acknowledged = latest
          createdAt: now,
          updatedAt: now,
        };

        try {
          await ops.saveLibraryItem(item, token.generation);
          if (!generationGate.isCurrent(token)) {
            throw new Error(
              "Library add cancelled because synced account data was reset.",
            );
          }
          await ops.saveSourceLink(source, token.generation);

          const entry: LibraryEntry = { item, sources: [source] };
          setIfCurrent(token, (state) => ({
            entries: [...state.entries, entry],
          }));
          return entry;
        } catch (e) {
          console.error("[LibraryStore] Add error:", safeErrorCategory(e));
          throw e;
        }
      },

      addSource: async (libraryItemId, sourceInput) => {
        const token = await beginAction();
        const entry = get().get(libraryItemId);
        if (!entry) return;

        const id = makeSourceLinkId(
          sourceInput.registryId,
          sourceInput.sourceId,
          sourceInput.sourceMangaId,
        );

        // Check if source already exists
        if (entry.sources.some((s) => s.id === id)) return;

        const now = nextSyncTimestamp(entry.item.updatedAt);
        const source: LocalSourceLink = {
          id,
          libraryItemId,
          registryId: sourceInput.registryId,
          sourceId: sourceInput.sourceId,
          sourceMangaId: sourceInput.sourceMangaId,
          latestChapter: sourceInput.latestChapter,
          updateAckChapter: sourceInput.latestChapter,
          createdAt: now,
          updatedAt: now,
        };

        try {
          await ops.saveSourceLink(source, token.generation);
          setIfCurrent(token, (state) => ({
            entries: state.entries.map((e) =>
              e.item.libraryItemId === libraryItemId
                ? { ...e, sources: [...e.sources, source] }
                : e,
            ),
          }));
        } catch (e) {
          console.error(
            "[LibraryStore] addSource error:",
            safeErrorCategory(e),
          );
          throw e;
        }
      },

      removeSource: async (
        libraryItemId,
        registryId,
        sourceId,
        sourceMangaId,
      ) => {
        const token = await beginAction();
        const entry = get().get(libraryItemId);
        if (!entry) return;

        // Can't remove last source
        if (entry.sources.length <= 1) {
          console.warn("[LibraryStore] Cannot remove last source");
          return;
        }

        const id = makeSourceLinkId(registryId, sourceId, sourceMangaId);

        try {
          await ops.removeSourceLink(
            registryId,
            sourceId,
            sourceMangaId,
            token.generation,
          );
          setIfCurrent(token, (state) => ({
            entries: state.entries.map((e) =>
              e.item.libraryItemId === libraryItemId
                ? { ...e, sources: e.sources.filter((s) => s.id !== id) }
                : e,
            ),
          }));
        } catch (e) {
          console.error(
            "[LibraryStore] removeSource error:",
            safeErrorCategory(e),
          );
          throw e;
        }
      },

      reorderSources: (libraryItemId, sourceIds) => {
        const token = generationGate.capture();
        void (async () => {
          if (!(await generationGate.wait(token))) return;
          const entry = get().get(libraryItemId);
          if (!entry) return;

          // Update item with new sourceOrder
          const updated: LocalLibraryItem = {
            ...entry.item,
            sourceOrder: sourceIds,
            updatedAt: nextSyncTimestamp(entry.item.updatedAt),
          };

          // Optimistic update: update state immediately
          setIfCurrent(token, (state) => ({
            entries: state.entries.map((e) => {
              if (e.item.libraryItemId !== libraryItemId) return e;
              return { ...e, item: updated };
            }),
          }));

          // Persist to IndexedDB in background (will sync to cloud)
          ops.saveLibraryItem(updated, token.generation).catch((e) => {
            console.error(
              "[LibraryStore] reorderSources save error:",
              safeErrorCategory(e),
            );
            // Could rollback here, but sync will eventually fix it
          });
        })();
      },

      mergeManga: async (targetLibraryItemId, sourceLibraryItemId) => {
        const token = await beginAction();
        const targetEntry = get().get(targetLibraryItemId);
        const sourceEntry = get().get(sourceLibraryItemId);

        if (!targetEntry || !sourceEntry) {
          console.error("[LibraryStore] mergeManga: entry not found");
          return;
        }

        // Can't merge with self
        if (targetLibraryItemId === sourceLibraryItemId) {
          console.warn("[LibraryStore] mergeManga: cannot merge with self");
          return;
        }

        try {
          const committed = await ops.mergeLibraryItems(
            targetLibraryItemId,
            sourceLibraryItemId,
            token.generation,
          );
          if (!generationGate.isCurrent(token)) return;
          if (!committed) {
            // Another tab may already have completed this exact semantic merge.
            // A no-op still reloads the canonical join so this stale view drops
            // its retired source entry instead of displaying a phantom success.
            await get().load(true);
            return;
          }

          // Re-read the canonical join after the all-relationship transaction.
          // Constructing a partial optimistic entry here would bypass the
        // collection/history migration and can resurrect stale state after a
        // generation reset.
        await get().load(true);
      } catch (e) {
          console.error(
            "[LibraryStore] mergeManga error:",
            safeErrorCategory(e),
          );
          throw e;
        }
      },

      remove: async (libraryItemId) => {
        const token = await beginAction();
        try {
          await ops.removeLibraryItem(libraryItemId, token.generation);
          setIfCurrent(token, (state) => ({
            entries: state.entries.filter(
              (e) => e.item.libraryItemId !== libraryItemId,
            ),
          }));
        } catch (e) {
          console.error("[LibraryStore] Remove error:", safeErrorCategory(e));
          throw e;
        }
      },

      get: (libraryItemId) => {
        return get().entries.find(
          (e) => e.item.libraryItemId === libraryItemId,
        );
      },

      getBySource: (registryId, sourceId, sourceMangaId) => {
        const id = makeSourceLinkId(registryId, sourceId, sourceMangaId);
        return get().entries.find((e) => e.sources.some((s) => s.id === id));
      },

      isInLibrary: (registryId, sourceId, sourceMangaId) => {
        return (
          get().getBySource(registryId, sourceId, sourceMangaId) !== undefined
        );
      },

      updateMetadata: async (libraryItemId, metadata, externalIds) => {
        const token = await beginAction();
        const entry = get().get(libraryItemId);
        if (!entry) return;

        const updated: LocalLibraryItem = {
          ...entry.item,
          metadata,
          externalIds: externalIds ?? entry.item.externalIds,
          updatedAt: nextSyncTimestamp(entry.item.updatedAt),
        };

        try {
          await ops.saveLibraryItem(updated, token.generation);
          setIfCurrent(token, (state) => ({
            entries: state.entries.map((e) =>
              e.item.libraryItemId === libraryItemId
                ? { ...e, item: updated }
                : e,
            ),
          }));
        } catch (e) {
          console.error(
            "[LibraryStore] updateMetadata error:",
            safeErrorCategory(e),
          );
          throw e;
        }
      },

      updateOverrides: async (libraryItemId, overrides) => {
        const token = await beginAction();
        const entry = get().get(libraryItemId);
        if (!entry) return;

        const updated: LocalLibraryItem = {
          ...entry.item,
          overrides: {
            ...entry.item.overrides,
            metadata: { ...entry.item.overrides?.metadata, ...overrides },
          },
          updatedAt: nextSyncTimestamp(entry.item.updatedAt),
        };

        try {
          await ops.saveLibraryItem(updated, token.generation);
          setIfCurrent(token, (state) => ({
            entries: state.entries.map((e) =>
              e.item.libraryItemId === libraryItemId
                ? { ...e, item: updated }
                : e,
            ),
          }));
        } catch (e) {
          console.error(
            "[LibraryStore] updateOverrides error:",
            safeErrorCategory(e),
          );
          throw e;
        }
      },

      clearOverrides: async (libraryItemId) => {
        const token = await beginAction();
        const entry = get().get(libraryItemId);
        if (!entry) return;

        const updated: LocalLibraryItem = {
          ...entry.item,
          overrides: entry.item.overrides
            ? {
                ...entry.item.overrides,
                metadata: null, // Explicit clear
              }
            : undefined,
          updatedAt: nextSyncTimestamp(entry.item.updatedAt),
        };

        try {
          await ops.saveLibraryItem(updated, token.generation);
          setIfCurrent(token, (state) => ({
            entries: state.entries.map((e) =>
              e.item.libraryItemId === libraryItemId
                ? { ...e, item: updated }
                : e,
            ),
          }));
        } catch (e) {
          console.error(
            "[LibraryStore] clearOverrides error:",
            safeErrorCategory(e),
          );
          throw e;
        }
      },

      updateCoverOverride: async (libraryItemId, coverUrl) => {
        const token = await beginAction();
        const entry = get().get(libraryItemId);
        if (!entry) return;

        const updated: LocalLibraryItem = {
          ...entry.item,
          overrides: {
            ...entry.item.overrides,
            coverUrl,
          },
          updatedAt: nextSyncTimestamp(entry.item.updatedAt),
        };

        try {
          await ops.saveLibraryItem(updated, token.generation);
          setIfCurrent(token, (state) => ({
            entries: state.entries.map((e) =>
              e.item.libraryItemId === libraryItemId
                ? { ...e, item: updated }
                : e,
            ),
          }));
        } catch (e) {
          console.error(
            "[LibraryStore] updateCoverOverride error:",
            safeErrorCategory(e),
          );
          throw e;
        }
      },

      updateUserEdits: async (libraryItemId, edits) => {
        const token = await beginAction();
        const entry = get().get(libraryItemId);
        if (!entry) return;

        const { metadataOverrides, coverUrl, externalIds } = edits;

        // Merge metadata, treating undefined values as "remove this key"
        let mergedMetadata = entry.item.overrides?.metadata;
        if (metadataOverrides) {
          const merged = { ...mergedMetadata, ...metadataOverrides };
          // Strip undefined values to actually remove cleared overrides
          mergedMetadata = Object.fromEntries(
            Object.entries(merged).filter(([, v]) => v !== undefined),
          ) as typeof mergedMetadata;
          // If empty, set to undefined to clean up
          if (Object.keys(mergedMetadata ?? {}).length === 0)
            mergedMetadata = undefined;
        }

        const updated: LocalLibraryItem = {
          ...entry.item,
          overrides: {
            ...entry.item.overrides,
            metadata: mergedMetadata,
            coverUrl:
              coverUrl !== undefined
                ? coverUrl
                : entry.item.overrides?.coverUrl,
          },
          externalIds: externalIds
            ? { ...entry.item.externalIds, ...externalIds }
            : entry.item.externalIds,
          updatedAt: nextSyncTimestamp(entry.item.updatedAt),
        };

        try {
          await ops.saveLibraryItem(updated, token.generation);
          setIfCurrent(token, (state) => ({
            entries: state.entries.map((e) =>
              e.item.libraryItemId === libraryItemId
                ? { ...e, item: updated }
                : e,
            ),
          }));
        } catch (e) {
          console.error(
            "[LibraryStore] updateUserEdits error:",
            safeErrorCategory(e),
          );
          throw e;
        }
      },

      acknowledgeUpdate: async (
        registryId,
        sourceId,
        sourceMangaId,
        latestChapter,
      ) => {
        const token = await beginAction();
        const id = makeSourceLinkId(registryId, sourceId, sourceMangaId);
        const entry = get().entries.find((e) =>
          e.sources.some((s) => s.id === id),
        );
        if (!entry) return;

        const source = entry.sources.find((s) => s.id === id);
        if (!source) return;

        const now = nextSyncTimestamp(source.updatedAt);
        const updatedSource: LocalSourceLink = {
          ...source,
          latestChapter,
          updateAckChapter: latestChapter,
          updateAckAt: now,
          updatedAt: now,
        };

        try {
          await ops.saveSourceLink(updatedSource, token.generation);
          setIfCurrent(token, (state) => ({
            entries: state.entries.map((e) =>
              e.item.libraryItemId === entry.item.libraryItemId
                ? {
                    ...e,
                    sources: e.sources.map((s) =>
                      s.id === id ? updatedSource : s,
                    ),
                  }
                : e,
            ),
          }));
        } catch (e) {
          console.error(
            "[LibraryStore] acknowledgeUpdate error:",
            safeErrorCategory(e),
          );
        }
      },

      updateLatestChapter: async (
        registryId,
        sourceId,
        sourceMangaId,
        latestChapter,
      ) => {
        const token = await beginAction();
        const id = makeSourceLinkId(registryId, sourceId, sourceMangaId);
        const entry = get().entries.find((e) =>
          e.sources.some((s) => s.id === id),
        );
        if (!entry) return;

        const source = entry.sources.find((s) => s.id === id);
        if (!source) return;

        const now = nextSyncTimestamp(source.updatedAt);
        const updatedSource: LocalSourceLink = {
          ...source,
          latestChapter,
          latestFetchedAt: now,
          // Initialize ack if first time
          updateAckChapter: source.updateAckChapter ?? latestChapter,
          updatedAt: now,
        };

        try {
          await ops.saveSourceLink(updatedSource, token.generation);
          setIfCurrent(token, (state) => ({
            entries: state.entries.map((e) =>
              e.item.libraryItemId === entry.item.libraryItemId
                ? {
                    ...e,
                    sources: e.sources.map((s) =>
                      s.id === id ? updatedSource : s,
                    ),
                  }
                : e,
            ),
          }));
        } catch (e) {
          console.error(
            "[LibraryStore] updateLatestChapter error:",
            safeErrorCategory(e),
          );
        }
      },
    };
  });

  return store;
}
