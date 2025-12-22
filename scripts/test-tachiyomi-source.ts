#!/usr/bin/env bun
/**
 * Test script for Tachiyomi Kotlin/JS extensions
 * 
 * ============================================================================
 * QUICK DEBUG COMMANDS
 * ============================================================================
 * 
 * # Build an extension first:
 * cd packages/tachiyomi-js && ./gradlew devBuild -Pextension=all/mangadex
 * 
 * # Run tests:
 * bun scripts/test-tachiyomi-source.ts all-mangadex info
 * bun scripts/test-tachiyomi-source.ts all-mangadex popular
 * bun scripts/test-tachiyomi-source.ts all-mangadex search "one piece"
 * bun scripts/test-tachiyomi-source.ts all-mangadex details "/manga/a1c7c817-..."
 * bun scripts/test-tachiyomi-source.ts all-mangadex chapters "/manga/a1c7c817-..."
 * bun scripts/test-tachiyomi-source.ts all-mangadex pages "/chapter/abc123-..."
 * bun scripts/test-tachiyomi-source.ts all-mangadex read "/manga/..." "/chapter/..."
 * bun scripts/test-tachiyomi-source.ts all-mangadex filters
 * bun scripts/test-tachiyomi-source.ts all-mangadex interactive
 * 
 * ============================================================================
 * 
 * Usage: bun scripts/test-tachiyomi-source.ts <extension-name> [command] [args...]
 * 
 * Commands:
 *   info                      Show source info (manifest + sources)
 *   popular [page]            Get popular manga
 *   latest [page]             Get latest updates
 *   search [query] [page]     Search for manga
 *   details <manga-url>       Get manga details
 *   chapters <manga-url>      Get chapter list
 *   pages <chapter-url>       Get page list
 *   read <manga-url> <ch-url> Full end-to-end test
 *   filters                   Show filter schema
 *   interactive               Interactive REPL mode
 * 
 * Environment:
 *   PROXY_URL                 Proxy server URL (default: https://service.nemu.pm)
 *   SOURCE_LANG               Language to select (default: en, or first available)
 *   DEBUG=1                   Enable verbose logging
 */

import { existsSync, readdirSync, readFileSync } from "fs";
import path from "path";
import { proxyRequest } from "./lib/proxy-request";

const DEBUG = process.env.DEBUG === "1";
const SOURCE_LANG = process.env.SOURCE_LANG || "en";
const PROXY_URL = process.env.PROXY_URL || "https://service.nemu.pm";

// Extensions directory relative to project root
const EXTENSIONS_BASE = path.resolve(import.meta.dir, "../dev/extensions");

// ============================================================================
// HTTP Bridge for Kotlin/JS (tachiyomiHttpRequest)
// ============================================================================

/**
 * HTTP implementation for Kotlin/JS runtime.
 * Called by the tachiyomi-js OkHttp shim via globalThis.tachiyomiHttpRequest
 */
function tachiyomiHttpRequest(
  url: string,
  method: string,
  headersJson: string,
  body: string | null,
  wantBytes: boolean
): { status: number; statusText: string; headersJson: string; body: string; error: string | null } {
  const headers = JSON.parse(headersJson || "{}") as Record<string, string>;
  
  const resp = proxyRequest(url, { method, headers, body, wantBytes, debug: DEBUG });
  
  if (DEBUG && !resp.error) {
    console.log(`[HTTP] Response: ${resp.status}, ${resp.body.length} bytes`);
  }
  
  return {
    status: resp.status,
    statusText: resp.statusText,
    headersJson: JSON.stringify(resp.headers),
    body: resp.body,
    error: resp.error,
  };
}

// Install HTTP bridge for Kotlin/JS runtime
(globalThis as Record<string, unknown>).tachiyomiHttpRequest = tachiyomiHttpRequest;

if (DEBUG) {
  console.log("[Bridge] tachiyomiHttpRequest installed");
}

// ============================================================================
// Image Codec Bridge (same as source.worker.ts)
// ============================================================================
import { decodeImage, encodeJpeg, encodePng } from "../src/lib/sources/tachiyomi/image-codec";

