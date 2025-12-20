/**
 * Aidoku URL-based registry implementation
 * Fetches sources from remote Aidoku registry URLs (.aix packages)
 */
import type { MangaSource } from "../types";
import type { SourceRegistry } from "../../../data/schema";
import type { UserDataStore } from "../../../data/store";
import type { CacheStore } from "../../../data/cache";
import { Keys, CacheKeys } from "../../../data/keys";
import { createAidokuMangaSource } from "./adapter";
import type { SourceManifest } from "./types";
import type { SourceRegistryProvider, RegistrySourceInfo } from "../registry";

// ============ SETTINGS HELPERS ============

interface SettingsItem {
  type: string;
  key?: string;
  default?: unknown;
  items?: SettingsItem[];
}

/**
 * Extract default settings values from settings.json format
 */
function extractDefaultSettings(settingsJson: SettingsItem[]): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};

  function processItems(items: SettingsItem[]) {
    for (const item of items) {
      if (item.key && item.default !== undefined) {
        defaults[item.key] = item.default;
      }
      if (item.items) {
        processItems(item.items);
      }
    }
  }

  processItems(settingsJson);
  return defaults;
}

// ============ DEFAULT AIDOKU REGISTRIES ============

export const AIDOKU_REGISTRIES = [
  {
    id: "aidoku-community",
    name: "Aidoku Community",
    indexUrl: "https://aidoku-community.github.io/sources/index.min.json",
  },
  {
    id: "aidoku-zh",
    name: "Aidoku ZH",
    indexUrl: "https://raw.githubusercontent.com/suiyuran/aidoku-zh-sources/main/public/index.min.json",
  },
] as const;

/** Normalized source entry (internal) */
interface NormalizedSourceEntry {
  id: string;
  name: string;
  version: number;
  iconPath: string;
  downloadPath: string;
  languages?: string[];
  contentRating?: number;
}

/**
 * Aidoku registry that fetches sources from a remote URL.
 * Supports both "community" format ({ name, sources: [...] }) and
 * "zh" format (array directly with file/icon fields).
 */
export class AidokuUrlRegistry implements SourceRegistryProvider {
  readonly info: SourceRegistry;
  private baseUrl: string;
  private sourceIndex: Map<string, NormalizedSourceEntry> = new Map();
  private loadedSources: Map<string, MangaSource> = new Map();
  private fetchPromise: Promise<void> | null = null;
  // Prevent race condition when loading same source concurrently
  private loadingPromises: Map<string, Promise<MangaSource | null>> = new Map();

  private userStore: UserDataStore;
  private cacheStore: CacheStore;

  constructor(
    id: string,
    name: string,
    indexUrl: string,
    userStore: UserDataStore,
    cacheStore: CacheStore
  ) {
    this.userStore = userStore;
    this.cacheStore = cacheStore;
    this.info = { id, name, type: "url", url: indexUrl };
    this.baseUrl = indexUrl.replace(/\/[^/]+$/, "");
  }

  private async ensureFetched(): Promise<void> {
    if (this.fetchPromise) return this.fetchPromise;
    this.fetchPromise = this.fetchIndex();
    return this.fetchPromise;
  }

