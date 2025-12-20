#!/usr/bin/env bun
/**
 * Test script for Aidoku sources
 * Usage: bun scripts/test-aidoku-source.ts <aix-url-or-path> [command]
 * 
 * Commands:
 *   search [query]      - Search for manga
 *   details <key>       - Get manga details
 *   chapters <key>      - Get chapter list
 *   pages <manga> <ch>  - Get page list
 */

import { unzipSync } from "fflate";
import { loadSource, type AidokuSource } from "../src/lib/sources/aidoku/runtime";
import type { SourceManifest, Manga, Chapter } from "../src/lib/sources/aidoku/types";

// Settings item types from settings.json
interface SettingsItem {
  type: string;
  key?: string;
  title?: string;
  default?: unknown;
  items?: SettingsItem[];
}

// Configuration
const PROXY_URL = process.env.PROXY_URL || "http://localhost:3001";

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

// Sync XMLHttpRequest using local proxy
class ProxiedXMLHttpRequest {
  private _method = "GET";
  private _url = "";
  private _headers: Record<string, string> = {};
  private _responseText = "";
  private _response: ArrayBuffer | null = null;
  private _status = 0;
  private _responseHeaders: Record<string, string> = {};

  readyState = 0;
  get status() { return this._status; }
  get statusText() { return this._status === 200 ? "OK" : "Error"; }
  get responseText() { return this._responseText; }
  responseType: XMLHttpRequestResponseType = "";
  get response() { return this._response; }

  onload: (() => void) | null = null;
  onerror: ((e: Error) => void) | null = null;
  onreadystatechange: (() => void) | null = null;

  open(method: string, url: string, _async = true) {
    this._method = method;
    this._url = url;
    this.readyState = 1;
  }

  setRequestHeader(name: string, value: string) {
    this._headers[name] = value;
  }

  overrideMimeType(_mimeType: string) {}

  getAllResponseHeaders(): string {
    return Object.entries(this._responseHeaders)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\r\n");
  }

  send(body?: Document | XMLHttpRequestBodyInit | null) {
    // Build proxy URL
    const proxyTarget = `${PROXY_URL}/proxy?url=${encodeURIComponent(this._url)}`;
    
    // Build headers - convert x-proxy-* to actual headers for the proxy
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(this._headers)) {
      if (k.toLowerCase().startsWith("x-proxy-")) {
        headers[`x-proxy-${k.slice(8)}`] = v;
      } else {
        headers[`x-proxy-${k}`] = v;
      }
    }

    console.log(`[HTTP] ${this._method} ${this._url}`);

    try {
      // Use Bun's synchronous fetch equivalent
      const result = Bun.spawnSync([
        "curl", "-s", "-i",
        "-X", this._method,
        "-L",
        "--max-time", "30",
        ...Object.entries(headers).flatMap(([k, v]) => ["-H", `${k}: ${v}`]),
        ...(body ? ["-d", body.toString()] : []),
        proxyTarget,
      ]);

      const rawBuffer: Buffer = result.stdout as Buffer;
      
      // Find header/body separator
      let headerEnd = -1;
      let separatorLen = 4;
      for (let i = 0; i < rawBuffer.length - 3; i++) {
        if (rawBuffer[i] === 0x0d && rawBuffer[i+1] === 0x0a && 
            rawBuffer[i+2] === 0x0d && rawBuffer[i+3] === 0x0a) {
          headerEnd = i;
          break;
        }
      }
      if (headerEnd === -1) {
        for (let i = 0; i < rawBuffer.length - 1; i++) {
          if (rawBuffer[i] === 0x0a && rawBuffer[i+1] === 0x0a) {
            headerEnd = i;
            separatorLen = 2;
            break;
          }
        }
      }
      
      if (headerEnd !== -1) {
        const headerPart = rawBuffer.slice(0, headerEnd).toString("utf-8");
        const bodyBuffer = rawBuffer.slice(headerEnd + separatorLen);
        
        // Parse status from last HTTP line (in case of redirects)
        const lastHttpIndex = headerPart.lastIndexOf("HTTP/");
        if (lastHttpIndex !== -1) {
          const statusLine = headerPart.slice(lastHttpIndex).split(/\r?\n/)[0];
          const statusMatch = statusLine.match(/HTTP\/[\d.]+ (\d+)/);
          if (statusMatch) {
            this._status = parseInt(statusMatch[1], 10);
          }
        }
        
        // Parse headers
        const headerLines = headerPart.slice(lastHttpIndex).split(/\r?\n/).slice(1);
        for (const line of headerLines) {
          const idx = line.indexOf(": ");
          if (idx > 0) {
            this._responseHeaders[line.slice(0, idx).toLowerCase()] = line.slice(idx + 2);
          }
        }
        
        // Store response as ArrayBuffer
        this._response = bodyBuffer.buffer.slice(
          bodyBuffer.byteOffset,
          bodyBuffer.byteOffset + bodyBuffer.byteLength
        );
        
        // Also create responseText for compatibility (Latin-1 style)
        this._responseText = "";
        for (let i = 0; i < bodyBuffer.length; i++) {
          this._responseText += String.fromCharCode(bodyBuffer[i]);
        }
      } else {
        this._response = rawBuffer.buffer.slice(0);
        this._responseText = "";
        for (let i = 0; i < rawBuffer.length; i++) {
          this._responseText += String.fromCharCode(rawBuffer[i]);
        }
        this._status = 200;
      }

      this.readyState = 4;
      this.onreadystatechange?.();
      this.onload?.();
    } catch (e) {
      console.error("[HTTP] Error:", e);
      this._status = 0;
      this.readyState = 4;
      this.onerror?.(e as Error);
    }
  }

  abort() {}
}

