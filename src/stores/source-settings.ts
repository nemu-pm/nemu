/**
 * Source settings store
 * Manages per-source settings with IndexedDB persistence
 * 
 * Schemas are loaded when sources are created (not lazily).
 * This store just caches schemas and persists user values.
 */
import { create, type StoreApi, type UseBoundStore } from "zustand";
import type { Setting, SourceSettingsData } from "@/lib/settings";

const DB_NAME = "nemu-source-settings";
const DB_VERSION = 1;
const STORE_NAME = "settings";
const SCHEMA_STORE = "schemas";

// LocalStorage key prefix for migration
const LS_PREFIX = "aidoku_defaults_";

interface SourceSettingsState {
  // User-modified settings per source (sourceKey -> values)
  values: Map<string, Record<string, unknown>>;
  // Cached schemas per source (sourceKey -> schema)
  schemas: Map<string, Setting[]>;
  // Loading state
  loading: boolean;
  initialized: boolean;

  // Actions
  initialize: () => Promise<void>;
  setSetting: (sourceKey: string, key: string, value: unknown) => void;
  deleteSetting: (sourceKey: string, key: string) => void;
  resetSettings: (sourceKey: string) => void;
  setSchema: (sourceKey: string, schema: Setting[]) => Promise<void>;
}

export type SourceSettingsStore = UseBoundStore<StoreApi<SourceSettingsState>>;

interface SourceSettingsPersistence {
  loadAllSettings: () => Promise<Map<string, Record<string, unknown>>>;
  loadAllSchemas: () => Promise<Map<string, Setting[]>>;
  saveSettings: (sourceKey: string, values: Record<string, unknown>) => Promise<void>;
  deleteSettings: (sourceKey: string) => Promise<void>;
  saveSchema: (sourceKey: string, schema: Setting[]) => Promise<void>;
  migrateFromLocalStorage: () => Map<string, Record<string, unknown>>;
}

// IndexedDB helpers
async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "sourceKey" });
      }
      if (!db.objectStoreNames.contains(SCHEMA_STORE)) {
        db.createObjectStore(SCHEMA_STORE, { keyPath: "sourceKey" });
      }
    };
  });
}

async function loadAllSettings(): Promise<Map<string, Record<string, unknown>>> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const map = new Map<string, Record<string, unknown>>();
      for (const item of request.result as SourceSettingsData[]) {
        map.set(item.sourceKey, item.values);
      }
      resolve(map);
    };
  });
}

async function saveSettings(sourceKey: string, values: Record<string, unknown>): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const data: SourceSettingsData = { sourceKey, values, updatedAt: Date.now() };
    const request = store.put(data);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

async function deleteSettings(sourceKey: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(sourceKey);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

async function loadAllSchemas(): Promise<Map<string, Setting[]>> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SCHEMA_STORE, "readonly");
    const store = tx.objectStore(SCHEMA_STORE);
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const map = new Map<string, Setting[]>();
      for (const item of request.result as { sourceKey: string; schema: Setting[] }[]) {
        map.set(item.sourceKey, item.schema);
      }
      resolve(map);
    };
  });
}

async function saveSchema(sourceKey: string, schema: Setting[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SCHEMA_STORE, "readwrite");
    const store = tx.objectStore(SCHEMA_STORE);
    const request = store.put({ sourceKey, schema });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

// Migrate from localStorage (one-time)
function migrateFromLocalStorage(): Map<string, Record<string, unknown>> {
  const migrated = new Map<string, Record<string, unknown>>();
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(LS_PREFIX)) {
        const sourceId = key.slice(LS_PREFIX.length);
        try {
          const value = localStorage.getItem(key);
          if (value) {
            migrated.set(sourceId, JSON.parse(value));
            keysToRemove.push(key);
          }
        } catch { /* skip */ }
      }
    }
    for (const key of keysToRemove) localStorage.removeItem(key);
    if (migrated.size > 0) {
      console.log(`[source-settings] Migrated ${migrated.size} sources from localStorage`);
    }
  } catch { /* ignore */ }
  return migrated;
}

