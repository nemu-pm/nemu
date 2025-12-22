/**
 * Dev registry for locally built Tachiyomi extensions.
 * Reads from /dev/tachiyomi-extensions/ served by Vite dev server.
 * 
 * The Vite plugin automatically scans for extensions - no manual index generation needed.
 * 
 * Usage:
 * 1. Build an extension: cd packages/tachiyomi-js && ./gradlew devBuild -Pextension=all/mangadex
 * 2. Start dev server: bun dev
 * 3. Add dev source from Settings > Add Source > Dev Extensions
 */
import type { SourceRegistry } from "@/data/schema";
import type { UserDataStore } from "@/data/store";
import type { CacheStore } from "@/data/cache";
import type { SourceRegistryProvider, RegistrySourceInfo } from "../registry";
import type { MangaSource } from "../types";
import type { TachiyomiManifest } from "./types";
import { createAsyncTachiyomiSource } from "./async-source";
import { createTachiyomiBrowsableSource, SOURCE_SELECTION_KEY } from "./adapter";
import { Keys } from "@/data/keys";
import { getSourceSettingsStore } from "@/stores/source-settings";
import { normalizeSourceLangs } from "../language";

export const TACHIYOMI_DEV_REGISTRY_ID = "tachiyomi-dev";

interface DevExtension {
  dirName: string;
  manifest: TachiyomiManifest;
  jsUrl: string;
  iconUrl?: string;
}

/**
 * Dev registry for locally built Tachiyomi extensions.
 * Only enabled in development mode (import.meta.env.DEV).
 */
export class TachiyomiDevRegistry implements SourceRegistryProvider {
  readonly info: SourceRegistry = {
    id: TACHIYOMI_DEV_REGISTRY_ID,
    name: "Tachiyomi Dev",
    type: "builtin",
  };

  private userStore: UserDataStore;
  private cacheStore: CacheStore;
  private extensions = new Map<string, DevExtension>();
  private loadedSources = new Map<string, MangaSource>();
  private initialized = false;

  constructor(userStore: UserDataStore, cacheStore: CacheStore) {
    this.userStore = userStore;
    this.cacheStore = cacheStore;
  }

  /**
   * Update the user store (called when auth state changes)
   */
  setUserStore(store: UserDataStore): void {
    this.userStore = store;
  }

  /**
   * Update the cache store
   */
  setCacheStore(store: CacheStore): void {
    this.cacheStore = store;
  }

  /**
   * Scan dev/tachiyomi-extensions/ for built extensions
   */
  async listSources(): Promise<RegistrySourceInfo[]> {
    await this.ensureInitialized();
    
    const results: RegistrySourceInfo[] = [];
    
    for (const [id, ext] of this.extensions) {
      const languages = normalizeSourceLangs([ext.manifest.lang]);
      results.push({
        id,
        name: ext.manifest.name,
        version: ext.manifest.version,
        icon: ext.iconUrl,
        languages: languages.length > 0 ? languages : undefined,
        hasAuthentication: ext.manifest.hasWebView,
        hasCloudflare: ext.manifest.hasCloudflare,
      });
    }
    
    return results;
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    
    try {
      // Fetch the index of available extensions
      const response = await fetch("/dev/tachiyomi-extensions/index.json");
      if (!response.ok) {
        console.log("[TachiyomiDev] No index.json found - no dev extensions available");
        this.initialized = true;
        return;
      }
      
      const extensionDirs: string[] = await response.json();
      console.log(`[TachiyomiDev] Found ${extensionDirs.length} dev extensions`);
      
      for (const dir of extensionDirs) {
        try {
          const manifestRes = await fetch(`/dev/tachiyomi-extensions/${dir}/manifest.json`);
          if (!manifestRes.ok) continue;
          
          const manifest: TachiyomiManifest = await manifestRes.json();
          const jsUrl = `/dev/tachiyomi-extensions/${dir}/${manifest.jsPath}`;
          const iconUrl = manifest.icon ? `/dev/tachiyomi-extensions/${dir}/${manifest.icon}` : undefined;
          
          // Store extension info (sources loaded lazily via getSource)
          this.extensions.set(dir, { dirName: dir, manifest, jsUrl, iconUrl });
          
          console.log(`[TachiyomiDev] Loaded ${manifest.name} (${dir})`);
        } catch (e) {
          console.warn(`[TachiyomiDev] Failed to load ${dir}:`, e);
        }
      }
    } catch (e) {
      console.log("[TachiyomiDev] Could not fetch index.json:", e);
    }
    
    this.initialized = true;
  }

