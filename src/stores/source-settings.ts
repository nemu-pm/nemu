/**
 * Source settings store
 * Manages per-source settings with IndexedDB persistence
 *
 * Schemas are loaded when sources are created (not lazily).
 * This store just caches schemas and persists user values.
 */
import { create, type StoreApi, type UseBoundStore } from "zustand";
import {
  isSafeSourceSettingValueKey,
  sanitizeSettingsSchema,
  sanitizeSourceSettingValues,
  type Setting,
  type SourceSettingsData,
} from "@/lib/settings";
import {
  ProfileWriteFence,
  type ProfileWriteFenceLease,
} from "@/data/profile-write-fence";
import { safeErrorCategory } from "@/lib/error-diagnostic";

const DB_NAME = "nemu-source-settings";
const PROFILE_DB_PREFIX = `${DB_NAME}::`;
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
  clearAll: (
    signal?: AbortSignal,
    lease?: ProfileWriteFenceLease,
  ) => Promise<void>;
}

export type SourceSettingsStore = UseBoundStore<StoreApi<SourceSettingsState>>;

interface SourceSettingsPersistence {
  loadAllSettings: () => Promise<Map<string, Record<string, unknown>>>;
  loadAllSchemas: () => Promise<Map<string, Setting[]>>;
  saveSettings: (
    sourceKey: string,
    values: Record<string, unknown>,
  ) => Promise<void>;
  deleteSettings: (sourceKey: string) => Promise<void>;
  saveSchema: (sourceKey: string, schema: Setting[]) => Promise<void>;
  clearAll: (signal?: AbortSignal) => Promise<void>;
  migrateFromLocalStorage: () => Map<string, Record<string, unknown>>;
}

// IndexedDB helpers
export function getSourceSettingsDatabaseName(profileId?: string): string {
  return profileId ? `${DB_NAME}::${profileId}` : DB_NAME;
}

export function matchSourceSettingsDatabaseProfile(
  dbName: string,
): { profileId: string | undefined } | null {
  if (dbName === DB_NAME) return { profileId: undefined };
  if (!dbName.startsWith(PROFILE_DB_PREFIX)) return null;
  const profileId = dbName.slice(PROFILE_DB_PREFIX.length);
  return profileId.length > 0 ? { profileId } : null;
}

async function openDB(dbName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, DB_VERSION);
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

async function loadAllSettings(
  dbName: string,
): Promise<Map<string, Record<string, unknown>>> {
  const db = await openDB(dbName);
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

async function saveSettings(
  dbName: string,
  sourceKey: string,
  values: Record<string, unknown>,
): Promise<void> {
  const db = await openDB(dbName);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const data: SourceSettingsData = {
      sourceKey,
      values,
      updatedAt: Date.now(),
    };
    const request = store.put(data);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

async function deleteSettings(
  dbName: string,
  sourceKey: string,
): Promise<void> {
  const db = await openDB(dbName);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(sourceKey);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

async function loadAllSchemas(dbName: string): Promise<Map<string, Setting[]>> {
  const db = await openDB(dbName);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SCHEMA_STORE, "readonly");
    const store = tx.objectStore(SCHEMA_STORE);
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const map = new Map<string, Setting[]>();
      for (const item of request.result as {
        sourceKey: string;
        schema: Setting[];
      }[]) {
        map.set(item.sourceKey, item.schema);
      }
      resolve(map);
    };
  });
}

async function saveSchema(
  dbName: string,
  sourceKey: string,
  schema: Setting[],
): Promise<void> {
  const db = await openDB(dbName);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SCHEMA_STORE, "readwrite");
    const store = tx.objectStore(SCHEMA_STORE);
    const request = store.put({ sourceKey, schema });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