// @ts-expect-error - polyfill
globalThis.XMLHttpRequest = ProxiedXMLHttpRequest;

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
  
  return { wasmBytes: wasmData.buffer.slice(0) as ArrayBuffer, manifest, defaultSettings };
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

Environment:
  PROXY_URL                Proxy server URL (default: http://localhost:3001)

Examples:
  bun scripts/test-aidoku-source.ts https://example.com/source.aix search "one piece"
  bun scripts/test-aidoku-source.ts ./local.aix chapters some-manga-key
`);
    process.exit(1);
  }
  
  const aixPath = args[0];
  const command = args[1] || "search";
  
  // Load source
  const { wasmBytes, manifest, defaultSettings } = await loadAix(aixPath);
  console.log(`\nSource: ${manifest.info.id} - ${manifest.info.name}`);
  console.log(`Default settings:`, defaultSettings);
  
  const source = await loadSource(wasmBytes, manifest, { initialSettings: defaultSettings });
  source.initialize();
  console.log("Source initialized\n");
  
  switch (command) {
    case "search": {
      const query = args[2] || null;
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
      const key = args[2];
      if (!key) {
        console.error("Error: manga key required");
        process.exit(1);
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
      const key = args[2];
      if (!key) {
        console.error("Error: manga key required");
        process.exit(1);
      }
      
      console.log(`=== Chapters for: ${key} ===\n`);
      
      const manga: Manga = { sourceId: manifest.info.id, id: key, key };
      const chapters = source.getChapterList(manga);
      
      console.log(`Found ${chapters.length} chapters\n`);
      
      for (const ch of chapters.slice(0, 20)) {
        const parts = [];
        if (ch.volumeNumber !== undefined) parts.push(`Vol.${ch.volumeNumber}`);
        if (ch.chapterNumber !== undefined) parts.push(`Ch.${ch.chapterNumber}`);
        if (ch.title) parts.push(ch.title);
        
        console.log(`- ${parts.join(" ") || ch.key}`);
        console.log(`  key: ${ch.key}`);
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
      const mangaKey = args[2];
      const chapterKey = args[3];
      if (!mangaKey || !chapterKey) {
        console.error("Error: manga key and chapter key required");
        process.exit(1);
      }
      
      console.log(`=== Pages for: ${mangaKey} / ${chapterKey} ===\n`);
      
      const manga: Manga = { sourceId: manifest.info.id, id: mangaKey, key: mangaKey };
      
      // First get chapters to find the full chapter data with URL
      console.log("Fetching chapter list to get full chapter data...");
      const chapters = source.getChapterList(manga);
      const chapter = chapters.find(c => c.key === chapterKey);
      
      if (!chapter) {
        console.error(`Chapter not found: ${chapterKey}`);
        console.log("Available chapters:", chapters.slice(0, 5).map(c => c.key).join(", "));
        process.exit(1);
      }
      
      console.log(`Found chapter: ${chapter.title || chapter.key}`);
      console.log(`URL: ${chapter.url}\n`);
      
      const pages = source.getPageList(manga, chapter);
      
      console.log(`Found ${pages.length} pages\n`);
      
      for (const page of pages.slice(0, 10)) {
        console.log(`- Page ${page.index}: ${page.url?.slice(0, 80)}...`);
      }
      
      if (pages.length > 10) {
        console.log(`... and ${pages.length - 10} more`);
      }
      break;
    }
    
    default:
      console.error(`Unknown command: ${command}`);
      process.exit(1);
  }
  
  if (typeof source.dispose === "function") {
    source.dispose();
  }
}

main().catch((e) => {
  console.error("\nFATAL ERROR:", e);
  process.exit(1);
});