function tachiyomiDecodeImage(base64Data: string): { width: number; height: number; pixelsBase64: string } | null {
  try {
    const binary = atob(base64Data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    
    const result = decodeImage(bytes);
    if (!result) return null;
    
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
    console.error("[Test] Image decode error:", e);
    return null;
  }
}

function tachiyomiEncodeImage(
  pixelsBase64: string,
  width: number,
  height: number,
  format: string,
  quality: number
): string | null {
  try {
    const binary = atob(pixelsBase64);
    const pixelBytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      pixelBytes[i] = binary.charCodeAt(i);
    }
    const pixels = new Int32Array(pixelBytes.buffer);
    
    let encoded: Uint8Array;
    if (format === "jpeg") {
      encoded = encodeJpeg(pixels, width, height, quality);
    } else {
      encoded = encodePng(pixels, width, height);
    }
    
    let resultBinary = "";
    for (let i = 0; i < encoded.length; i++) {
      resultBinary += String.fromCharCode(encoded[i]);
    }
    return btoa(resultBinary);
  } catch (e) {
    console.error("[Test] Image encode error:", e);
    return null;
  }
}

(globalThis as Record<string, unknown>).tachiyomiDecodeImage = tachiyomiDecodeImage;
(globalThis as Record<string, unknown>).tachiyomiEncodeImage = tachiyomiEncodeImage;

if (DEBUG) {
  console.log("[Bridge] Image codec installed");
}

// ============================================================================
// Types
// ============================================================================

interface SourceInfo {
  id: string;
  name: string;
  lang: string;
  baseUrl?: string;
  supportsLatest?: boolean;
}

interface ExtensionManifest {
  name: string;
  pkg: string;
  lang: string;
  version: string;
  nsfw: boolean;
  jsPath: string;
}

interface JsExports {
  getManifest(): string;
  getFilterList(sourceId: string): string;
  getPopularManga(sourceId: string, page: number): string;
  getLatestUpdates(sourceId: string, page: number): string;
  searchManga(sourceId: string, page: number, query: string): string;
  getMangaDetails(sourceId: string, mangaUrl: string): string;
  getChapterList(sourceId: string, mangaUrl: string): string;
  getPageList(sourceId: string, chapterUrl: string): string;
  fetchImage(sourceId: string, pageUrl: string, pageImageUrl: string): string;
  // Legacy
  getSourceCount(): number;
  getSourceInfo(index: number): string;
}

interface MangaDto {
  url: string;
  title: string;
  artist?: string;
  author?: string;
  description?: string;
  genre: string[];
  status: number;
  thumbnailUrl?: string;
  initialized: boolean;
}

interface ChapterDto {
  url: string;
  name: string;
  dateUpload: number;
  chapterNumber: number;
  scanlator?: string;
}

interface PageDto {
  index: number;
  url: string;
  imageUrl?: string;
}

interface MangasPageDto {
  mangas: MangaDto[];
  hasNextPage: boolean;
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
 * Parse result and throw with details if error
 */
function unwrapResult<T>(jsonStr: string): T {
  const result: JsResult<T> = JSON.parse(jsonStr);
  if (!result.ok) {
    const err = result.error!;
    console.error(`\n❌ Error: ${err.type}: ${err.message}`);
    if (err.logs.length > 0) {
      console.error("\n📋 Logs:");
      err.logs.forEach(log => console.error(`   ${log}`));
    }
    if (err.stack) {
      console.error("\n📚 Stack trace:");
      console.error(err.stack);
    }
    throw new Error(`${err.type}: ${err.message}`);
  }
  return result.data!;
}

// ============================================================================
// Extension Loader
// ============================================================================

interface LoadedExtension {
  manifest: ExtensionManifest;
  exports: JsExports;
  sources: SourceInfo[];
  selectedSource: SourceInfo;
}

async function loadExtension(extensionName: string): Promise<LoadedExtension> {
  const extDir = path.join(EXTENSIONS_BASE, extensionName);
  
  if (!existsSync(extDir)) {
    throw new Error(`Extension not found: ${extDir}\nRun: cd packages && ./gradlew :tachiyomi-compiler:devBuild -Pextension=${extensionName.replace("-", "/")}`);
  }
  
  // Read manifest
  const manifestPath = path.join(extDir, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`manifest.json not found in ${extDir}`);
  }
  const manifest: ExtensionManifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  
  // Find and load extension.js
  const jsPath = path.join(extDir, manifest.jsPath);
  if (!existsSync(jsPath)) {
    throw new Error(`${manifest.jsPath} not found in ${extDir}`);
  }
  