async function clearAll(dbName: string, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    throw new DOMException(
      "Source settings clear was cancelled.",
      "AbortError",
    );
  }
  const db = await openDB(dbName);
  if (signal?.aborted) {
    throw new DOMException(
      "Source settings clear was cancelled.",
      "AbortError",
    );
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME, SCHEMA_STORE], "readwrite");
    const abort = () => {
      try {
        tx.abort();
      } catch {
        // The transaction already completed; its completion handler owns the result.
      }
    };
    const cleanup = () => signal?.removeEventListener("abort", abort);
    signal?.addEventListener("abort", abort, { once: true });
    tx.onerror = () => {
      cleanup();
      reject(tx.error ?? new Error("Source settings clear failed."));
    };
    tx.onabort = () => {
      cleanup();
      reject(
        signal?.aborted
          ? new DOMException(
              "Source settings clear was cancelled.",
              "AbortError",
            )
          : (tx.error ?? new Error("Source settings clear aborted.")),
      );
    };
    tx.oncomplete = () => {
      cleanup();
      resolve();
    };
    tx.objectStore(STORE_NAME).clear();
    tx.objectStore(SCHEMA_STORE).clear();
    if (signal?.aborted) abort();
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
        } catch {
          /* skip */
        }
      }
    }
    for (const key of keysToRemove) localStorage.removeItem(key);
    if (migrated.size > 0) {
      console.log(
        `[source-settings] Migrated ${migrated.size} sources from localStorage`,
      );
    }
  } catch {
    /* ignore */
  }
  return migrated;
}

