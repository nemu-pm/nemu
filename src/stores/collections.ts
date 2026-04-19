import { create, type StoreApi, type UseBoundStore } from "zustand";
import type { LocalCollection, LocalCollectionItem } from "@/data/schema";

function generateId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function sortCollections(collections: LocalCollection[]): LocalCollection[] {
  return [...collections].sort((a, b) => {
    if (a.createdAt !== b.createdAt) return b.createdAt - a.createdAt;
    return a.collectionId.localeCompare(b.collectionId);
  });
}

function buildMembership(collectionItems: LocalCollectionItem[]): Map<string, Set<string>> {
  const membership = new Map<string, Set<string>>();

  for (const item of collectionItems) {
    const existing = membership.get(item.collectionId) ?? new Set<string>();
    existing.add(item.libraryItemId);
    membership.set(item.collectionId, existing);
  }

  return membership;
}

export interface CanonicalCollectionsOps {
  getCollections(): Promise<LocalCollection[]>;
  getCollectionItems(): Promise<LocalCollectionItem[]>;
  saveCollection(collection: LocalCollection): Promise<void>;
  removeCollection(collectionId: string): Promise<void>;
  addCollectionItems(collectionId: string, libraryItemIds: string[]): Promise<void>;
  removeCollectionItems(collectionId: string, libraryItemIds: string[]): Promise<void>;
}

interface CollectionsState {
  collections: LocalCollection[];
  membership: Map<string, Set<string>>;
  loading: boolean;
  error: string | null;

  load: () => Promise<void>;
  create: (name: string) => Promise<LocalCollection>;
  rename: (collectionId: string, name: string) => Promise<void>;
  remove: (collectionId: string) => Promise<void>;
  addBooksTo: (collectionId: string, libraryItemIds: string[]) => Promise<void>;
  removeBooksFrom: (collectionId: string, libraryItemIds: string[]) => Promise<void>;
  getCollectionsForItem: (libraryItemId: string) => LocalCollection[];
  getItemsInCollection: (collectionId: string) => string[];
}

export type CollectionsStore = UseBoundStore<StoreApi<CollectionsState>>;

export function createCollectionsStore(ops: CanonicalCollectionsOps): CollectionsStore {
  return create<CollectionsState>((set, get) => ({
    collections: [],
    membership: new Map(),
    loading: true,
    error: null,

    load: async () => {
      try {
        set({ loading: true, error: null });
        const [collections, collectionItems] = await Promise.all([
          ops.getCollections(),
          ops.getCollectionItems(),
        ]);

        set({
          collections: sortCollections(collections),
          membership: buildMembership(collectionItems),
          loading: false,
          error: null,
        });
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },

    create: async (name) => {
      const now = Date.now();
      const collection: LocalCollection = {
        collectionId: generateId(),
        name,
        createdAt: now,
        updatedAt: now,
      };

      await ops.saveCollection(collection);
      set((state) => ({
        collections: sortCollections([...state.collections, collection]),
      }));
      return collection;
    },

    rename: async (collectionId, name) => {
      const existing = get().collections.find((collection) => collection.collectionId === collectionId);
      if (!existing) return;

      const updated: LocalCollection = {
        ...existing,
        name,
        updatedAt: Date.now(),
      };

      await ops.saveCollection(updated);
      set((state) => ({
        collections: sortCollections(
          state.collections.map((collection) =>
            collection.collectionId === collectionId ? updated : collection
          )
        ),
      }));
    },

    remove: async (collectionId) => {
      await ops.removeCollection(collectionId);
      set((state) => {
        const membership = new Map(state.membership);
        membership.delete(collectionId);

        return {
          collections: state.collections.filter((collection) => collection.collectionId !== collectionId),
          membership,
        };
      });
    },

    addBooksTo: async (collectionId, libraryItemIds) => {
      const uniqueIds = [...new Set(libraryItemIds)];
      if (uniqueIds.length === 0) return;
      if (!get().collections.some((collection) => collection.collectionId === collectionId)) return;

      await ops.addCollectionItems(collectionId, uniqueIds);
      set((state) => {
        const membership = new Map(state.membership);
        const next = new Set(membership.get(collectionId) ?? []);
        for (const libraryItemId of uniqueIds) next.add(libraryItemId);
        membership.set(collectionId, next);
        return { membership };
      });
    },

    removeBooksFrom: async (collectionId, libraryItemIds) => {
      const uniqueIds = [...new Set(libraryItemIds)];
      if (uniqueIds.length === 0) return;

      await ops.removeCollectionItems(collectionId, uniqueIds);
      set((state) => {
        const membership = new Map(state.membership);
        const next = new Set(membership.get(collectionId) ?? []);
        for (const libraryItemId of uniqueIds) next.delete(libraryItemId);
        if (next.size === 0) {
          membership.delete(collectionId);
        } else {
          membership.set(collectionId, next);
        }
        return { membership };
      });
    },

    getCollectionsForItem: (libraryItemId) => {
      const state = get();
      return state.collections.filter((collection) =>
        state.membership.get(collection.collectionId)?.has(libraryItemId)
      );
    },

    getItemsInCollection: (collectionId) => {
      return [...(get().membership.get(collectionId) ?? new Set<string>())];
    },
  }));
}
