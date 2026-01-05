/**
 * Aidoku URL-based registry implementation
 * Fetches sources from remote Aidoku registry URLs (.aix packages)
 */
import type { MangaSource } from "../types";
import type { SourceRegistry, InstalledSource } from "../../../data/schema";
import type { CacheStore } from "../../../data/cache";

/** Minimal interface for installed source storage */
export interface InstalledSourceStore {
  saveInstalledSource(source: InstalledSource): Promise<void>;
  getInstalledSource(id: string): Promise<InstalledSource | null>;
}
import { Keys, CacheKeys } from "../../../data/keys";
import { createAidokuMangaSource } from "./adapter";
import type { SourceRegistryProvider, RegistrySourceInfo } from "../registry";
import { getSourceSettingsStore } from "../../../stores/source-settings";
import { normalizeSourceLangs } from "../language";
import type { Setting } from "@/lib/settings";

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

  private installedSourceStore: InstalledSourceStore;
  private cacheStore: CacheStore;

  constructor(
    id: string,
    name: string,
    indexUrl: string,
    installedSourceStore: InstalledSourceStore,
    cacheStore: CacheStore
  ) {
    this.installedSourceStore = installedSourceStore;
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

      // Modern: languages[], Legacy: lang string - normalize to BCP-47
      const rawLangs = s.languages
        ? (s.languages as string[])
        : s.lang
          ? [s.lang as string]
          : [];
      const languages = normalizeSourceLangs(rawLangs);
      // Convert empty to undefined for cleaner data
      const normalizedLanguages = languages.length > 0 ? languages : undefined;

      // Modern: contentRating (0=safe, 1=suggestive, 2=nsfw)
      // Legacy: nsfw (same values)
      const contentRating = (s.contentRating ?? s.nsfw) as number | undefined;

      return {
        id: s.id as string,
        name: s.name as string,
        version: s.version as number,
        iconPath,
        downloadPath,
        languages: normalizedLanguages,
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
    const res = await fetch(aixUrl);
    if (!res.ok) {
      throw new Error(`Failed to download .aix: ${res.status}`);
    }
    const aixData = await res.arrayBuffer();

    // Cache the entire AIX package
    const registryId = this.info.id;
    await this.cacheStore.set(CacheKeys.aix(registryId, sourceId), aixData);

    // Save installed source with composite id for storage uniqueness
    const compositeId = Keys.source(registryId, sourceId);
    await this.installedSourceStore.saveInstalledSource({
      id: compositeId,
      registryId,
      version: entry.version,
      updatedAt: Date.now(),
    });
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
    const sourceKey = Keys.source(registryId, sourceId);
    
    // Try to load from cached AIX
    let aixData = await this.cacheStore.get(CacheKeys.aix(registryId, sourceId));
    
    if (!aixData) {
      // Not installed at all - try to install
      await this.ensureFetched();
      if (!this.sourceIndex.has(sourceId)) {
        return null;
      }
      await this.installSource(sourceId);
      aixData = await this.cacheStore.get(CacheKeys.aix(registryId, sourceId));
      if (!aixData) return null;
    }

    // Get icon URL from source index (always available after ensureFetched)
    const entry = this.sourceIndex.get(sourceId);
    const icon = entry?.iconPath ? `${this.baseUrl}/${entry.iconPath}` : undefined;
    
    // Create source - this extracts AIX in the worker and returns settingsJson + manifest
    const { source, settingsJson, manifest } = await createAidokuMangaSource(aixData, sourceKey, this.cacheStore, icon);
    
    const settingsStore = getSourceSettingsStore();
    
    // Load settings schema from AIX if not already in store
    if (settingsJson && !settingsStore.getState().schemas.get(sourceKey)) {
      await settingsStore.getState().setSchema(sourceKey, settingsJson as Setting[]);
    }
    
    // Set manifest-based defaults if not already set by user
    const userValues = settingsStore.getState().values.get(sourceKey) ?? {};
    if (!userValues.languages && manifest.info.languages?.length) {
      settingsStore.getState().setSetting(sourceKey, "languages", [manifest.info.languages[0]]);
    }
    if (!userValues.url && manifest.info.urls?.length) {
      settingsStore.getState().setSetting(sourceKey, "url", manifest.info.urls[0]);
    }
    
    return source;
  }

  async isInstalled(sourceId: string): Promise<boolean> {
    const registryId = this.info.id;
    const aixData = await this.cacheStore.get(CacheKeys.aix(registryId, sourceId));
    return aixData !== null;
  }

  unloadSource(sourceId: string): void {
    const source = this.loadedSources.get(sourceId);
    if (source) {
      source.dispose();
      this.loadedSources.delete(sourceId);
    }
  }

  /** Unload all loaded sources (safe to call during React Strict Mode) */
  unloadAll(): void {
    for (const source of this.loadedSources.values()) {
      source.dispose();
    }
    this.loadedSources.clear();
  }

  dispose(): void {
    this.unloadAll();
  }
}