export function createSourceSettingsStore(
  persistenceOverrides: Partial<SourceSettingsPersistence> = {},
  profileId?: string,
): SourceSettingsStore {
  const dbName = getSourceSettingsDatabaseName(profileId);
  const profileWriteFence = new ProfileWriteFence(profileId);
  const persistence: SourceSettingsPersistence = {
    loadAllSettings: () => loadAllSettings(dbName),
    loadAllSchemas: () => loadAllSchemas(dbName),
    saveSettings: (sourceKey, values) =>
      saveSettings(dbName, sourceKey, values),
    deleteSettings: (sourceKey) => deleteSettings(dbName, sourceKey),
    saveSchema: (sourceKey, schema) => saveSchema(dbName, sourceKey, schema),
    clearAll: (signal) => clearAll(dbName, signal),
    // Legacy localStorage values had no account owner. Keep them in the
    // anonymous profile instead of leaking credentials into the first signed-
    // in account that happens to launch this version.
    migrateFromLocalStorage: profileId
      ? () => new Map()
      : migrateFromLocalStorage,
    ...persistenceOverrides,
  };
  const saveDebounceMap = new Map<string, ReturnType<typeof setTimeout>>();
  const inFlightWrites = new Set<Promise<unknown>>();
  let acceptingWrites = true;
  let lifecycleGeneration = 0;
  let initializationPromise: Promise<void> | null = null;

  const trackWrite = <T>(write: Promise<T>): Promise<T> => {
    inFlightWrites.add(write);
    void write.then(
      () => inFlightWrites.delete(write),
      () => inFlightWrites.delete(write),
    );
    return write;
  };

  const runPersistenceWrite = <T>(
    operation: () => Promise<T>,
    lease?: ProfileWriteFenceLease,
  ): Promise<T> => trackWrite(profileWriteFence.run(operation, lease));

  const cancelPendingSave = (sourceKey: string) => {
    const existing = saveDebounceMap.get(sourceKey);
    if (existing) {
      clearTimeout(existing);
      saveDebounceMap.delete(sourceKey);
    }
  };

  const cancelAllPendingSaves = () => {
    for (const timeout of saveDebounceMap.values()) clearTimeout(timeout);
    saveDebounceMap.clear();
  };

  const debouncedSave = (
    sourceKey: string,
    values: Record<string, unknown>,
  ) => {
    if (!acceptingWrites) return;
    cancelPendingSave(sourceKey);
    saveDebounceMap.set(
      sourceKey,
      setTimeout(() => {
        saveDebounceMap.delete(sourceKey);
        if (!acceptingWrites) return;
        runPersistenceWrite(() =>
          persistence.saveSettings(sourceKey, values),
        ).catch((error) => {
          console.error(
            "[source-settings] Failed to persist settings:",
            safeErrorCategory(error),
          );
        });
      }, 500),
    );
  };

  const store = create<SourceSettingsState>((set, get) => ({
    values: new Map(),
    schemas: new Map(),
    loading: true,
    initialized: false,

    initialize: () => {
      if (get().initialized) return Promise.resolve();
      if (initializationPromise) return initializationPromise;
      const generation = lifecycleGeneration;
      const operation = (async () => {
        try {
          const [settings, schemas] = await Promise.all([
            persistence.loadAllSettings(),
            persistence.loadAllSchemas(),
          ]);
          if (!acceptingWrites || generation !== lifecycleGeneration) return;

          for (const [sourceKey, values] of settings) {
            settings.set(sourceKey, sanitizeSourceSettingValues(values));
          }

          // IndexedDB is a trust boundary: older releases persisted AIX
          // settings with only a TypeScript cast. Sanitize every loaded tree
          // before navigation, default extraction, or rendering can observe it.
          for (const [sourceKey, schema] of schemas) {
            schemas.set(sourceKey, sanitizeSettingsSchema(schema));
          }

          // Migrate from localStorage
          const migrated = persistence.migrateFromLocalStorage();
          for (const [sourceKey, values] of migrated) {
            const existing = settings.get(sourceKey) ?? {};
            const merged = sanitizeSourceSettingValues({
              ...existing,
              ...sanitizeSourceSettingValues(values),
            });
            settings.set(sourceKey, merged);
            await runPersistenceWrite(() =>
              persistence.saveSettings(sourceKey, merged),
            );
            if (!acceptingWrites || generation !== lifecycleGeneration) return;
          }

          // Preserve any synchronous source callback that raced the initial
          // read; persisted data must not overwrite a newer in-memory value.
          for (const [sourceKey, values] of get().values) {
            const liveValues = sanitizeSourceSettingValues(values);
            settings.set(
              sourceKey,
              sanitizeSourceSettingValues({
                ...(settings.get(sourceKey) ?? {}),
                ...liveValues,
              }),
            );
          }
          for (const [sourceKey, schema] of get().schemas) {
            schemas.set(sourceKey, schema);
          }

          set({ values: settings, schemas, loading: false, initialized: true });
        } catch (error) {
          console.error(
            "[source-settings] Failed to initialize:",
            safeErrorCategory(error),
          );
          if (acceptingWrites && generation === lifecycleGeneration) {
            set({ loading: false, initialized: true });
          }
        }
      })();
      initializationPromise = operation;
      void operation.then(() => {
        if (initializationPromise === operation) initializationPromise = null;
      });
      return operation;
    },

    setSetting: (sourceKey, key, value) => {
      if (!acceptingWrites || !isSafeSourceSettingValueKey(key)) return;
      const { values } = get();
      const current = sanitizeSourceSettingValues(values.get(sourceKey) ?? {});
      const updated = sanitizeSourceSettingValues({
        ...current,
        [key]: value,
      });
      if (!Object.prototype.hasOwnProperty.call(updated, key)) {
        get().deleteSetting(sourceKey, key);
        return;
      }

      const newValues = new Map(values);
      newValues.set(sourceKey, updated);
      set({ values: newValues });

      debouncedSave(sourceKey, updated);
    },

    deleteSetting: (sourceKey, key) => {
      if (!acceptingWrites || !isSafeSourceSettingValueKey(key)) return;
      const { values } = get();
      const current = sanitizeSourceSettingValues(values.get(sourceKey));
      if (!current || !Object.prototype.hasOwnProperty.call(current, key)) {
        return;
      }

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
        runPersistenceWrite(() => persistence.deleteSettings(sourceKey)).catch(
          (error) => {
            console.error(
              "[source-settings] Failed to delete settings:",
              safeErrorCategory(error),
            );
          },
        );
      } else {
        debouncedSave(sourceKey, updated);
      }
    },

    resetSettings: (sourceKey) => {
      if (!acceptingWrites) return;
      const { values } = get();
      const newValues = new Map(values);
      newValues.delete(sourceKey);
      set({ values: newValues });
      cancelPendingSave(sourceKey);
      runPersistenceWrite(() => persistence.deleteSettings(sourceKey)).catch(
        (error) => {
          console.error(
            "[source-settings] Failed to reset settings:",
            safeErrorCategory(error),
          );
        },
      );
    },

    setSchema: async (sourceKey, schema) => {
      if (!acceptingWrites) return;
      const safeSchema = sanitizeSettingsSchema(schema);
      const { schemas } = get();
      const newSchemas = new Map(schemas);
      newSchemas.set(sourceKey, safeSchema);
      set({ schemas: newSchemas });
      await runPersistenceWrite(() =>
        persistence.saveSchema(sourceKey, safeSchema),
      );
    },

    clearAll: async (signal, lease) => {
      // A delayed credential write must never resurrect data after sign-out or
      // a destructive clear.
      acceptingWrites = false;
      lifecycleGeneration += 1;
      cancelAllPendingSaves();
      try {
        await Promise.allSettled([...inFlightWrites]);
        if (signal?.aborted) {
          throw new DOMException(
            "Source settings clear was cancelled.",
            "AbortError",
          );
        }
        await runPersistenceWrite(() => persistence.clearAll(signal), lease);
        set({
          values: new Map(),
          schemas: new Map(),
          loading: false,
          initialized: true,
        });
      } catch (error) {
        // IndexedDB clears are transactional. If cancellation or another
        // failure rolls the transaction back, keep this same-profile store
        // writable and requeue any debounced values cancelled above.
        acceptingWrites = true;
        lifecycleGeneration += 1;
        for (const [sourceKey, values] of get().values) {
          debouncedSave(sourceKey, values);
        }
        for (const [sourceKey, schema] of get().schemas) {
          runPersistenceWrite(() =>
            persistence.saveSchema(sourceKey, schema),
          ).catch((saveError) => {
            console.error(
              "[source-settings] Failed to restore a schema write:",
              safeErrorCategory(saveError),
            );
          });
        }
        throw error;
      }
    },
  }));

  // A successful remove-data sign-out retires the entire profile lifetime.
  // Other tabs must immediately drop secrets from memory and stop scheduling
  // persistence through the stale store instance.
  const unsubscribeRetirement = profileWriteFence.subscribeRetired((epoch) => {
    if (epoch <= profileWriteFence.epoch) return;
    acceptingWrites = false;
    lifecycleGeneration += 1;
    cancelAllPendingSaves();
    store.setState({
      values: new Map(),
      schemas: new Map(),
      loading: false,
      initialized: true,
    });
    const key = profileId ?? "";
    if (storesByProfile.get(key) === store) storesByProfile.delete(key);
    unsubscribeRetirement();
  });

  return store;
}