  private async fetchIndex(): Promise<void> {
    const url = (this.info as { url: string }).url;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch registry index: ${res.status}`);
    }
    const data = await res.json();
    const entries = this.parseIndex(data);
    for (const entry of entries) {
      this.sourceIndex.set(entry.id, entry);
    }
  }

  /**
   * Parse index data, supporting multiple formats:
   * - Modern format: { name: string, sources: [{ iconURL, downloadURL, ... }] }
   * - Legacy format: [{ icon, file, lang, nsfw, ... }] (array directly)
   * 
   * See: vendor/Aidoku/Aidoku/Shared/Sources/ExternalSourceInfo.swift
   */
  private parseIndex(data: unknown): NormalizedSourceEntry[] {
    const sources = Array.isArray(data)
      ? data
      : (data as { sources?: unknown[] }).sources ?? [];

    return sources.map((s: Record<string, unknown>) => {
      // Modern: iconURL is full relative path (e.g. "icons/id-v1.png")
      // Legacy: icon is just filename, needs "icons/" prefix
      const iconPath = s.iconURL
        ? (s.iconURL as string)
        : s.icon
          ? `icons/${s.icon}`
          : "";

      // Modern: downloadURL is full relative path (e.g. "sources/id-v1.aix")
      // Legacy: file is just filename, needs "sources/" prefix
      const downloadPath = s.downloadURL
        ? (s.downloadURL as string)
        : s.file
          ? `sources/${s.file}`
          : "";

      // Modern: languages[], Legacy: lang string
      const languages = s.languages
        ? (s.languages as string[])
        : s.lang
          ? [s.lang as string]
          : undefined;

      // Modern: contentRating (0=safe, 1=suggestive, 2=nsfw)
      // Legacy: nsfw (same values)
      const contentRating = (s.contentRating ?? s.nsfw) as number | undefined;

      return {
        id: s.id as string,
        name: s.name as string,
        version: s.version as number,
        iconPath,
        downloadPath,
        languages,
        contentRating,
      };
    });
  }

  async listSources(): Promise<RegistrySourceInfo[]> {
    await this.ensureFetched();
    return Array.from(this.sourceIndex.values()).map((s) => ({
      id: s.id,
      name: s.name,
      version: s.version,
      icon: s.iconPath ? `${this.baseUrl}/${s.iconPath}` : undefined,
      languages: s.languages,
      contentRating: s.contentRating,
    }));
  }

  async installSource(sourceId: string): Promise<void> {
    await this.ensureFetched();
    const entry = this.sourceIndex.get(sourceId);
    if (!entry) {
      throw new Error(`Source not found: ${sourceId}`);
    }

    const aixUrl = `${this.baseUrl}/${entry.downloadPath}`;
    const { wasmBytes, manifest, settingsBytes } = await this.downloadAndExtractAix(aixUrl);

    const registryId = this.info.id;
    await this.cacheStore.set(CacheKeys.wasm(registryId, sourceId), wasmBytes);

    const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));
    await this.cacheStore.set(
      CacheKeys.manifest(registryId, sourceId),
      manifestBytes.buffer as ArrayBuffer
    );

    // Cache settings.json if present
    if (settingsBytes) {
      await this.cacheStore.set(
        CacheKeys.settings(registryId, sourceId),
        settingsBytes
      );
    }

    // Save installed source with composite id for storage uniqueness
    await this.userStore.saveInstalledSource({
      id: Keys.source(registryId, sourceId),
      registryId,
      version: entry.version,
    });
  }

  private async downloadAndExtractAix(
    url: string
  ): Promise<{ wasmBytes: ArrayBuffer; manifest: SourceManifest; settingsBytes?: ArrayBuffer }> {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to download .aix: ${res.status}`);
    }
    const zipData = await res.arrayBuffer();

    const { unzipSync } = await import("fflate");
    const files = unzipSync(new Uint8Array(zipData));

    const manifestData = files["Payload/source.json"];
    const wasmData = files["Payload/main.wasm"];
    const settingsData = files["Payload/settings.json"];

    if (!manifestData || !wasmData) {
      throw new Error("Invalid .aix package: missing source.json or main.wasm");
    }

    const manifest: SourceManifest = JSON.parse(
      new TextDecoder().decode(manifestData)
    );
    return {
      wasmBytes: wasmData.buffer.slice(0) as ArrayBuffer,
      manifest,
      settingsBytes: settingsData ? settingsData.buffer.slice(0) as ArrayBuffer : undefined,
    };
  }

  async getSource(sourceId: string): Promise<MangaSource | null> {
    // Check if already loaded
    const cached = this.loadedSources.get(sourceId);
    if (cached) return cached;
    
    // Check if currently loading (prevent race condition)
    const loadingPromise = this.loadingPromises.get(sourceId);
    if (loadingPromise) return loadingPromise;
    
    // Start loading and store the promise
    const promise = this.loadSourceInternal(sourceId);
    this.loadingPromises.set(sourceId, promise);
    
    try {
      const source = await promise;
      if (source) {
        this.loadedSources.set(sourceId, source);
      }
      return source;
    } finally {
      this.loadingPromises.delete(sourceId);
    }
  }
  
  private async loadSourceInternal(sourceId: string): Promise<MangaSource | null> {
    const registryId = this.info.id;
    const wasmBytes = await this.cacheStore.get(CacheKeys.wasm(registryId, sourceId));
    const manifestBytes = await this.cacheStore.get(CacheKeys.manifest(registryId, sourceId));

    if (!wasmBytes || !manifestBytes) {
      await this.ensureFetched();
      if (!this.sourceIndex.has(sourceId)) {
        return null;
      }
      await this.installSource(sourceId);
      return this.loadSourceInternal(sourceId);
    }

    const manifest: SourceManifest = JSON.parse(
      new TextDecoder().decode(manifestBytes)
    );

    // Load default settings from cached settings.json
    let settingsBytes = await this.cacheStore.get(CacheKeys.settings(registryId, sourceId));
    
    // If settings not cached, try to fetch and cache them
    if (!settingsBytes) {
      await this.ensureFetched();
      const entry = this.sourceIndex.get(sourceId);
      if (entry) {
        try {
          const aixUrl = `${this.baseUrl}/${entry.downloadPath}`;
          const { settingsBytes: newSettingsBytes } = await this.downloadAndExtractAix(aixUrl);
          if (newSettingsBytes) {
            await this.cacheStore.set(CacheKeys.settings(registryId, sourceId), newSettingsBytes);
            settingsBytes = newSettingsBytes;
          }
        } catch {
          // Ignore fetch errors for settings
        }
      }
    }
    
    let initialSettings: Record<string, unknown> | undefined;
    if (settingsBytes) {
      try {
        const settingsJson = JSON.parse(new TextDecoder().decode(settingsBytes));
        initialSettings = extractDefaultSettings(settingsJson);
      } catch {
        // Ignore settings parsing errors
      }
    }
    
    // Add default language from manifest if not in settings
    if (!initialSettings) {
      initialSettings = {};
    }
    if (!initialSettings.languages && manifest.info.languages?.length) {
      initialSettings.languages = [manifest.info.languages[0]];
    }
    
    console.log(`[AidokuRegistry] Loading source ${sourceId} with settings:`, initialSettings);

    return createAidokuMangaSource(wasmBytes, manifest, { initialSettings });
  }

  async isInstalled(sourceId: string): Promise<boolean> {
    const registryId = this.info.id;
    const wasmBytes = await this.cacheStore.get(CacheKeys.wasm(registryId, sourceId));
    return wasmBytes !== null;
  }

  dispose(): void {
    for (const source of this.loadedSources.values()) {
      source.dispose();
    }
    this.loadedSources.clear();
  }
}

