#!/usr/bin/env bun
/**
 * Test script for Aidoku source settings
 * 
 * Usage: bun scripts/test-source-settings.ts [aix-path]
 * 
 * Tests:
 * 1. Extracting settings.json from AIX (or local vendor folder)
 * 2. Parsing settings schema
 * 3. Rendering settings items (simulates the component)
 */

import { unzipSync } from "fflate";
import type { Setting } from "../src/lib/sources/aidoku/settings-types";
import { extractDefaults, isSettingVisible } from "../src/lib/sources/aidoku/settings-types";

// Local MangaDex source in vendor
const MANGADEX_SETTINGS_PATH = "vendor/Aidoku-Community/sources/sources/multi.mangadex/res/settings.json";

interface AixContents {
  wasmBytes: ArrayBuffer;
  manifest: Record<string, unknown>;
  settingsSchema: Setting[] | null;
  settingsRaw: string | null;
}

async function loadAix(urlOrPath: string): Promise<AixContents> {
  let data: ArrayBuffer;
  
  if (urlOrPath.startsWith("http")) {
    console.log(`Downloading ${urlOrPath}...`);
    const res = await fetch(urlOrPath);
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
  const settingsData = unzipped["Payload/settings.json"];
  
  if (!wasmData || !manifestData) {
    throw new Error("Invalid .aix: missing main.wasm or source.json");
  }
  
  const manifest = JSON.parse(new TextDecoder().decode(manifestData));
  
  let settingsSchema: Setting[] | null = null;
  let settingsRaw: string | null = null;
  
  if (settingsData) {
    settingsRaw = new TextDecoder().decode(settingsData);
    try {
      settingsSchema = JSON.parse(settingsRaw) as Setting[];
    } catch (e) {
      console.error("Failed to parse settings.json:", e);
    }
  }
  
  return { 
    wasmBytes: wasmData.buffer.slice(0) as ArrayBuffer, 
    manifest, 
    settingsSchema,
    settingsRaw,
  };
}

/**
 * Simulates the SettingsList component rendering logic
 */
function simulateRender(items: Setting[], values: Record<string, unknown>, depth = 0): void {
  const indent = "  ".repeat(depth);
  
  for (const item of items) {
    if (!isSettingVisible(item, values)) {
      console.log(`${indent}[HIDDEN] ${item.type}: ${item.title || item.key}`);
      continue;
    }
    
    switch (item.type) {
      case "group":
        console.log(`${indent}[GROUP] ${item.title}`);
        if ("items" in item && item.items) {
          simulateRender(item.items, values, depth + 1);
        }
        break;
        
      case "page":
        console.log(`${indent}[PAGE] ${item.title} (${("items" in item ? item.items?.length : 0)} items)`);
        break;
        
      case "select":
        const selectVal = values[item.key] ?? item.default ?? item.values?.[0];
        console.log(`${indent}[SELECT] ${item.title}: ${selectVal} (options: ${item.values?.join(", ")})`);
        break;
        
      case "multi-select":
        const msVal = (values[item.key] ?? item.default ?? []) as string[];
        console.log(`${indent}[MULTI-SELECT] ${item.title}: [${msVal.join(", ")}] (options: ${item.values?.join(", ")})`);
        break;
        
      case "switch":
        const switchVal = values[item.key] ?? item.default ?? false;
        console.log(`${indent}[SWITCH] ${item.title}: ${switchVal ? "ON" : "OFF"}`);
        break;
        
      case "stepper":
        const stepVal = values[item.key] ?? item.default ?? item.minimumValue;
        console.log(`${indent}[STEPPER] ${item.title}: ${stepVal} (range: ${item.minimumValue}-${item.maximumValue})`);
        break;
        
      case "segment":
        const segVal = values[item.key] ?? item.default ?? 0;
        const segOptions = item.values ?? item.options ?? [];
        console.log(`${indent}[SEGMENT] ${item.title}: ${segVal} (options: ${segOptions.join(", ")})`);
        break;
        
      case "text":
        const textVal = values[item.key] ?? item.default ?? "";
        console.log(`${indent}[TEXT] ${item.title}: "${textVal}" (placeholder: ${item.placeholder || "none"})`);
        break;
        
      case "editable-list":
        const listVal = (values[item.key] ?? item.default ?? []) as string[];
        console.log(`${indent}[EDITABLE-LIST] ${item.title}: [${listVal.slice(0, 3).join(", ")}${listVal.length > 3 ? "..." : ""}]`);
        break;
        
      case "button":
        console.log(`${indent}[BUTTON] ${item.title}`);
        break;
        
      case "link":
        console.log(`${indent}[LINK] ${item.title}`);
        break;
        
      case "login":
        console.log(`${indent}[LOGIN] ${item.title}`);
        break;
        
      default:
        console.log(`${indent}[UNKNOWN:${(item as Setting).type}] ${item.title || item.key}`);
    }
  }
}

async function loadLocalSettings(settingsPath: string): Promise<{ settingsSchema: Setting[] | null; settingsRaw: string | null }> {
  const file = Bun.file(settingsPath);
  if (!(await file.exists())) {
    return { settingsSchema: null, settingsRaw: null };
  }
  
  const settingsRaw = await file.text();
  try {
    const settingsSchema = JSON.parse(settingsRaw) as Setting[];
    return { settingsSchema, settingsRaw };
  } catch (e) {
    console.error("Failed to parse settings.json:", e);
    return { settingsSchema: null, settingsRaw };
  }
}

/**
 * Simulates the SourceSettings component's loadSchema behavior
 * to identify where the loading might fail
 */
async function testLoadSchemaFlow(sourceKey: string, settingsSchema: Setting[]): Promise<void> {
  console.log("\n=== Testing loadSchema flow ===");
  console.log(`sourceKey: ${sourceKey}`);
  
  // Parse sourceKey like the store does
  const [registryId, sourceId] = sourceKey.split(":", 2);
  console.log(`Parsed: registryId=${registryId}, sourceId=${sourceId}`);
  
  if (!registryId || !sourceId) {
    console.log("❌ FAIL: Could not parse sourceKey");
    return;
  }
  
  // Generate the cache key
  const settingsCacheKey = `settings:${registryId}:${sourceId}`;
  console.log(`Cache key would be: ${settingsCacheKey}`);
  
  // Simulate what the component does
  console.log("\n=== Simulating component render flow ===");
  console.log("1. Component mounts, schemaLoadState = 'idle'");
  console.log("2. useEffect triggers: open=true, schema=null, state='idle'");
  console.log("3. Sets state to 'loading', calls loadSchema()");
  console.log("4. loadSchema checks if cached in memory (schemas Map)");
  console.log("5. Not cached -> fetches from cacheStore using key:", settingsCacheKey);
  console.log("6. If found: parses JSON, updates store, returns schema");
  console.log("7. finally() sets state to 'done'");
  console.log("8. Component re-renders with schema from store");
  
  console.log("\n✅ Schema structure is valid with", settingsSchema.length, "items");
}

/**
 * Counts how many items would render in SettingsList
 */
function countRenderedItems(items: Setting[], values: Record<string, unknown>): { rendered: number; skipped: string[] } {
  const skipped: string[] = [];
  let rendered = 0;
  
  for (const item of items) {
    if (!isSettingVisible(item, values)) {
      skipped.push(`${item.type}:${item.key || item.title} (hidden by requires)`);
      continue;
    }
    
    // Check which types are handled
    const handledTypes = ["group", "page", "select", "multi-select", "switch", "stepper", "text", "editable-list", "segment"];
    const skippedTypes = ["button", "link", "login"];
    
    if (handledTypes.includes(item.type)) {
      rendered++;
      // Recurse into groups and pages
      if ((item.type === "group" || item.type === "page") && "items" in item && item.items) {
        const nested = countRenderedItems(item.items, values);
        rendered += nested.rendered;
        skipped.push(...nested.skipped);
      }
    } else if (skippedTypes.includes(item.type)) {
      skipped.push(`${item.type}:${item.key || item.title} (intentionally skipped)`);
    } else {
      skipped.push(`${item.type}:${item.key || item.title} (unknown type)`);
    }
  }
  
  return { rendered, skipped };
}

/**
 * Test the actual rendering logic with a schema
 */
function testRendering(schema: Setting[]): void {
  console.log("\n=== Testing render logic ===");
  
  // Check empty/null schema handling
  if (!schema || schema.length === 0) {
    console.log("❌ Schema is empty/null - would show 'No settings available'");
    return;
  }
  
  console.log(`✅ Schema has ${schema.length} top-level items`);
  
  // Get defaults
  const defaults = extractDefaults(schema);
  console.log(`Extracted ${Object.keys(defaults).length} default values`);
  
  // Count what would render
  const { rendered, skipped } = countRenderedItems(schema, defaults);
  
  console.log(`\n✅ Would render ${rendered} setting controls`);
  
  if (skipped.length > 0) {
    console.log(`Skipped ${skipped.length} items:`);
    for (const s of skipped) {
      console.log(`  - ${s}`);
    }
  }
  
  if (rendered === 0) {
    console.log("\n❌ WARNING: Nothing would render! All items are skipped.");
  }
}

async function main() {
  const args = process.argv.slice(2);
  const aixPath = args[0];
  
  console.log("=== Source Settings Test ===\n");
  
  let settingsSchema: Setting[] | null = null;
  let settingsRaw: string | null = null;
  let manifest: Record<string, unknown> = {};
  
  if (aixPath) {
    // Load from AIX file
    const result = await loadAix(aixPath);
    settingsSchema = result.settingsSchema;
    settingsRaw = result.settingsRaw;
    manifest = result.manifest;
  } else {
    // Load from local vendor MangaDex
    console.log(`Loading from local: ${MANGADEX_SETTINGS_PATH}`);
    const result = await loadLocalSettings(MANGADEX_SETTINGS_PATH);
    settingsSchema = result.settingsSchema;
    settingsRaw = result.settingsRaw;
    manifest = { info: { id: "multi.mangadex", name: "MangaDex (local)" } };
  }
  
  const info = manifest.info as { id?: string; name?: string; version?: number } | undefined;
  console.log(`\nSource: ${info?.id} - ${info?.name}`);
  if (info?.version) console.log(`Version: ${info.version}`);
  
  if (!settingsSchema) {
    console.log("\n❌ No settings.json found in AIX");
    return;
  }
  
  console.log(`\n✅ Found settings.json with ${settingsSchema.length} top-level items`);
  console.log("\n=== Raw settings.json ===");
  console.log(settingsRaw);
  
  console.log("\n=== Parsed schema types ===");
  function countTypes(items: Setting[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const item of items) {
      counts.set(item.type, (counts.get(item.type) ?? 0) + 1);
      if ("items" in item && item.items) {
        const subCounts = countTypes(item.items);
        for (const [type, count] of subCounts) {
          counts.set(type, (counts.get(type) ?? 0) + count);
        }
      }
    }
    return counts;
  }
  
  const typeCounts = countTypes(settingsSchema);
  for (const [type, count] of typeCounts.entries()) {
    console.log(`  ${type}: ${count}`);
  }
  
  console.log("\n=== Default values ===");
  const defaults = extractDefaults(settingsSchema);
  for (const [key, value] of Object.entries(defaults)) {
    console.log(`  ${key}: ${JSON.stringify(value)}`);
  }
  
  console.log("\n=== Simulated render (with defaults) ===");
  simulateRender(settingsSchema, defaults);
  
  // Check for potential rendering issues
  console.log("\n=== Validation checks ===");
  
  function validateItems(items: Setting[], path: string = ""): string[] {
    const issues: string[] = [];
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const itemPath = `${path}[${i}]`;
      
      // Check for missing keys on items that need them
      if (["select", "multi-select", "switch", "stepper", "segment", "text", "editable-list"].includes(item.type)) {
        if (!item.key) {
          issues.push(`${itemPath} (${item.type}): Missing 'key' property`);
        }
      }
      
      // Check for empty values arrays
      if (item.type === "select" && (!item.values || item.values.length === 0)) {
        issues.push(`${itemPath} (${item.key}): Empty 'values' array - will not render`);
      }
      
      // Check for empty multi-select values
      if (item.type === "multi-select" && (!item.values || item.values.length === 0)) {
        issues.push(`${itemPath} (${item.key}): Empty 'values' array - will not render`);
      }
      
      // Check segment values/options
      if (item.type === "segment") {
        const opts = item.values ?? item.options ?? [];
        if (opts.length === 0) {
          issues.push(`${itemPath} (${item.key}): Empty 'values'/'options' - will not render`);
        }
      }
      
      // Recurse into groups/pages
      if ("items" in item && item.items) {
        issues.push(...validateItems(item.items, `${itemPath}.items`));
      }
    }
    
    return issues;
  }
  
  const issues = validateItems(settingsSchema);
  if (issues.length === 0) {
    console.log("✅ No validation issues found");
  } else {
    console.log(`⚠️ Found ${issues.length} potential issues:`);
    for (const issue of issues) {
      console.log(`  - ${issue}`);
    }
  }
  
  // Test the loading flow
  const sourceId = info?.id ?? "multi.mangadex";
  const testSourceKey = `aidoku-community:${sourceId}`;
  await testLoadSchemaFlow(testSourceKey, settingsSchema);
  
  // Test what would actually render
  testRendering(settingsSchema);
}

main().catch((e) => {
  console.error("\nFATAL ERROR:", e);
  process.exit(1);
});

