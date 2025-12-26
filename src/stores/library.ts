import { create, type StoreApi, type UseBoundStore } from "zustand";
import type {
  ChapterSummary,
  LocalLibraryItem,
  LocalSourceLink,
  MangaMetadata,
  ExternalIds,
  IntentClock,
} from "@/data/schema";
import { makeSourceLinkCursorId } from "@/data/schema";
import type { LibraryEntry } from "@/data/view";

/** Generate a UUID for new library entries */
function generateId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

// ============================================================================
// Canonical Library Store Interface
// ============================================================================

/**
 * Clock options for save operations.
 * - `undefined` = no clock change (preserve existing)
 * - `null` = generate new clock (user intent changed)
 * - `string` = use provided clock value
 */
export interface SaveItemClocks {
  inLibraryClock?: IntentClock | null;
  metadataClock?: IntentClock | null;
  coverUrlClock?: IntentClock | null;
}

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
  saveLibraryItem(item: LocalLibraryItem, clocks?: SaveItemClocks): Promise<void>;
  removeLibraryItem(libraryItemId: string, inLibraryClock?: IntentClock): Promise<void>;

  // Write source links
  saveSourceLink(link: LocalSourceLink): Promise<void>;
  removeSourceLink(cursorId: string): Promise<void>;
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

  // Actions
  /** Load library from store. If keepLoading=true, don't set loading=false (for sync) */
  load: (keepLoading?: boolean) => Promise<void>;
  
  /** Add a new manga to library (generates UUID) */
  add: (input: AddToLibraryInput) => Promise<LibraryEntry>;
  
  /** Add a source to an existing library item */
  addSource: (libraryItemId: string, source: AddSourceInput) => Promise<void>;
  
  /** Remove a source from a library item */
  removeSource: (libraryItemId: string, registryId: string, sourceId: string, sourceMangaId: string) => Promise<void>;
  
  /** Remove item from library (soft delete) */
  remove: (libraryItemId: string) => Promise<void>;
  
  /** Get entry by libraryItemId */
  get: (libraryItemId: string) => LibraryEntry | undefined;
  
  /** Get entry by source reference */
  getBySource: (registryId: string, sourceId: string, sourceMangaId: string) => LibraryEntry | undefined;
  
  /** Check if source is in library */
  isInLibrary: (registryId: string, sourceId: string, sourceMangaId: string) => boolean;
  
  /** Update metadata (from external APIs) */
  updateMetadata: (libraryItemId: string, metadata: MangaMetadata, externalIds?: ExternalIds) => Promise<void>;
  
  /** Update user metadata overrides */
  updateOverrides: (libraryItemId: string, overrides: Partial<MangaMetadata>) => Promise<void>;
  
  /** Clear user overrides */
  clearOverrides: (libraryItemId: string) => Promise<void>;
  
  /** Update user cover override */
  updateCoverOverride: (libraryItemId: string, coverUrl: string | null) => Promise<void>;
  
  /** Acknowledge updates for a source */
  acknowledgeUpdate: (
    registryId: string,
    sourceId: string,
    sourceMangaId: string,
    latestChapter: ChapterSummary
  ) => Promise<void>;
  
  /** Update latestChapter for a source (triggers "Updated" badge) */
  updateLatestChapter: (
    registryId: string,
    sourceId: string,
    sourceMangaId: string,
    latestChapter: ChapterSummary
  ) => Promise<void>;
}

export type LibraryStore = UseBoundStore<StoreApi<LibraryState>>;

// ============================================================================
// Store Factory
// ============================================================================