  async installSource(sourceId: string): Promise<void> {
    await this.ensureInitialized();
    
    const ext = this.extensions.get(sourceId);
    if (!ext) {
      throw new Error(`Extension not found: ${sourceId}`);
    }
    
    // Save to user store so it appears in installed sources
    await this.userStore.saveInstalledSource({
      id: Keys.source(TACHIYOMI_DEV_REGISTRY_ID, sourceId),
      registryId: TACHIYOMI_DEV_REGISTRY_ID,
      version: ext.manifest.version,
    });
  }

  async isInstalled(sourceId: string): Promise<boolean> {
    await this.ensureInitialized();
    return this.extensions.has(sourceId);
  }

  async getSource(sourceId: string): Promise<MangaSource | null> {
    await this.ensureInitialized();
    
    // Check cache first
    const cached = this.loadedSources.get(sourceId);
    if (cached) return cached;

    const ext = this.extensions.get(sourceId);
    if (!ext) {
      console.warn(`[TachiyomiDev] Extension not found: ${sourceId}`);
      return null;
    }

    try {
      const sourceKey = Keys.source(TACHIYOMI_DEV_REGISTRY_ID, sourceId);
      
      // Get sources from manifest (should be populated at build time)
      const sources = ext.manifest.sources ?? [];
      if (sources.length === 0) {
        throw new Error(`No sources in manifest. Rebuild extension: ${ext.manifest.name}`);
      }
      
      // Determine which source to load
      const settingsStore = getSourceSettingsStore();
      await settingsStore.getState().initialize();
      const savedSettings = settingsStore.getState().values.get(sourceKey) ?? {};
      const savedSourceId = savedSettings[SOURCE_SELECTION_KEY] as string | undefined;
      
      let selectedSourceId: string;
      if (savedSourceId && sources.some(s => s.id === savedSourceId)) {
        selectedSourceId = savedSourceId;
      } else {
        const englishSource = sources.find(s => s.lang === "en");
        selectedSourceId = englishSource?.id ?? sources[0].id;
      }
      
      const asyncSource = await createAsyncTachiyomiSource(ext.jsUrl, ext.manifest, selectedSourceId);
      const source = await createTachiyomiBrowsableSource(asyncSource, sourceKey, this.cacheStore);
      this.loadedSources.set(sourceId, source);
      
      console.log(`[TachiyomiDev] Loaded source: ${source.name} (${selectedSourceId})`);
      return source;
    } catch (e) {
      console.error(`[TachiyomiDev] Failed to load source ${sourceId}:`, e);
      return null;
    }
  }

  /**
   * Unload a source from the registry (disposes and clears cache)
   */
  unloadSource(sourceId: string): void {
    const source = this.loadedSources.get(sourceId);
    if (source) {
      source.dispose();
      this.loadedSources.delete(sourceId);
    }
  }

  /**
   * Force reload extensions (useful for hot reload during dev)
   */
  async reload(): Promise<void> {
    // Dispose existing sources
    for (const source of this.loadedSources.values()) {
      source.dispose();
    }
    this.loadedSources.clear();
    this.extensions.clear();
    this.initialized = false;
    
    await this.ensureInitialized();
  }
}

