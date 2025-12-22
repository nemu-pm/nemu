// Web Worker for running Tachiyomi Kotlin/JS extension sources
// Sync XHR works in workers, enabling blocking HTTP calls from Kotlin/JS
import * as Comlink from "comlink";
import { proxyUrl } from "@/config";
import type {
  TachiyomiSourceInfo,
  MangaDto,
  ChapterDto,
  PageDto,
  MangasPageDto,
  TachiyomiManifest,
  TachiyomiFilter,
} from "./types";

// ============ HTTP Bridge Implementation ============
// Provides tachiyomiHttpRequest() to the Kotlin/JS runtime

interface HttpResult {
  status: number;
  statusText: string;
  headersJson: string;
  body: string;
  error: string | null;
}

/**
 * Synchronous HTTP request implementation using XMLHttpRequest.
 * Called by Kotlin/JS OkHttp shim via globalThis.tachiyomiHttpRequest
 */
function tachiyomiHttpRequest(
  url: string,
  method: string,
  headersJson: string,
  body: string | null,
  wantBytes: boolean
): HttpResult {
  try {
    const xhr = new XMLHttpRequest();
    xhr.open(method, proxyUrl(url), false); // false = synchronous
    xhr.responseType = wantBytes ? "arraybuffer" : "text";

    // Parse and set headers with x-proxy- prefix for CORS proxy
    const headers = JSON.parse(headersJson || "{}") as Record<string, string>;
    for (const [key, value] of Object.entries(headers)) {
      try {
        xhr.setRequestHeader(`x-proxy-${key}`, value);
      } catch {
        // Some headers can't be set in browsers
      }
    }

    xhr.send(body);

    // Collect response headers
    const responseHeaders: Record<string, string> = {};
    const headerLines = xhr.getAllResponseHeaders().split("\r\n");
    for (const line of headerLines) {
      const idx = line.indexOf(": ");
      if (idx > 0) {
        const key = line.substring(0, idx).toLowerCase();
        const value = line.substring(idx + 2);
        responseHeaders[key] = responseHeaders[key]
          ? `${responseHeaders[key]}, ${value}`
          : value;
      }
    }

    // Get body - text or base64
    let responseBody: string;
    if (wantBytes) {
      const bytes = new Uint8Array(xhr.response as ArrayBuffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      responseBody = btoa(binary);
    } else {
      responseBody = xhr.responseText;
    }

    return {
      status: xhr.status,
      statusText: xhr.statusText,
      headersJson: JSON.stringify(responseHeaders),
      body: responseBody,
      error: null,
    };
  } catch (e) {
    return {
      status: 0,
      statusText: "",
      headersJson: "{}",
      body: "",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// Expose to Kotlin/JS runtime
(globalThis as Record<string, unknown>).tachiyomiHttpRequest = tachiyomiHttpRequest;

// ============ Preferences Bridge ============
// In-memory preferences storage, synced with main thread's IndexedDB store

// Storage: prefsName -> { key -> value }
const prefsStorage = new Map<string, Map<string, unknown>>();

// Pending changes to be synced to main thread
let pendingPrefChanges: Array<{ name: string; key: string; value: unknown }> = [];

/**
 * Get all prefs for a given name (for initial load)
 */
function __prefs_getAll(name: string): Record<string, unknown> {
  const prefs = prefsStorage.get(name);
  if (!prefs) return {};
  return Object.fromEntries(prefs);
}

/**
 * Get a single pref value
 */
function __prefs_get(name: string, key: string): unknown {
  return prefsStorage.get(name)?.get(key);
}

/**
 * Set a single pref value (updates in-memory + queues for main thread sync)
 */
function __prefs_set(name: string, key: string, value: unknown): void {
  let prefs = prefsStorage.get(name);
  if (!prefs) {
    prefs = new Map();
    prefsStorage.set(name, prefs);
  }
  prefs.set(key, value);
  pendingPrefChanges.push({ name, key, value });
}

/**
 * Remove a single pref
 */
function __prefs_remove(name: string, key: string): void {
  prefsStorage.get(name)?.delete(key);
  pendingPrefChanges.push({ name, key, value: undefined });
}

/**
 * Clear all prefs for a name
 */
function __prefs_clear(name: string): void {
  prefsStorage.delete(name);
  // Signal clear to main thread
  pendingPrefChanges.push({ name, key: "__clear__", value: null });
}

// Expose to Kotlin/JS
(globalThis as Record<string, unknown>).__prefs_getAll = __prefs_getAll;
(globalThis as Record<string, unknown>).__prefs_get = __prefs_get;
(globalThis as Record<string, unknown>).__prefs_set = __prefs_set;
(globalThis as Record<string, unknown>).__prefs_remove = __prefs_remove;
(globalThis as Record<string, unknown>).__prefs_clear = __prefs_clear;

// ============ Image Codec Bridge ============
// Provides sync JPEG/PNG decode/encode via jpeg-js library
import { decodeImage, encodeJpeg, encodePng } from "./image-codec";

/**
 * Decode image bytes (JPEG/PNG) to ARGB pixel array.
 * Called by Kotlin BitmapFactory shim.
 * 
 * @param base64Data Base64-encoded image bytes
 * @returns { width, height, pixelsBase64 } or null on failure
 */
function tachiyomiDecodeImage(base64Data: string): { width: number; height: number; pixelsBase64: string } | null {
  try {
    // Decode base64 to bytes
    const binary = atob(base64Data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    
    const result = decodeImage(bytes);
    if (!result) return null;
    
    // Encode pixels as base64 (Int32Array → bytes → base64)
    const pixelBytes = new Uint8Array(result.pixels.buffer);
    let pixelBinary = "";
    for (let i = 0; i < pixelBytes.length; i++) {
      pixelBinary += String.fromCharCode(pixelBytes[i]);
    }
    
    return {
      width: result.width,
      height: result.height,
      pixelsBase64: btoa(pixelBinary),
    };
  } catch (e) {
    console.error("[Tachiyomi] Image decode error:", e);
    return null;
  }
}

/**
 * Encode ARGB pixels to JPEG/PNG.
 * Called by Kotlin Bitmap.compress shim.
 * 
 * @param pixelsBase64 Base64-encoded Int32Array pixels (ARGB)
 * @param width Image width
 * @param height Image height
 * @param format "jpeg" or "png"
 * @param quality JPEG quality (0-100)
 * @returns Base64-encoded image bytes
 */
function tachiyomiEncodeImage(
  pixelsBase64: string,
  width: number,
  height: number,
  format: string,
  quality: number
): string | null {
  try {
    // Decode pixels from base64
    const binary = atob(pixelsBase64);
    const pixelBytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      pixelBytes[i] = binary.charCodeAt(i);
    }
    const pixels = new Int32Array(pixelBytes.buffer);
    
    // Encode to image format
    let encoded: Uint8Array;
    if (format === "jpeg") {
      encoded = encodeJpeg(pixels, width, height, quality);
    } else {
      encoded = encodePng(pixels, width, height);
    }
    
    // Return as base64
    let resultBinary = "";
    for (let i = 0; i < encoded.length; i++) {
      resultBinary += String.fromCharCode(encoded[i]);
    }
    return btoa(resultBinary);
  } catch (e) {
    console.error("[Tachiyomi] Image encode error:", e);
    return null;
  }
}

// Expose image codec to Kotlin/JS
(globalThis as Record<string, unknown>).tachiyomiDecodeImage = tachiyomiDecodeImage;
(globalThis as Record<string, unknown>).tachiyomiEncodeImage = tachiyomiEncodeImage;

// Kotlin/JS module exports (generated by tachiyomi-compiler)
interface TachiyomiJsExports {
  // Manifest & metadata
  getManifest(): string; // JSON Result<TachiyomiSourceInfo[]>
  getFilterList(sourceId: string): string; // JSON Result<TachiyomiFilter[]>
  resetFilters(sourceId: string): string; // JSON Result<{ ok: true }>
  applyFilterState(sourceId: string, filterStateJson: string): string; // JSON Result<{ ok: true }>
  
  // Data methods (sourceId-based)
  getPopularManga(sourceId: string, page: number): string;
  getLatestUpdates(sourceId: string, page: number): string;
  searchManga(sourceId: string, page: number, query: string): string;
  getMangaDetails(sourceId: string, mangaUrl: string): string;
  getChapterList(sourceId: string, mangaUrl: string): string;
  getPageList(sourceId: string, chapterUrl: string): string;
  fetchImage(sourceId: string, pageUrl: string, pageImageUrl: string): string;
}

// Result wrapper from Kotlin/JS
interface JsResult<T> {
  ok: boolean;
  data?: T;
  error?: {
    type: string;
    message: string;
    stack: string;
    logs: string[];
  };
}

/**
 * Unwrap Kotlin/JS result and throw with full stack trace if error
 */
function unwrapResult<T>(jsonStr: string): T {
  const result: JsResult<T> = JSON.parse(jsonStr);
  if (!result.ok) {
    const err = result.error!;
    console.error(`[Tachiyomi] Error: ${err.type}: ${err.message}`);
    if (err.logs.length > 0) {
      console.error("[Tachiyomi] Logs:", err.logs);
    }
    if (err.stack) {
      console.error("[Tachiyomi] Stack:", err.stack);
    }
    throw new Error(`${err.type}: ${err.message}`);
  }
  return result.data!;
}

class WorkerSource {
  private exports: TachiyomiJsExports | null = null;
  private manifest: TachiyomiManifest | null = null;
  private currentSourceId: string | null = null;

  // ============ Preferences Methods ============

  /**
   * Initialize preferences for a source before loading.
   * Called by main thread with stored values.
   */
  initPreferences(prefsName: string, values: Record<string, unknown>): void {
    const prefs = new Map<string, unknown>();
    for (const [key, value] of Object.entries(values)) {
      prefs.set(key, value);
    }
    prefsStorage.set(prefsName, prefs);
  }

  /**
   * Get and clear pending preference changes for main thread sync.
   */
  flushPrefChanges(): Array<{ name: string; key: string; value: unknown }> {
    const changes = pendingPrefChanges;
    pendingPrefChanges = [];
    return changes;
  }

  /**
   * Get settings schema JSON by invoking setupPreferenceScreen.
   * Returns Aidoku-compatible schema format.
   */
  getSettingsSchema(sourceId: string): string | null {
    if (!this.exports) return null;
    try {
      // Call the getSettingsSchema export which invokes setupPreferenceScreen
      const json = (this.exports as TachiyomiJsExports & { getSettingsSchema(sourceId: string): string }).getSettingsSchema(sourceId);
      const result = JSON.parse(json) as { ok: boolean; data?: string; error?: unknown };
      if (!result.ok) {
        console.error("[Tachiyomi Worker] getSettingsSchema failed:", result.error);
        return null;
      }
      // result.data is the schema JSON string from PreferenceRegistry
      return result.data ?? null;
    } catch (e) {
      console.error("[Tachiyomi Worker] getSettingsSchema error:", e);
      return null;
    }
  }

  async load(jsUrl: string, manifest: TachiyomiManifest): Promise<boolean> {
    try {
      console.log("[Tachiyomi Worker] Loading JS from:", jsUrl);
      this.manifest = manifest;

      // Import Kotlin/JS module (webpack UMD format)
      // Module name is set to "$lang-$name" in build.gradle.kts (e.g., "all-mangadex")
      await import(/* @vite-ignore */ jsUrl);
      
      // Webpack exports to globalThis['$moduleName'].tachiyomi.generated
      // The module name is passed as part of the sourceId (e.g., "all-mangadex")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g = globalThis as any;
      
      // Find the extension module - it's the only one with tachiyomi.generated
      let exports: TachiyomiJsExports | null = null;
      for (const key of Object.keys(g)) {
        if (g[key]?.tachiyomi?.generated) {
          exports = g[key].tachiyomi.generated;
          break;
        }
      }
      
      if (!exports || typeof exports.getManifest !== "function") {
        console.error("[Tachiyomi Worker] Could not find tachiyomi.generated exports");
        return false;
      }
      
      this.exports = exports;
      
      // Load sources metadata from the extension
      const sourcesJson = this.exports.getManifest();
      const sources = unwrapResult<TachiyomiSourceInfo[]>(sourcesJson);
      this.manifest.sources = sources;
      
      console.log("[Tachiyomi Worker] Loaded, sources:", sources.length, sources.map(s => s.name).slice(0, 5));
      
      return sources.length > 0;
    } catch (e) {
      console.error("[Tachiyomi Worker] Failed to load:", e);
      return false;
    }
  }

  isLoaded(): boolean {
    return this.exports !== null;
  }

  getManifest(): TachiyomiManifest | null {
    return this.manifest;
  }

  getSources(): TachiyomiSourceInfo[] {
    return this.manifest?.sources ?? [];
  }

  setSourceId(sourceId: string): void {
    this.currentSourceId = sourceId;
  }

  // ============ Filter Methods ============

  getFilterList(sourceId: string): TachiyomiFilter[] {
    if (!this.exports) return [];
    try {
      const json = this.exports.getFilterList(sourceId);
      return unwrapResult<TachiyomiFilter[]>(json);
    } catch (e) {
      console.error("[Tachiyomi Worker] getFilterList error:", e);
      return [];
    }
  }

  resetFilters(sourceId: string): boolean {
    if (!this.exports) return false;
    try {
      const json = this.exports.resetFilters(sourceId);
      unwrapResult<{ ok: boolean }>(json);
      return true;
    } catch (e) {
      console.error("[Tachiyomi Worker] resetFilters error:", e);
      return false;
    }
  }

  applyFilterState(sourceId: string, filterStateJson: string): boolean {
    if (!this.exports) return false;
    try {
      const json = this.exports.applyFilterState(sourceId, filterStateJson);
      unwrapResult<{ ok: boolean }>(json);
      return true;
    } catch (e) {
      console.error("[Tachiyomi Worker] applyFilterState error:", e);
      return false;
    }
  }

  // ============ Data Methods ============

  getPopularManga(page: number): MangasPageDto {
    if (!this.exports || !this.currentSourceId) return { mangas: [], hasNextPage: false };
    try {
      const json = this.exports.getPopularManga(this.currentSourceId, page);
      return unwrapResult<MangasPageDto>(json);
    } catch (e) {
      console.error("[Tachiyomi Worker] getPopularManga error:", e);
      return { mangas: [], hasNextPage: false };
    }
  }

  getLatestUpdates(page: number): MangasPageDto {
    if (!this.exports || !this.currentSourceId) return { mangas: [], hasNextPage: false };
    try {
      const json = this.exports.getLatestUpdates(this.currentSourceId, page);
      return unwrapResult<MangasPageDto>(json);
    } catch (e) {
      console.error("[Tachiyomi Worker] getLatestUpdates error:", e);
      return { mangas: [], hasNextPage: false };
    }
  }

  searchManga(page: number, query: string): MangasPageDto {
    if (!this.exports || !this.currentSourceId) return { mangas: [], hasNextPage: false };
    try {
      const json = this.exports.searchManga(this.currentSourceId, page, query);
      return unwrapResult<MangasPageDto>(json);
    } catch (e) {
      console.error("[Tachiyomi Worker] searchManga error:", e);
      return { mangas: [], hasNextPage: false };
    }
  }

  /**
   * Search with filter state applied.
   * Applies filterStateJson to cached filters before searching.
   */
  searchMangaWithFilters(page: number, query: string, filterStateJson: string): MangasPageDto {
    if (!this.exports || !this.currentSourceId) return { mangas: [], hasNextPage: false };
    try {
      // Apply filter state before searching
      if (filterStateJson && filterStateJson !== "[]") {
        this.exports.applyFilterState(this.currentSourceId, filterStateJson);
      }
      const json = this.exports.searchManga(this.currentSourceId, page, query);
      return unwrapResult<MangasPageDto>(json);
    } catch (e) {
      console.error("[Tachiyomi Worker] searchMangaWithFilters error:", e);
      return { mangas: [], hasNextPage: false };
    }
  }

  getMangaDetails(mangaUrl: string): MangaDto | null {
    if (!this.exports || !this.currentSourceId) return null;
    try {
      const json = this.exports.getMangaDetails(this.currentSourceId, mangaUrl);
      return unwrapResult<MangaDto>(json);
    } catch (e) {
      console.error("[Tachiyomi Worker] getMangaDetails error:", e);
      return null;
    }
  }

  getChapterList(mangaUrl: string): ChapterDto[] {
    if (!this.exports || !this.currentSourceId) return [];
    try {
      const json = this.exports.getChapterList(this.currentSourceId, mangaUrl);
      return unwrapResult<ChapterDto[]>(json);
    } catch (e) {
      console.error("[Tachiyomi Worker] getChapterList error:", e);
      return [];
    }
  }

  getPageList(chapterUrl: string): PageDto[] {
    if (!this.exports || !this.currentSourceId) return [];
    try {
      const json = this.exports.getPageList(this.currentSourceId, chapterUrl);
      return unwrapResult<PageDto[]>(json);
    } catch (e) {
      console.error("[Tachiyomi Worker] getPageList error:", e);
      return [];
    }
  }

  /**
   * Fetch image through the source's OkHttp client (with interceptors).
   * Returns base64-encoded image bytes.
   */
  fetchImage(pageUrl: string, pageImageUrl: string): string {
    if (!this.exports || !this.currentSourceId) return "";
    try {
      const json = this.exports.fetchImage(this.currentSourceId, pageUrl, pageImageUrl);
      return unwrapResult<string>(json);
    } catch (e) {
      console.error("[Tachiyomi Worker] fetchImage error:", e);
      return "";
    }
  }
}

const workerSource = new WorkerSource();
Comlink.expose(workerSource);

export type WorkerSourceApi = WorkerSource;
