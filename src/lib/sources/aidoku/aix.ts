/**
 * AIX package utilities
 * Extract WASM, manifest, and settings from cached AIX blobs
 */
import type { SourceManifest } from "./types";
import type { Setting } from "@/lib/settings";

export interface AixContents {
  wasmBytes: ArrayBuffer;
  manifest: SourceManifest;
  settings?: Setting[];
}

/**
 * Extract contents from an AIX package (zip file)
 */
export async function extractAix(aixData: ArrayBuffer): Promise<AixContents> {
  const { unzipSync } = await import("fflate");
  const files = unzipSync(new Uint8Array(aixData));

  const manifestData = files["Payload/source.json"];
  const wasmData = files["Payload/main.wasm"];
  const settingsData = files["Payload/settings.json"];
  const filtersData = files["Payload/filters.json"];

  console.log("[AIX] Files in package:", Object.keys(files));

  if (!manifestData || !wasmData) {
    throw new Error("Invalid .aix package: missing source.json or main.wasm");
  }

  const manifest: SourceManifest = JSON.parse(
    new TextDecoder().decode(manifestData)
  );

  // Load filters from separate filters.json if manifest doesn't have them
  if (!manifest.filters && filtersData) {
    try {
      manifest.filters = JSON.parse(new TextDecoder().decode(filtersData));
      console.log("[AIX] Loaded filters from filters.json:", manifest.filters?.length);
    } catch {
      // Ignore invalid filters.json
    }
  }

  console.log("[AIX] Manifest filters:", manifest.filters?.length ?? 0);

  let settings: Setting[] | undefined;
  if (settingsData) {
    try {
      settings = JSON.parse(new TextDecoder().decode(settingsData));
    } catch {
      // Ignore invalid settings.json
    }
  }

  return {
    wasmBytes: wasmData.buffer.slice(0) as ArrayBuffer,
    manifest,
    settings,
  };
}

/**
 * Extract only the settings from an AIX package
 * More efficient if you only need settings
 */
export async function extractAixSettings(aixData: ArrayBuffer): Promise<Setting[] | null> {
  const { unzipSync } = await import("fflate");
  const files = unzipSync(new Uint8Array(aixData));

  const settingsData = files["Payload/settings.json"];
  if (!settingsData) return null;

  try {
    return JSON.parse(new TextDecoder().decode(settingsData));
  } catch {
    return null;
  }
}

