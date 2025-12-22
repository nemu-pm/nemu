#!/usr/bin/env bun
/**
 * Test script for Aidoku sources
 * 
 * ============================================================================
 * QUICK DEBUG COMMANDS
 * ============================================================================
 * 
 * # Registry JSON URLs (to find available sources):
 * #   aidoku-zh:    https://raw.githubusercontent.com/suiyuran/aidoku-zh-sources/main/public/index.min.json
 * #   aidoku-community: https://aidoku-community.github.io/sources/index.min.json
 * 
 * # Download a source (.aix file):
 * curl -sL "https://raw.githubusercontent.com/suiyuran/aidoku-zh-sources/main/public/sources/zh.manhuaren-v2.aix" -o /tmp/source.aix
 * 
 * # Quick search test:
 * bun scripts/test-aidoku-source.ts /tmp/source.aix search "test"
 * 
 * # Full end-to-end image fetch test:
 * bun scripts/test-aidoku-source.ts /tmp/source.aix read <manga-key> <chapter-key>
 * 
 * # Interactive mode for rapid debugging:
 * bun scripts/test-aidoku-source.ts /tmp/source.aix interactive
 * 
 * # Example full workflow:
 * curl -sL "https://raw.githubusercontent.com/suiyuran/aidoku-zh-sources/main/public/sources/zh.manhuaren-v2.aix" -o /tmp/manhuaren.aix
 * bun scripts/test-aidoku-source.ts /tmp/manhuaren.aix search "午夜"
 * bun scripts/test-aidoku-source.ts /tmp/manhuaren.aix chapters 84746
 * bun scripts/test-aidoku-source.ts /tmp/manhuaren.aix read 84746 1463938
 * 
 * ============================================================================
 * 
 * Usage: bun scripts/test-aidoku-source.ts <aix-url-or-path> [command]
 * 
 * Commands:
 *   search [query]      - Search for manga
 *   details <key>       - Get manga details
 *   chapters <key>      - Get chapter list
 *   pages <manga> <ch>  - Get page list
 *   read <manga> <ch>   - Full end-to-end test (fetch first image)
 *   image <url>         - Test modifyImageRequest headers
 *   filters             - List available filters
 *   home                - Get home layout
 *   settings            - Show source settings schema
 *   interactive         - Interactive REPL mode
 * 
 * Environment:
 *   PROXY_URL           - Override proxy server URL (default: https://service.nemu.pm)
 *   DEBUG=1             - Enable verbose logging
 */

import { unzipSync } from "fflate";
import { loadSource, type AidokuSource } from "../src/lib/sources/aidoku/runtime";
import type { SourceManifest, Manga, Chapter } from "../src/lib/sources/aidoku/types";
import { installXHRPolyfill, PROXY_URL } from "./lib/proxy-request";

const DEBUG = process.env.DEBUG === "1";

// Settings item types from settings.json
interface SettingsItem {
  type: string;
  key?: string;
  title?: string;
  default?: unknown;
  items?: SettingsItem[];
}

// Override proxyUrl to use local proxy
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input.toString();
  // Don't proxy the aix download
  if (url.includes(".aix") || url.includes("github")) {
    return originalFetch(input, init);
  }
  return originalFetch(input, init);
};

// Install XMLHttpRequest polyfill for WASM runtime
installXHRPolyfill();

/**
 * Extract default settings from settings.json
 */
function extractDefaultSettings(settingsJson: SettingsItem[]): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  
  function processItems(items: SettingsItem[]) {
    for (const item of items) {
      if (item.key && item.default !== undefined) {
        defaults[item.key] = item.default;
      }
      // Process nested items (groups)
      if (item.items) {
        processItems(item.items);
      }
    }
  }
  
  processItems(settingsJson);
  return defaults;
}

interface AixContents {
  wasmBytes: ArrayBuffer;
  manifest: SourceManifest;
  defaultSettings: Record<string, unknown>;
}

