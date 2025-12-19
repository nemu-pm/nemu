import { create, type StoreApi, type UseBoundStore } from "zustand";
import type { LibraryManga } from "@/data/schema";
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
  isInLibrary: (registryId: string, sourceId: string, mangaId: string) => boolean;
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
  }));
}
