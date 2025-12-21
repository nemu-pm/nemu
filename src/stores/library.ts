import { create, type StoreApi, type UseBoundStore } from "zustand";
import type { ChapterSummary, LibraryManga } from "@/data/schema";
import type { UserDataStore } from "@/data/store";

interface LibraryState {
  mangas: LibraryManga[];
  loading: boolean;
  error: string | null;

  // Actions
  load: () => Promise<void>;
  add: (manga: LibraryManga) => Promise<void>;
  remove: (id: string) => Promise<void>;
  get: (id: string) => LibraryManga | undefined;
  getBySource: (registryId: string, sourceId: string, mangaId: string) => LibraryManga | undefined;
  isInLibrary: (registryId: string, sourceId: string, mangaId: string) => boolean;
  /** Update last read chapter (called from reader) */
  updateLastRead: (
    registryId: string,
    sourceId: string,
    mangaId: string,
    chapter: ChapterSummary
  ) => Promise<void>;
  /** Update latest/seen chapter info (called from manga detail page) */
  updateChapterInfo: (
    registryId: string,
    sourceId: string,
    mangaId: string,
    latestChapter: ChapterSummary
  ) => Promise<void>;
  /** Update only latestChapter (called from background refresh - triggers "Updated" badge) */
  updateLatestChapter: (
    registryId: string,
    sourceId: string,
    mangaId: string,
    latestChapter: ChapterSummary
  ) => Promise<void>;
}

export type LibraryStore = UseBoundStore<StoreApi<LibraryState>>;

export function createLibraryStore(userStore: UserDataStore): LibraryStore {
  return create<LibraryState>((set, get) => ({
    mangas: [],
    loading: false,
    error: null,

    load: async () => {
      try {
        set({ loading: true, error: null });
        const mangas = await userStore.getLibrary();
        set({ mangas, loading: false });
      } catch (e) {
        console.error("[LibraryStore] Load error:", e);
        set({
          error: e instanceof Error ? e.message : String(e),
          loading: false,
        });
      }
    },

    add: async (manga: LibraryManga) => {
      try {
        await userStore.saveLibraryManga(manga);
        set((state) => ({
          mangas: [...state.mangas.filter((m) => m.id !== manga.id), manga],
        }));
      } catch (e) {
        console.error("[LibraryStore] Add error:", e);
        throw e;
      }
    },

    remove: async (id: string) => {
      try {
        await userStore.removeLibraryManga(id);
        set((state) => ({
          mangas: state.mangas.filter((m) => m.id !== id),
        }));
      } catch (e) {
        console.error("[LibraryStore] Remove error:", e);
        throw e;
      }
    },

    get: (id: string) => {
      return get().mangas.find((m) => m.id === id);
    },

    getBySource: (registryId: string, sourceId: string, mangaId: string) => {
      return get().mangas.find((m) =>
        m.sources.some(
          (s) =>
            s.registryId === registryId &&
            s.sourceId === sourceId &&
            s.mangaId === mangaId
        )
      );
    },

    isInLibrary: (registryId: string, sourceId: string, mangaId: string) => {
      return get().mangas.some((m) =>
        m.sources.some(
          (s) =>
            s.registryId === registryId &&
            s.sourceId === sourceId &&
            s.mangaId === mangaId
        )
      );
    },

    updateLastRead: async (registryId, sourceId, mangaId, chapter) => {
      const manga = get().getBySource(registryId, sourceId, mangaId);
      if (!manga) return; // Not in library, skip

      const updated: LibraryManga = {
        ...manga,
        lastReadChapter: chapter,
        lastReadAt: Date.now(),
      };

      try {
        await userStore.saveLibraryManga(updated);
        set((state) => ({
          mangas: state.mangas.map((m) => (m.id === manga.id ? updated : m)),
        }));
      } catch (e) {
        console.error("[LibraryStore] updateLastRead error:", e);
      }
    },

    updateChapterInfo: async (registryId, sourceId, mangaId, latestChapter) => {
      const manga = get().getBySource(registryId, sourceId, mangaId);
      if (!manga) return; // Not in library, skip

      const updated: LibraryManga = {
        ...manga,
        latestChapter,
        seenLatestChapter: latestChapter, // User is viewing the page, so they've "seen" it
      };

      try {
        await userStore.saveLibraryManga(updated);
        set((state) => ({
          mangas: state.mangas.map((m) => (m.id === manga.id ? updated : m)),
        }));
      } catch (e) {
        console.error("[LibraryStore] updateChapterInfo error:", e);
      }
    },

    updateLatestChapter: async (registryId, sourceId, mangaId, latestChapter) => {
      const manga = get().getBySource(registryId, sourceId, mangaId);
      if (!manga) return; // Not in library, skip

      // Only update latestChapter, NOT seenLatestChapter
      // This triggers the "Updated" badge if latestChapter > seenLatestChapter
      const updated: LibraryManga = {
        ...manga,
        latestChapter,
        // Initialize seenLatestChapter if not set (first refresh)
        seenLatestChapter: manga.seenLatestChapter ?? latestChapter,
      };

      try {
        await userStore.saveLibraryManga(updated);
        set((state) => ({
          mangas: state.mangas.map((m) => (m.id === manga.id ? updated : m)),
        }));
      } catch (e) {
        console.error("[LibraryStore] updateLatestChapter error:", e);
      }
    },
  }));
}