async function loadAix(urlOrPath: string): Promise<AixContents> {
  let data: ArrayBuffer;
  
  if (urlOrPath.startsWith("http")) {
    console.log(`Downloading ${urlOrPath}...`);
    const res = await originalFetch(urlOrPath);
    if (!res.ok) throw new Error(`Failed to download: ${res.status}`);
    data = await res.arrayBuffer();
  } else {
    console.log(`Reading ${urlOrPath}...`);
    const file = Bun.file(urlOrPath);
    data = await file.arrayBuffer();
  }
  
  console.log(`Extracting ${data.byteLength} bytes...`);
  const unzipped = unzipSync(new Uint8Array(data));
  
  const wasmData = unzipped["Payload/main.wasm"];
  const manifestData = unzipped["Payload/source.json"];
  
  if (!wasmData || !manifestData) {
    throw new Error("Invalid .aix: missing main.wasm or source.json");
  }
  
  const manifest: SourceManifest = JSON.parse(new TextDecoder().decode(manifestData));
  
  // Extract default settings from settings.json if present
  let defaultSettings: Record<string, unknown> = {};
  const settingsData = unzipped["Payload/settings.json"];
  if (settingsData) {
    try {
      const settingsJson: SettingsItem[] = JSON.parse(new TextDecoder().decode(settingsData));
      defaultSettings = extractDefaultSettings(settingsJson);
      console.log(`Found ${Object.keys(defaultSettings).length} default settings`);
    } catch (e) {
      console.warn("Failed to parse settings.json:", e);
    }
  }
  
  // Add languages from manifest if not in settings
  if (!defaultSettings.languages && manifest.info.languages?.length) {
    // Default to first language (usually 'en')
    defaultSettings.languages = [manifest.info.languages[0]];
  }
  
  // Add base URL from manifest if allowsBaseUrlSelect and urls provided
  if (!defaultSettings.url && manifest.info.urls?.length) {
    defaultSettings.url = manifest.info.urls[0];
    console.log(`Setting default URL: ${defaultSettings.url}`);
  }
  
  return { wasmBytes: wasmData.buffer.slice(0) as ArrayBuffer, manifest, defaultSettings };
}

/**
 * Run a command against a loaded source
 */
