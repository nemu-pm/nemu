import { File, Paths } from "expo-file-system";
import type { MobileRegistrySource } from "./aidokuRegistry";
import {
  decodeRegistryIndexCache,
  encodeRegistryIndexCache,
} from "./mobileRegistryIndexCache";

// Native registry-index cache: a single JSON file in the OS cache directory.
// Public catalog data only; best-effort persistence that never blocks loads.

const registryIndexCacheFile = new File(
  Paths.cache,
  "nemu-registry-index-v1.json",
);

export async function loadCachedRegistryIndex(): Promise<MobileRegistrySource[] | null> {
  try {
    if (!registryIndexCacheFile.exists) return null;
    return decodeRegistryIndexCache(await registryIndexCacheFile.text());
  } catch {
    return null;
  }
}

export async function saveCachedRegistryIndex(
  sources: MobileRegistrySource[],
): Promise<void> {
  try {
    if (sources.length === 0) return;
    await registryIndexCacheFile.write(encodeRegistryIndexCache(sources));
  } catch {
    // Cache persistence is best-effort; the network fetch is the source of truth.
  }
}

export async function clearCachedRegistryIndex(): Promise<void> {
  try {
    if (registryIndexCacheFile.exists) registryIndexCacheFile.delete();
  } catch {
    // A missing or locked cache file is already effectively cleared.
  }
}
