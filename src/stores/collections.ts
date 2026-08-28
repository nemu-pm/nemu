import { create, type StoreApi, type UseBoundStore } from "zustand";
import type { LocalCollection, LocalCollectionItem } from "@/data/schema";
import { nextSyncTimestamp } from "@nemu/core";
import {
  StoreGenerationGate,
  type StoreGenerationToken,
} from "./sync-generation-gate";

function generateId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function sortCollections(collections: LocalCollection[]): LocalCollection[] {
  return collections.filter((collection) => !collection.removed).sort((a, b) => {
    if (a.createdAt !== b.createdAt) return b.createdAt - a.createdAt;
    return a.collectionId.localeCompare(b.collectionId);
  });
}

function buildMembership(collectionItems: LocalCollectionItem[]): Map<string, Set<string>> {
  const membership = new Map<string, Set<string>>();

  for (const item of collectionItems) {
    if (item.removed) continue;
    const existing = membership.get(item.collectionId) ?? new Set<string>();
    existing.add(item.libraryItemId);
    membership.set(item.collectionId, existing);
  }

  return membership;
}

export interface CanonicalCollectionsOps {
  getCollections(): Promise<LocalCollection[]>;
  getCollectionItems(): Promise<LocalCollectionItem[]>;
  saveCollection(collection: LocalCollection, expectedGeneration?: number | null): Promise<void>;
  removeCollection(collectionId: string, expectedGeneration?: number | null): Promise<void>;
  addCollectionItems(
    collectionId: string,
    libraryItemIds: string[],
    expectedGeneration?: number | null,
  ): Promise<void>;
  removeCollectionItems(
    collectionId: string,
    libraryItemIds: string[],
    expectedGeneration?: number | null,
  ): Promise<void>;
}

interface CollectionsState {
  collections: LocalCollection[];
  membership: Map<string, Set<string>>;
  loading: boolean;
  error: string | null;
  syncGeneration: number | null;

  load: () => Promise<void>;
  prepareSyncGeneration: (
    generation: number,
    readiness?: Promise<unknown>,
  ) => void;
  replaceSyncSnapshot: (
    collections: LocalCollection[],
    collectionItems: LocalCollectionItem[],
    generation: number,
  ) => void;
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
  const generationGate = new StoreGenerationGate();
  let loadRevision = 0;
  return create<CollectionsState>((set, get) => {
    const beginAction = async (): Promise<StoreGenerationToken> => {
      const token = generationGate.capture();
      if (!(await generationGate.wait(token))) {
        throw new Error("Collection action cancelled because synced account data was reset.");
      }
      return token;
    };
    const setIfCurrent = (
      token: StoreGenerationToken,
      update:
        | Partial<CollectionsState>
        | ((state: CollectionsState) => Partial<CollectionsState>),
    ) => {
      if (generationGate.isCurrent(token)) set(update);
    };

    return {
    collections: [],
    membership: new Map(),
    loading: true,
    error: null,
    syncGeneration: null,

    prepareSyncGeneration: (generation, readiness) => {
      if (!generationGate.prepare(generation, readiness)) return;
      loadRevision += 1;
      set({
        collections: [],
        membership: new Map(),
        loading: true,
        error: null,
        syncGeneration: generation,
      });
    },

    replaceSyncSnapshot: (collections, collectionItems, generation) => {
      if (generationGate.currentGeneration !== generation) return;
      set({
        collections: sortCollections(collections),
        membership: buildMembership(collectionItems),
        loading: false,
        error: null,
        syncGeneration: generation,
      });
    },

    load: async () => {
      const revision = ++loadRevision;
      const token = generationGate.capture();
      try {
        if (!(await generationGate.wait(token))) return;
        setIfCurrent(token, { loading: true, error: null });
        const [collections, collectionItems] = await Promise.all([
          ops.getCollections(),
          ops.getCollectionItems(),
        ]);

        if (revision !== loadRevision) return;
        setIfCurrent(token, {
          collections: sortCollections(collections),
          membership: buildMembership(collectionItems),
          loading: false,
          error: null,
        });
      } catch (error) {
        if (revision !== loadRevision || !generationGate.isCurrent(token)) return;
        setIfCurrent(token, {
          loading: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },

    create: async (name) => {
      const token = await beginAction();
      const now = nextSyncTimestamp();
      const collection: LocalCollection = {
        collectionId: generateId(),
        name,
        createdAt: now,
        updatedAt: now,
      };

      await ops.saveCollection(collection, token.generation);
      setIfCurrent(token, (state) => ({
        collections: sortCollections([...state.collections, collection]),
      }));
      return collection;
    },

    rename: async (collectionId, name) => {
      const token = await beginAction();
      const existing = get().collections.find((collection) => collection.collectionId === collectionId);
      if (!existing) return;

      const updated: LocalCollection = {
        ...existing,
        name,
        updatedAt: nextSyncTimestamp(existing.updatedAt),
      };

      await ops.saveCollection(updated, token.generation);
      setIfCurrent(token, (state) => ({
        collections: sortCollections(
          state.collections.map((collection) =>
            collection.collectionId === collectionId ? updated : collection
          )
        ),
      }));
    },

    remove: async (collectionId) => {
      const token = await beginAction();
      await ops.removeCollection(collectionId, token.generation);
      setIfCurrent(token, (state) => {
        const membership = new Map(state.membership);
        membership.delete(collectionId);

        return {
          collections: state.collections.filter((collection) => collection.collectionId !== collectionId),
          membership,
        };
      });
    },

    addBooksTo: async (collectionId, libraryItemIds) => {
      const token = await beginAction();
      const uniqueIds = [...new Set(libraryItemIds)];
      if (uniqueIds.length === 0) return;
      if (!get().collections.some((collection) => collection.collectionId === collectionId)) return;

      await ops.addCollectionItems(collectionId, uniqueIds, token.generation);
      setIfCurrent(token, (state) => {
        const membership = new Map(state.membership);
        const next = new Set(membership.get(collectionId) ?? []);
        for (const libraryItemId of uniqueIds) next.add(libraryItemId);
        membership.set(collectionId, next);
        return { membership };
      });
    },

    removeBooksFrom: async (collectionId, libraryItemIds) => {
      const token = await beginAction();
      const uniqueIds = [...new Set(libraryItemIds)];
      if (uniqueIds.length === 0) return;

      await ops.removeCollectionItems(collectionId, uniqueIds, token.generation);
      setIfCurrent(token, (state) => {
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
    };
  });
}