async function runCommand(
  source: AidokuSource,
  manifest: SourceManifest,
  command: string,
  cmdArgs: string[]
): Promise<void> {
  switch (command) {
    case "search": {
      const query = cmdArgs[0] || null;
      console.log(`=== Search: ${query || "(browse)"} ===\n`);
      
      const result = source.getSearchMangaList(query, 1, []);
      console.log(`Found ${result.entries.length} manga, hasNextPage: ${result.hasNextPage}\n`);
      
      for (const manga of result.entries.slice(0, 10)) {
        console.log(`- ${manga.title}`);
        console.log(`  key: ${manga.key}`);
        if (manga.cover) console.log(`  cover: ${manga.cover.slice(0, 60)}...`);
        console.log();
      }
      
      if (result.entries.length > 10) {
        console.log(`... and ${result.entries.length - 10} more`);
      }
      break;
    }
    
    case "details": {
      const key = cmdArgs[0];
      if (!key) {
        console.error("Error: manga key required");
        return;
      }
      
      console.log(`=== Details for: ${key} ===\n`);
      
      const manga: Manga = { sourceId: manifest.info.id, id: key, key };
      const details = source.getMangaDetails(manga);
      
      console.log(`Title: ${details.title}`);
      console.log(`Key: ${details.key}`);
      if (details.authors?.length) console.log(`Authors: ${details.authors.join(", ")}`);
      if (details.artists?.length) console.log(`Artists: ${details.artists.join(", ")}`);
      if (details.description) console.log(`Description: ${details.description.slice(0, 200)}...`);
      if (details.tags?.length) console.log(`Tags: ${details.tags.join(", ")}`);
      if (details.status !== undefined) console.log(`Status: ${details.status}`);
      break;
    }
    
    case "chapters": {
      const key = cmdArgs[0];
      if (!key) {
        console.error("Error: manga key required");
        return;
      }
      const highlightChapterKey = cmdArgs[1] || null;
      
      console.log(`=== Chapters for: ${key} ===\n`);
      
      const manga: Manga = { sourceId: manifest.info.id, id: key, key };
      const chapters = source.getChapterList(manga);
      
      console.log(`Found ${chapters.length} chapters\n`);

      if (highlightChapterKey) {
        const hit = chapters.find((c) => c.key === highlightChapterKey);
        if (!hit) {
          console.log(`Highlight chapter not found: ${highlightChapterKey}`);
        } else {
          console.log(`=== Highlight chapter ===`);
          console.log(`key: ${hit.key}`);
          console.log(`title: ${hit.title ?? "(none)"}`);
          console.log(`lang: ${(hit as any).lang ?? "(none)"}`);
          console.log(`url: ${hit.url ?? "(none)"}`);
          if (hit.dateUploaded) console.log(`date: ${new Date(hit.dateUploaded).toISOString()}`);
          console.log();
        }
      }
      
      for (const ch of chapters.slice(0, 20)) {
        const parts = [];
        if (ch.volumeNumber !== undefined) parts.push(`Vol.${ch.volumeNumber}`);
        if (ch.chapterNumber !== undefined) parts.push(`Ch.${ch.chapterNumber}`);
        if (ch.title) parts.push(ch.title);
        
        console.log(`- ${parts.join(" ") || ch.key}`);
        console.log(`  key: ${ch.key}`);
        console.log(`  lang: ${(ch as any).lang ?? "(none)"}`);
        if (ch.url) console.log(`  url: ${ch.url}`);
        if (ch.dateUploaded) {
          console.log(`  date: ${new Date(ch.dateUploaded).toISOString()}`);
        }
        console.log();
      }
      
      if (chapters.length > 20) {
        console.log(`... and ${chapters.length - 20} more`);
      }
      break;
    }
    
    case "pages": {
      const mangaKey = cmdArgs[0];
      const chapterKey = cmdArgs[1];
      if (!mangaKey || !chapterKey) {
        console.error("Error: manga key and chapter key required");
        return;
      }
      
      console.log(`=== Pages for: ${mangaKey} / ${chapterKey} ===\n`);
      
      const manga: Manga = { sourceId: manifest.info.id, id: mangaKey, key: mangaKey };
      
      console.log("Fetching chapter list to get full chapter data...");
      const chapters = source.getChapterList(manga);
      const chapter = chapters.find(c => c.key === chapterKey);
      
      if (!chapter) {
        console.error(`Chapter not found: ${chapterKey}`);
        console.log("Available chapters:", chapters.slice(0, 5).map(c => c.key).join(", "));
        return;
      }
      
      console.log(`Found chapter: ${chapter.title || chapter.key}`);
      console.log(`Lang: ${(chapter as any).lang ?? "(none)"}`);
      console.log(`URL: ${chapter.url}\n`);
      
      const pages = source.getPageList(manga, chapter);
      
      console.log(`Found ${pages.length} pages\n`);
      
      for (const page of pages.slice(0, 10)) {
        console.log(`- Page ${page.index}: ${page.url}`);
      }
      
      if (pages.length > 10) {
        console.log(`... and ${pages.length - 10} more`);
      }
      break;
    }
    
    case "image": {
      const imageUrl = cmdArgs[0];
      if (!imageUrl) {
        console.error("Error: image URL required");
        console.error("Tip: Use 'read' command for end-to-end test");
        return;
      }
      
      console.log(`=== Testing image request: ${imageUrl.slice(0, 60)}... ===\n`);
      
      const modified = source.modifyImageRequest(imageUrl);
      console.log("Modified URL:", modified.url);
      console.log("Headers:", JSON.stringify(modified.headers, null, 2));
      
      console.log("\n--- Testing fetch through proxy ---");
      const proxyTarget = `${PROXY_URL}/proxy?url=${encodeURIComponent(modified.url)}`;
      const headers = Object.entries(modified.headers)
        .flatMap(([k, v]) => ["-H", `x-proxy-${k}: ${v}`]);
      
      const result = Bun.spawnSync([
        "curl", "-s", "-o", "/dev/null", "-w", 
        "HTTP %{http_code} | Size: %{size_download} bytes | Time: %{time_total}s",
        ...headers,
        proxyTarget,
      ]);
      
      console.log(result.stdout.toString());
      break;
    }
    
    case "read": {
      // End-to-end test: manga key, chapter key -> fetch first image
      const mangaKey = cmdArgs[0];
      const chapterKey = cmdArgs[1];
      if (!mangaKey || !chapterKey) {
        console.error("Error: manga key and chapter key required");
        console.error("Usage: read <manga-key> <chapter-key>");
        return;
      }
      
      console.log(`=== End-to-end read test: ${mangaKey} / ${chapterKey} ===\n`);
      
      const manga: Manga = { sourceId: manifest.info.id, id: mangaKey, key: mangaKey };
      
      // Step 1: Get chapters
      console.log("1. Fetching chapter list...");
      const chapters = source.getChapterList(manga);
      const chapter = chapters.find(c => c.key === chapterKey);
      
      if (!chapter) {
        console.error(`   Chapter not found: ${chapterKey}`);
        console.log("   Available:", chapters.slice(0, 5).map(c => c.key).join(", "));
        return;
      }
      console.log(`   Found: ${chapter.title || chapter.key}`);
      console.log(`   Lang: ${(chapter as any).lang ?? "(none)"}`);
      
      // Step 2: Get pages
      console.log("\n2. Fetching page list...");
      const pages = source.getPageList(manga, chapter);
      console.log(`   Found ${pages.length} pages`);
      
      if (pages.length === 0) {
        console.error("   No pages found!");
        return;
      }
      
      // Step 3: Get image headers for first page
      const firstPage = pages[0];
      const imageUrl = firstPage.url || firstPage.imageUrl || "";
      console.log(`\n3. First page URL: ${imageUrl.slice(0, 80)}...`);
      
      const modified = source.modifyImageRequest(imageUrl);
      console.log("   Headers:", Object.keys(modified.headers).join(", "));
      
      // Step 4: Fetch the image
      console.log("\n4. Fetching image through proxy...");
      const proxyTarget = `${PROXY_URL}/proxy?url=${encodeURIComponent(modified.url)}`;
      const curlHeaders = Object.entries(modified.headers)
        .flatMap(([k, v]) => ["-H", `x-proxy-${k}: ${v}`]);
      
      const result = Bun.spawnSync([
        "curl", "-s", "-w", "\nHTTP %{http_code} | %{size_download} bytes | %{time_total}s",
        "-o", "/tmp/test-image.jpg",
        ...curlHeaders,
        proxyTarget,
      ]);
      
      const output = result.stdout.toString().trim();
      const statusMatch = output.match(/HTTP (\d+)/);
      const status = statusMatch ? parseInt(statusMatch[1]) : 0;
      
      console.log(`   ${output}`);
      
      if (status === 200) {
        // Check file size
        const file = Bun.file("/tmp/test-image.jpg");
        const size = file.size;
        console.log(`\n✅ SUCCESS! Image saved to /tmp/test-image.jpg (${size} bytes)`);
        
        // Try to detect if it's a valid image
        const header = await file.slice(0, 3).arrayBuffer();
        const headerBytes = new Uint8Array(header);
        const isJpeg = headerBytes[0] === 0xFF && headerBytes[1] === 0xD8;
        const isPng = headerBytes[0] === 0x89 && headerBytes[1] === 0x50;
        
        if (isJpeg) console.log("   Format: JPEG");
        else if (isPng) console.log("   Format: PNG");
        else console.log("   Format: Unknown (might be error page)");
      } else {
        console.log(`\n❌ FAILED with status ${status}`);
      }
      break;
    }
    
    case "filters": {
      console.log(`=== Available filters ===\n`);
      
      const filters = source.getFilters();
      console.log(`Found ${filters.length} filters\n`);
      
      for (const filter of filters) {
        console.log(`- ${filter.name} (type: ${filter.type})`);
        if ("options" in filter && Array.isArray(filter.options)) {
          console.log(`  Options: ${filter.options.slice(0, 5).join(", ")}${filter.options.length > 5 ? "..." : ""}`);
        }
        if ("filters" in filter && Array.isArray(filter.filters)) {
          console.log(`  Sub-filters: ${filter.filters.length}`);
        }
      }
      break;
    }

    case "home": {
      console.log(`=== Home Layout ===\n`);
      console.log(`hasHome: ${source.hasHome}`);
      
      if (!source.hasHome) {
        console.log("Source does not provide home layout");
        break;
      }
      
      const home = source.getHome();
      if (!home) {
        console.log("getHome returned null");
        break;
      }
      
      console.log(`Found ${home.components.length} components\n`);
      
      for (const component of home.components) {
        console.log(`- ${component.title ?? "(untitled)"}`);
        console.log(`  Type: ${component.value.type}`);
        
        // Show entry counts for different types
        if ("entries" in component.value && Array.isArray(component.value.entries)) {
          console.log(`  Entries: ${component.value.entries.length}`);
          // Show first entry title if available
          const firstEntry = component.value.entries[0];
          if (firstEntry) {
            const title = "title" in firstEntry ? firstEntry.title : 
                          "manga" in firstEntry && firstEntry.manga ? firstEntry.manga.title : null;
            if (title) {
              console.log(`  First: "${title}"`);
            }
          }
        }
        if ("links" in component.value && Array.isArray(component.value.links)) {
          console.log(`  Links: ${component.value.links.length}`);
          const firstLink = component.value.links[0];
          if (firstLink?.title) {
            console.log(`  First: "${firstLink.title}"`);
          }
        }
        // Show listing info if present
        if ("listing" in component.value && component.value.listing) {
          const listing = component.value.listing;
          console.log(`  Listing: id="${listing.id}" name="${listing.name}"`);
        }
        console.log();
      }
      break;
    }

    case "settings": {
      console.log(`=== Source Settings ===\n`);

      console.log("This command is not supported in Bun/Node (requires IndexedDB-backed app store).");
      console.log("Tip: inspect defaults extracted from AIX via DEBUG=1 output.");
      break;
    }

    case "listings": {
      console.log(`=== Dynamic Listings ===\n`);
      console.log(`hasDynamicListings: ${source.hasDynamicListings}`);
      
      if (!source.hasDynamicListings) {
        console.log("Source does not provide dynamic listings");
        break;
      }
      
      const listings = source.getListings();
      console.log(`Found ${listings.length} listings\n`);
      
      for (const listing of listings) {
        console.log(`- id="${listing.id}" name="${listing.name}" kind=${listing.kind ?? 0}`);
      }
      break;
    }
    
    default:
      console.error(`Unknown command: ${command}`);
      console.log("Available: search, details, chapters, pages, read, image, filters, home, settings, listings");
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`Usage: bun scripts/test-aidoku-source.ts <aix-url-or-path> [command] [args...]

Commands:
  search [query]           Search for manga (empty = browse)
  details <key>            Get manga details
  chapters <key>           Get chapter list for manga
  pages <manga-key> <ch>   Get page list
  read <manga-key> <ch>    Full end-to-end test (fetch first image)
  image <url>              Test modifyImageRequest headers
  filters                  List available filters
  interactive              Interactive REPL mode

Environment:
  PROXY_URL                Proxy server URL (default: https://service.nemu.pm)
  DEBUG=1                  Enable verbose logging

Examples:
  bun scripts/test-aidoku-source.ts https://example.com/source.aix search "one piece"
  bun scripts/test-aidoku-source.ts ./local.aix chapters some-manga-key
  bun scripts/test-aidoku-source.ts ./local.aix image "https://cdn.example.com/image.jpg"
`);
    process.exit(1);
  }
  
  const aixPath = args[0];
  const command = args[1] || "search";
  
  // Load source
  const { wasmBytes, manifest, defaultSettings } = await loadAix(aixPath);
  console.log(`\nSource: ${manifest.info.id} - ${manifest.info.name}`);
  if (DEBUG) console.log(`Default settings:`, defaultSettings);
  
  // Use a test sourceKey for the script
  const sourceKey = `test:${manifest.info.id}`;
  
  // In-memory settings store (Bun/Node doesn't have IndexedDB).
  const settingsMap = new Map<string, unknown>();
  for (const [k, v] of Object.entries(defaultSettings)) settingsMap.set(k, v);
  console.log(`Set ${Object.keys(defaultSettings).length} default settings`);
  
  // Create settings getter that reads from our local store
  const settingsGetter = (key: string) => {
    return settingsMap.get(key);
  };
  
  const source = await loadSource(wasmBytes, manifest, sourceKey, settingsGetter);
  source.initialize();
  console.log("Source initialized\n");
  
  // Handle interactive mode separately
  if (command === "interactive") {
    console.log(`=== Interactive mode ===`);
    console.log(`Commands: search, details, chapters, pages, read, image, filters, quit\n`);
    
    const readline = await import("readline");
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    
    const prompt = () => {
      rl.question(`[${manifest.info.id}]> `, async (line) => {
        const parts = line.trim().split(/\s+/);
        const cmd = parts[0];
        
        if (!cmd || cmd === "quit" || cmd === "exit" || cmd === "q") {
          rl.close();
          if (typeof source.dispose === "function") source.dispose();
          return;
        }
        
        try {
          await runCommand(source, manifest, cmd, parts.slice(1));
        } catch (e) {
          console.error("Error:", e);
        }
        
        console.log();
        prompt();
      });
    };
    
    prompt();
    return;
  }
  
  // Run single command
  await runCommand(source, manifest, command, args.slice(2));

  if (typeof source.dispose === "function") {
    source.dispose();
  }
}

main().catch((e) => {
  console.error("\nFATAL ERROR:", e);
  process.exit(1);
});