  console.log(`Loading ${manifest.name} from ${extDir}...`);
  
  // Dynamic import the ES module
  const module = await import(jsPath);
  
  // Kotlin/JS exports are directly on the module (tachiyomi.generated)
  const exports = (module.tachiyomi?.generated ?? module) as JsExports;
  
  // Get sources from getManifest()
  const sources = unwrapResult<SourceInfo[]>(exports.getManifest());
  console.log(`Loaded! ${sources.length} sources available`);
  
  // Select source by language
  let selectedSource = sources.find(s => s.lang === SOURCE_LANG);
  if (!selectedSource) {
    selectedSource = sources[0];
    if (SOURCE_LANG !== "en") {
      console.log(`Note: Language '${SOURCE_LANG}' not found, using '${selectedSource.lang}'`);
    }
  }
  
  console.log(`Selected source: ${selectedSource.name} (${selectedSource.lang}) - ID: ${selectedSource.id}`);
  
  return { manifest, exports, sources, selectedSource };
}

// ============================================================================
// Commands
// ============================================================================

async function runCommand(
  ext: LoadedExtension,
  command: string,
  args: string[]
): Promise<void> {
  const { exports, sources, selectedSource } = ext;
  const sourceId = selectedSource.id;
  
  switch (command) {
    case "info": {
      console.log(`\n=== Extension Info ===\n`);
      console.log(`Name: ${ext.manifest.name}`);
      console.log(`Package: ${ext.manifest.pkg}`);
      console.log(`Version: ${ext.manifest.version}`);
      console.log(`NSFW: ${ext.manifest.nsfw}`);
      console.log(`\n=== Sources (${sources.length}) ===\n`);
      
      for (const src of sources.slice(0, 20)) {
        const selected = src.id === sourceId ? " ← selected" : "";
        console.log(`[${src.lang}] ${src.name}${selected}`);
        console.log(`    ID: ${src.id}`);
        if (src.baseUrl) console.log(`    Base URL: ${src.baseUrl}`);
        if (src.supportsLatest !== undefined) console.log(`    Supports Latest: ${src.supportsLatest}`);
      }
      
      if (sources.length > 20) {
        console.log(`\n... and ${sources.length - 20} more sources`);
      }
      break;
    }
    
    case "popular": {
      const page = parseInt(args[0] || "1", 10);
      console.log(`\n=== Popular Manga (page ${page}) ===\n`);
      
      const result = unwrapResult<MangasPageDto>(exports.getPopularManga(sourceId, page));
      console.log(`Found ${result.mangas.length} manga, hasNextPage: ${result.hasNextPage}\n`);
      
      for (const manga of result.mangas.slice(0, 10)) {
        console.log(`- ${manga.title}`);
        console.log(`  url: ${manga.url}`);
        if (manga.author) console.log(`  author: ${manga.author}`);
        console.log();
      }
      
      if (result.mangas.length > 10) {
        console.log(`... and ${result.mangas.length - 10} more`);
      }
      break;
    }
    
    case "latest": {
      const page = parseInt(args[0] || "1", 10);
      console.log(`\n=== Latest Updates (page ${page}) ===\n`);
      
      const result = unwrapResult<MangasPageDto>(exports.getLatestUpdates(sourceId, page));
      console.log(`Found ${result.mangas.length} manga, hasNextPage: ${result.hasNextPage}\n`);
      
      for (const manga of result.mangas.slice(0, 10)) {
        console.log(`- ${manga.title}`);
        console.log(`  url: ${manga.url}`);
        console.log();
      }
      break;
    }
    
    case "search": {
      const query = args[0] || "";
      const page = parseInt(args[1] || "1", 10);
      console.log(`\n=== Search: "${query}" (page ${page}) ===\n`);
      
      const result = unwrapResult<MangasPageDto>(exports.searchManga(sourceId, page, query));
      console.log(`Found ${result.mangas.length} manga, hasNextPage: ${result.hasNextPage}\n`);
      
      for (const manga of result.mangas.slice(0, 10)) {
        console.log(`- ${manga.title}`);
        console.log(`  url: ${manga.url}`);
        if (manga.author) console.log(`  author: ${manga.author}`);
        console.log();
      }
      
      if (result.mangas.length > 10) {
        console.log(`... and ${result.mangas.length - 10} more`);
      }
      break;
    }
    
    case "details": {
      const mangaUrl = args[0];
      if (!mangaUrl) {
        console.error("Error: manga URL required");
        console.error("Tip: Use search command first to get a manga URL");
        return;
      }
      
      console.log(`\n=== Manga Details: ${mangaUrl} ===\n`);
      
      const manga = unwrapResult<MangaDto>(exports.getMangaDetails(sourceId, mangaUrl));
      console.log(`Title: ${manga.title}`);
      console.log(`URL: ${manga.url}`);
      if (manga.author) console.log(`Author: ${manga.author}`);
      if (manga.artist) console.log(`Artist: ${manga.artist}`);
      if (manga.description) console.log(`Description: ${manga.description.slice(0, 200)}...`);
      if (manga.genre.length) console.log(`Genres: ${manga.genre.join(", ")}`);
      console.log(`Status: ${manga.status}`);
      if (manga.thumbnailUrl) console.log(`Cover: ${manga.thumbnailUrl}`);
      break;
    }
    
    case "chapters": {
      const mangaUrl = args[0];
      if (!mangaUrl) {
        console.error("Error: manga URL required");
        return;
      }
      
      console.log(`\n=== Chapters: ${mangaUrl} ===\n`);
      
      const chapters = unwrapResult<ChapterDto[]>(exports.getChapterList(sourceId, mangaUrl));
      console.log(`Found ${chapters.length} chapters\n`);
      
      for (const ch of chapters.slice(0, 20)) {
        const date = new Date(ch.dateUpload).toISOString().split("T")[0];
        console.log(`- Ch.${ch.chapterNumber} ${ch.name}`);
        console.log(`  url: ${ch.url}`);
        console.log(`  date: ${date}`);
        if (ch.scanlator) console.log(`  scanlator: ${ch.scanlator}`);
        console.log();
      }
      
      if (chapters.length > 20) {
        console.log(`... and ${chapters.length - 20} more`);
      }
      break;
    }
    
    case "pages": {
      const chapterUrl = args[0];
      if (!chapterUrl) {
        console.error("Error: chapter URL required");
        return;
      }
      
      console.log(`\n=== Pages: ${chapterUrl} ===\n`);
      
      const pages = unwrapResult<PageDto[]>(exports.getPageList(sourceId, chapterUrl));
      console.log(`Found ${pages.length} pages\n`);
      
      for (const page of pages.slice(0, 10)) {
        console.log(`- Page ${page.index}: url=${page.url}, imageUrl=${page.imageUrl || "(none)"}`);
      }
      
      if (pages.length > 10) {
        console.log(`... and ${pages.length - 10} more`);
      }
      break;
    }
    
    case "filters": {
      console.log(`\n=== Filter Schema ===\n`);
      
      const filters = unwrapResult<unknown[]>(exports.getFilterList(sourceId));
      console.log(JSON.stringify(filters, null, 2));
      break;
    }
    
    case "read": {
      const mangaUrl = args[0];
      const chapterUrl = args[1];
      
      if (!mangaUrl || !chapterUrl) {
        console.error("Error: manga URL and chapter URL required");
        console.error("Usage: read <manga-url> <chapter-url>");
        return;
      }
      
      console.log(`\n=== End-to-end Read Test ===\n`);
      
      // Step 1: Get manga details
      console.log("1. Getting manga details...");
      const manga = unwrapResult<MangaDto>(exports.getMangaDetails(sourceId, mangaUrl));
      console.log(`   Title: ${manga.title}`);
      
      // Step 2: Get pages
      console.log("\n2. Getting page list...");
      const pages = unwrapResult<PageDto[]>(exports.getPageList(sourceId, chapterUrl));
      console.log(`   Found ${pages.length} pages`);
      
      if (pages.length === 0) {
        console.error("   No pages found!");
        return;
      }
      
      // Step 3: Fetch first page image through extension's client (with interceptors!)
      const firstPage = pages[0];
      console.log("\n3. Fetching image through extension client (with interceptors)...");
      console.log(`   Page URL: ${firstPage.url}`);
      console.log(`   Image URL: ${firstPage.imageUrl || "(resolved by extension)"}`);
      
      const base64Image = unwrapResult<string>(exports.fetchImage(sourceId, firstPage.url, firstPage.imageUrl || ""));
      const imageBytes = Buffer.from(base64Image, "base64");
      
      console.log(`   Received: ${imageBytes.length} bytes`);
      
      // Save the image
      const outputPath = "/tmp/test-tachiyomi-image.jpg";
      await Bun.write(outputPath, imageBytes);
        
        // Detect image format
      const isJpeg = imageBytes[0] === 0xFF && imageBytes[1] === 0xD8;
      const isPng = imageBytes[0] === 0x89 && imageBytes[1] === 0x50;
        
      const format = isJpeg ? "JPEG" : isPng ? "PNG" : "Unknown";
      console.log(`   Format: ${format}`);
      
      console.log(`\n✅ SUCCESS! Image saved to ${outputPath} (${imageBytes.length} bytes)`);
      break;
    }
    
    case "interactive": {
      console.log(`\n=== Interactive mode ===`);
      console.log(`Source: ${selectedSource.name} (${selectedSource.lang})`);
      console.log(`Commands: info, popular, latest, search, details, chapters, pages, read, filters, quit\n`);
      
      const readline = await import("readline");
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      
      const prompt = () => {
        rl.question(`[tachiyomi]> `, async (line) => {
          const parts = line.trim().split(/\s+/);
          const cmd = parts[0];
          
          if (!cmd || cmd === "quit" || cmd === "exit" || cmd === "q") {
            rl.close();
            return;
          }
          
          try {
            await runCommand(ext, cmd, parts.slice(1));
          } catch (e) {
            console.error("Error:", e);
          }
          
          console.log();
          prompt();
        });
      };
      
      prompt();
      return; // Don't exit
    }
    
    default:
      console.error(`Unknown command: ${command}`);
      console.log("Available: info, popular, latest, search, details, chapters, pages, read, filters, interactive");
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    // List available extensions
    console.log(`Usage: bun scripts/test-tachiyomi-source.ts <extension> [command] [args...]

Commands:
  info                      Show source info (manifest + sources)
  popular [page]            Get popular manga
  latest [page]             Get latest updates
  search [query] [page]     Search for manga
  details <manga-url>       Get manga details
  chapters <manga-url>      Get chapter list
  pages <chapter-url>       Get page list
  read <manga-url> <ch-url> Full end-to-end test
  filters                   Show filter schema
  interactive               Interactive REPL mode

Environment:
  PROXY_URL                 Proxy server URL (default: https://service.nemu.pm)
  SOURCE_LANG               Language to select (default: en)
  DEBUG=1                   Enable verbose logging

Available extensions:`);
    
    if (existsSync(EXTENSIONS_BASE)) {
      const extensions = readdirSync(EXTENSIONS_BASE);
      for (const ext of extensions) {
        const manifestPath = path.join(EXTENSIONS_BASE, ext, "manifest.json");
        if (existsSync(manifestPath)) {
          const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
          console.log(`  - ${ext} (${manifest.name})`);
        }
      }
    } else {
      console.log("  (none built yet - run gradlew devBuild first)");
    }
    
    process.exit(1);
  }
  
  const extensionName = args[0];
  const command = args[1] || "info";
  
  try {
    const ext = await loadExtension(extensionName);
    await runCommand(ext, command, args.slice(2));
  } catch (e) {
    console.error("\nFATAL ERROR:", e);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("\nFATAL ERROR:", e);
  process.exit(1);
});
