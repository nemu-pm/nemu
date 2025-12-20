// defaults namespace - User settings storage with localStorage persistence
import { GlobalStore } from "../global-store";
import { encodeValue } from "../postcard";

const STORAGE_PREFIX = "aidoku_defaults_";

/**
 * Check if localStorage is available
 */
function isLocalStorageAvailable(): boolean {
  try {
    const testKey = "__storage_test__";
    localStorage.setItem(testKey, testKey);
    localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * Load persisted settings from localStorage
 */
function loadPersistedSettings(sourceId: string): Record<string, unknown> {
  if (!isLocalStorageAvailable()) return {};

  const key = `${STORAGE_PREFIX}${sourceId}`;
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.warn("[defaults] Failed to load settings from localStorage:", e);
  }
  return {};
}

/**
 * Persist settings to localStorage
 */
function persistSettings(sourceId: string, settings: Record<string, unknown>): void {
  if (!isLocalStorageAvailable()) return;

  const key = `${STORAGE_PREFIX}${sourceId}`;
  try {
    localStorage.setItem(key, JSON.stringify(settings));
  } catch (e) {
    console.warn("[defaults] Failed to save settings to localStorage:", e);
  }
}

/**
 * Create a debounced persist function to avoid excessive writes
 */
function createDebouncedPersist(sourceId: string, store: GlobalStore, delayMs = 500): () => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      const settings = store.exportSettings();
      persistSettings(sourceId, settings);
      timeoutId = null;
    }, delayMs);
  };
}

export function createDefaultsImports(store: GlobalStore) {
  // Load persisted settings on initialization
  // Persisted settings override initial/default settings
  const persistedSettings = loadPersistedSettings(store.id);
  if (Object.keys(persistedSettings).length > 0) {
    // Merge with existing settings (don't overwrite defaults)
    for (const [key, value] of Object.entries(persistedSettings)) {
      store.setSetting(key, value);
    }
    console.debug(`[defaults] Loaded ${Object.keys(persistedSettings).length} persisted settings for ${store.id}`);
  }
  
  // Log current settings for debugging
  console.debug(`[defaults] Store has settings:`, store.exportSettings());

  // Create debounced persist function
  const debouncedPersist = createDebouncedPersist(store.id, store);

  return {
    get: (keyPtr: number, keyLen: number): number => {
      if (keyLen <= 0) return -1;
      const key = store.readString(keyPtr, keyLen);
      if (!key) return -1;

      const value = store.getSetting(key);
      if (value !== undefined) {
        console.debug(`[defaults.get] ${key} = ${JSON.stringify(value)}`);
        // Encode the value as postcard bytes - WASM expects to read it as a buffer
        const encoded = encodeValue(value);
        return store.storeStdValue(encoded);
      }
      console.debug(`[defaults.get] ${key} = (not found)`);
      return -1;
    },

    set: (keyPtr: number, keyLen: number, valueDesc: number): void => {
      if (keyLen <= 0 || valueDesc < 0) return;
      const key = store.readString(keyPtr, keyLen);
      if (!key) return;

      const value = store.readStdValue(valueDesc);
      console.debug(`[defaults.set] ${key} = ${JSON.stringify(value)}`);
      store.setSetting(key, value);

      // Trigger debounced persist
      debouncedPersist();
    },
  };
}

/**
 * Clear all persisted settings for a source
 */
export function clearPersistedSettings(sourceId: string): void {
  if (!isLocalStorageAvailable()) return;

  const key = `${STORAGE_PREFIX}${sourceId}`;
  try {
    localStorage.removeItem(key);
  } catch (e) {
    console.warn("[defaults] Failed to clear settings from localStorage:", e);
  }
}

/**
 * Get all stored source IDs
 */
export function getStoredSourceIds(): string[] {
  if (!isLocalStorageAvailable()) return [];

  const ids: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(STORAGE_PREFIX)) {
      ids.push(key.slice(STORAGE_PREFIX.length));
    }
  }
  return ids;
}