// Source settings can contain passwords, cookies, localStorage snapshots, and
// OAuth tokens. Keep one store/IndexedDB container per user profile. Runtime
// containers pass their exact store into source adapters; the no-argument
// getter remains only as a backwards-compatible anonymous/local default.
const storesByProfile = new Map<string, SourceSettingsStore>();

function sourceSettingsStoreForProfile(
  profileId?: string,
): SourceSettingsStore {
  const key = profileId ?? "";
  let store = storesByProfile.get(key);
  if (!store) {
    store = createSourceSettingsStore({}, profileId);
    storesByProfile.set(key, store);
  }
  return store;
}

export function getSourceSettingsStoreForProfile(
  profileId?: string,
): SourceSettingsStore {
  return sourceSettingsStoreForProfile(profileId);
}

export function getSourceSettingsStore(): SourceSettingsStore {
  return sourceSettingsStoreForProfile();
}

export async function clearSourceSettingsProfile(
  profileId?: string,
  signal?: AbortSignal,
  lease?: ProfileWriteFenceLease,
): Promise<void> {
  const key = profileId ?? "";
  const store = sourceSettingsStoreForProfile(profileId);
  await store.getState().clearAll(signal, lease);
  // Detach only after the transactional clear commits. An aborted clear keeps
  // the same-account provider's store live and writable.
  if (storesByProfile.get(key) === store) storesByProfile.delete(key);
}
