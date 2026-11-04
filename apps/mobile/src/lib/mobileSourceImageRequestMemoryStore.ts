import type { InstalledSource } from "@/data/schema";
import { MOBILE_COVER_PERSIST_DELAY_MS } from "@/lib/mobileCoverTintStore";
import {
  makeMobileSourceImageRequestMemoryKey,
  parseMobileSourceImageRequestMemory,
  rememberMobileSourceImageRequest,
  serializeMobileSourceImageRequestMemory,
  type MobileSourceImageRequestMemory,
} from "@/lib/mobileSourceImageRequestMemory";
import type { MobileSourceImageRequest } from "@/sources/mobileSourceImages";
import { getActiveMobileSourceProfileScope } from "@/sources/mobileSourceProfileScope";

/**
 * The remembered requests (`mobileSourceImageRequestMemory`), read
 * synchronously on first use so the first frame after a cold start has them,
 * and written back debounced to one small cache file (best effort, like the
 * cover tint and preference files).
 */
const FILE_NAME = "nemu-source-image-requests-v1.json";

/** Loaded on first use, not at import: the request hook's unit tests run without the native module. */
function cacheFile() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { File, Paths } = require("expo-file-system") as typeof import("expo-file-system");
  return new File(Paths.cache, FILE_NAME);
}
let memory: MobileSourceImageRequestMemory | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function current(): MobileSourceImageRequestMemory {
  if (memory) return memory;
  let text: string | null = null;
  try {
    const file = cacheFile();
    if (file.exists) text = file.textSync();
  } catch {
    text = null;
  }
  memory = parseMobileSourceImageRequestMemory(text);
  return memory;
}

function keyFor(source: InstalledSource, url: string): string {
  return makeMobileSourceImageRequestMemoryKey(
    {
      scope: getActiveMobileSourceProfileScope(),
      sourceId: source.id,
      packageCacheKey: source.packageCacheKey,
      version: source.version,
      updatedAt: source.updatedAt,
    },
    url,
  );
}

export function getRememberedMobileSourceImageRequest(
  source: InstalledSource | null | undefined,
  url: string | null | undefined,
): MobileSourceImageRequest | null {
  if (!source || !url) return null;
  return current().get(keyFor(source, url)) ?? null;
}

export function rememberMobileSourceImageRequestFor(
  source: InstalledSource,
  url: string,
  request: MobileSourceImageRequest | null,
): void {
  if (!rememberMobileSourceImageRequest(current(), keyFor(source, url), request)) return;
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      cacheFile().writeSync(serializeMobileSourceImageRequestMemory(current()));
    } catch {
      // Best effort.
    }
  }, MOBILE_COVER_PERSIST_DELAY_MS);
}