export function createLibraryStore(ops: CanonicalLibraryOps): LibraryStore {
  return create<LibraryState>((set, get) => ({
    entries: [],
    loading: true,
    error: null,

    load: async (keepLoading = false) => {
      try {
        set({ loading: true, error: null });
        const entries = await ops.getLibraryEntries();
        set({ entries, loading: keepLoading });
      } catch (e) {
        console.error("[LibraryStore] Load error:", e);
        set({
          error: e instanceof Error ? e.message : String(e),
          loading: false,
        });
      }
    },

    add: async (input) => {
      const now = Date.now();
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
        cursorId: makeSourceLinkCursorId(input.source.registryId, input.source.sourceId, input.source.sourceMangaId),
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
        // Save with membership clock (null = generate new clock)
        await ops.saveLibraryItem(item, { inLibraryClock: null });
        await ops.saveSourceLink(source);

        const entry: LibraryEntry = { item, sources: [source] };
        set((state) => ({
          entries: [...state.entries, entry],
        }));
        return entry;
      } catch (e) {
        console.error("[LibraryStore] Add error:", e);
        throw e;
      }
    },

    addSource: async (libraryItemId, sourceInput) => {
      const entry = get().get(libraryItemId);
      if (!entry) return;

      const cursorId = makeSourceLinkCursorId(sourceInput.registryId, sourceInput.sourceId, sourceInput.sourceMangaId);

      // Check if source already exists
      if (entry.sources.some((s) => s.cursorId === cursorId)) return;

      const now = Date.now();
      const source: LocalSourceLink = {
        cursorId,
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
        await ops.saveSourceLink(source);
        set((state) => ({
          entries: state.entries.map((e) =>
            e.item.libraryItemId === libraryItemId
              ? { ...e, sources: [...e.sources, source] }
              : e
          ),
        }));
      } catch (e) {
        console.error("[LibraryStore] addSource error:", e);
        throw e;
      }
    },

    removeSource: async (libraryItemId, registryId, sourceId, sourceMangaId) => {
      const entry = get().get(libraryItemId);
      if (!entry) return;

      // Can't remove last source
      if (entry.sources.length <= 1) {
        console.warn("[LibraryStore] Cannot remove last source");
        return;
      }

      const cursorId = makeSourceLinkCursorId(registryId, sourceId, sourceMangaId);

      try {
        await ops.removeSourceLink(cursorId);
        set((state) => ({
          entries: state.entries.map((e) =>
            e.item.libraryItemId === libraryItemId
              ? { ...e, sources: e.sources.filter((s) => s.cursorId !== cursorId) }
              : e
          ),
        }));
      } catch (e) {
        console.error("[LibraryStore] removeSource error:", e);
        throw e;
      }
    },

    remove: async (libraryItemId) => {
      try {
        await ops.removeLibraryItem(libraryItemId);
        set((state) => ({
          entries: state.entries.filter((e) => e.item.libraryItemId !== libraryItemId),
        }));
      } catch (e) {
        console.error("[LibraryStore] Remove error:", e);
        throw e;
      }
    },

    get: (libraryItemId) => {
      return get().entries.find((e) => e.item.libraryItemId === libraryItemId);
    },

    getBySource: (registryId, sourceId, sourceMangaId) => {
      const cursorId = makeSourceLinkCursorId(registryId, sourceId, sourceMangaId);
      return get().entries.find((e) =>
        e.sources.some((s) => s.cursorId === cursorId)
      );
    },

    isInLibrary: (registryId, sourceId, sourceMangaId) => {
      return get().getBySource(registryId, sourceId, sourceMangaId) !== undefined;
    },

    updateMetadata: async (libraryItemId, metadata, externalIds) => {
      const entry = get().get(libraryItemId);
      if (!entry) return;

      const updated: LocalLibraryItem = {
        ...entry.item,
        metadata,
        externalIds: externalIds ?? entry.item.externalIds,
        updatedAt: Date.now(),
      };

      try {
        await ops.saveLibraryItem(updated);
        set((state) => ({
          entries: state.entries.map((e) =>
            e.item.libraryItemId === libraryItemId ? { ...e, item: updated } : e
          ),
        }));
      } catch (e) {
        console.error("[LibraryStore] updateMetadata error:", e);
        throw e;
      }
    },

    updateOverrides: async (libraryItemId, overrides) => {
      const entry = get().get(libraryItemId);
      if (!entry) return;

      const updated: LocalLibraryItem = {
        ...entry.item,
        overrides: {
          ...entry.item.overrides,
          metadata: { ...entry.item.overrides?.metadata, ...overrides },
        },
        updatedAt: Date.now(),
      };

      try {
        await ops.saveLibraryItem(updated, { metadataClock: null });
        set((state) => ({
          entries: state.entries.map((e) =>
            e.item.libraryItemId === libraryItemId ? { ...e, item: updated } : e
          ),
        }));
      } catch (e) {
        console.error("[LibraryStore] updateOverrides error:", e);
        throw e;
      }
    },

    clearOverrides: async (libraryItemId) => {
      const entry = get().get(libraryItemId);
      if (!entry) return;

      const updated: LocalLibraryItem = {
        ...entry.item,
        overrides: entry.item.overrides ? {
          ...entry.item.overrides,
          metadata: null, // Explicit clear
        } : undefined,
        updatedAt: Date.now(),
      };

      try {
        await ops.saveLibraryItem(updated, { metadataClock: null });
        set((state) => ({
          entries: state.entries.map((e) =>
            e.item.libraryItemId === libraryItemId ? { ...e, item: updated } : e
          ),
        }));
      } catch (e) {
        console.error("[LibraryStore] clearOverrides error:", e);
        throw e;
      }
    },

    updateCoverOverride: async (libraryItemId, coverUrl) => {
      const entry = get().get(libraryItemId);
      if (!entry) return;

      const updated: LocalLibraryItem = {
        ...entry.item,
        overrides: {
          ...entry.item.overrides,
          coverUrl,
        },
        updatedAt: Date.now(),
      };

      try {
        await ops.saveLibraryItem(updated, { coverUrlClock: null });
        set((state) => ({
          entries: state.entries.map((e) =>
            e.item.libraryItemId === libraryItemId ? { ...e, item: updated } : e
          ),
        }));
      } catch (e) {
        console.error("[LibraryStore] updateCoverOverride error:", e);
        throw e;
      }
    },

    acknowledgeUpdate: async (registryId, sourceId, sourceMangaId, latestChapter) => {
      const cursorId = makeSourceLinkCursorId(registryId, sourceId, sourceMangaId);
      const entry = get().entries.find((e) =>
        e.sources.some((s) => s.cursorId === cursorId)
      );
      if (!entry) return;

      const source = entry.sources.find((s) => s.cursorId === cursorId);
      if (!source) return;

      const updatedSource: LocalSourceLink = {
        ...source,
        latestChapter,
        updateAckChapter: latestChapter,
        updateAckAt: Date.now(),
        updatedAt: Date.now(),
      };

      try {
        await ops.saveSourceLink(updatedSource);
        set((state) => ({
          entries: state.entries.map((e) =>
            e.item.libraryItemId === entry.item.libraryItemId
              ? {
                  ...e,
                  sources: e.sources.map((s) =>
                    s.cursorId === cursorId ? updatedSource : s
                  ),
                }
              : e
          ),
        }));
      } catch (e) {
        console.error("[LibraryStore] acknowledgeUpdate error:", e);
      }
    },

    updateLatestChapter: async (registryId, sourceId, sourceMangaId, latestChapter) => {
      const cursorId = makeSourceLinkCursorId(registryId, sourceId, sourceMangaId);
      const entry = get().entries.find((e) =>
        e.sources.some((s) => s.cursorId === cursorId)
      );
      if (!entry) return;

      const source = entry.sources.find((s) => s.cursorId === cursorId);
      if (!source) return;

      const updatedSource: LocalSourceLink = {
        ...source,
        latestChapter,
        latestFetchedAt: Date.now(),
        // Initialize ack if first time
        updateAckChapter: source.updateAckChapter ?? latestChapter,
        updatedAt: Date.now(),
      };

      try {
        await ops.saveSourceLink(updatedSource);
        set((state) => ({
          entries: state.entries.map((e) =>
            e.item.libraryItemId === entry.item.libraryItemId
              ? {
                  ...e,
                  sources: e.sources.map((s) =>
                    s.cursorId === cursorId ? updatedSource : s
                  ),
                }
              : e
          ),
        }));
      } catch (e) {
        console.error("[LibraryStore] updateLatestChapter error:", e);
      }
    },
  }));
}