export function createSourceSettingsStore(
  persistenceOverrides: Partial<SourceSettingsPersistence> = {}
): SourceSettingsStore {
  const persistence: SourceSettingsPersistence = {
    loadAllSettings,
    loadAllSchemas,
    saveSettings,
    deleteSettings,
    saveSchema,
    migrateFromLocalStorage,
    ...persistenceOverrides,
  };
  const saveDebounceMap = new Map<string, ReturnType<typeof setTimeout>>();

  const cancelPendingSave = (sourceKey: string) => {
    const existing = saveDebounceMap.get(sourceKey);
    if (existing) {
      clearTimeout(existing);
      saveDebounceMap.delete(sourceKey);
    }
  };

  const debouncedSave = (sourceKey: string, values: Record<string, unknown>) => {
    cancelPendingSave(sourceKey);
    saveDebounceMap.set(sourceKey, setTimeout(() => {
      persistence.saveSettings(sourceKey, values).catch(console.error);
      saveDebounceMap.delete(sourceKey);
    }, 500));
  };

  return create<SourceSettingsState>((set, get) => ({
    values: new Map(),
    schemas: new Map(),
    loading: true,
    initialized: false,

    initialize: async () => {
      if (get().initialized) return;
      try {
        const [settings, schemas] = await Promise.all([
          persistence.loadAllSettings(),
          persistence.loadAllSchemas(),
        ]);
        
        // Migrate from localStorage
        const migrated = persistence.migrateFromLocalStorage();
        for (const [sourceKey, values] of migrated) {
          const existing = settings.get(sourceKey) ?? {};
          const merged = { ...existing, ...values };
          settings.set(sourceKey, merged);
          await persistence.saveSettings(sourceKey, merged);
        }
        
        set({ values: settings, schemas, loading: false, initialized: true });
      } catch (error) {
        console.error("[source-settings] Failed to initialize:", error);
        set({ loading: false, initialized: true });
      }
    },

    setSetting: (sourceKey, key, value) => {
      const { values } = get();
      const current = values.get(sourceKey) ?? {};
      const updated = { ...current, [key]: value };
      
      const newValues = new Map(values);
      newValues.set(sourceKey, updated);
      set({ values: newValues });
      
      debouncedSave(sourceKey, updated);
    },

    deleteSetting: (sourceKey, key) => {
      const { values } = get();
      const current = values.get(sourceKey);
      if (!current || !(key in current)) return;

      const updated = { ...current };
      delete updated[key];

      const newValues = new Map(values);
      if (Object.keys(updated).length === 0) {
        newValues.delete(sourceKey);
      } else {
        newValues.set(sourceKey, updated);
      }
      set({ values: newValues });

      if (Object.keys(updated).length === 0) {
        cancelPendingSave(sourceKey);
        persistence.deleteSettings(sourceKey).catch(console.error);
      } else {
        debouncedSave(sourceKey, updated);
      }
    },

    resetSettings: (sourceKey) => {
      const { values } = get();
      const newValues = new Map(values);
      newValues.delete(sourceKey);
      set({ values: newValues });
      cancelPendingSave(sourceKey);
      persistence.deleteSettings(sourceKey).catch(console.error);
    },

    setSchema: async (sourceKey, schema) => {
      const { schemas } = get();
      const newSchemas = new Map(schemas);
      newSchemas.set(sourceKey, schema);
      set({ schemas: newSchemas });
      await persistence.saveSchema(sourceKey, schema);
    },
  }));
}

// Singleton
let _store: SourceSettingsStore | null = null;

export function getSourceSettingsStore(): SourceSettingsStore {
  if (!_store) {
    _store = createSourceSettingsStore();
  }
  return _store;
}
