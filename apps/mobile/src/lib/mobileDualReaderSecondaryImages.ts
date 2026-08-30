/**
 * Mobile dual-reader secondary-image resolution — the bridge between fetched
 * secondary pages and the Skia renderer, mirroring web's
 * `ensureSecondaryImage` / `ensureSecondaryCompositeImage`
 * (`src/lib/plugins/builtin/dual-reader/components.tsx:474-638`).
 *
 * Web fetches a `Blob` via `page.getImage()`, composites on a `<canvas>`, and
 * stores a blob object URL. Mobile fetches page bytes from `page.imageUri`
 * (`fetchMobilePageBytes`), composites via the `MobileDualReaderRenderer`
 * (`decodeImage`/`renderSplit`/`renderMerge` → Skia `SkImage`), and stores a
 * `DualReadSecondaryImageHandle` (`{ image, dispose }`) in the store.
 *
 * Page *loading* (refreshing chapter pages via `refreshMobileReaderPages`) is
 * owned by the SecondaryPrefetcher (T3.4); this module takes already-loaded
 * `MobileReaderPage[]` and only does decode + composite + cache. In-flight
 * dedup mirrors web's module-level `loadingSecondaryImages` set.
 *
 * Pure-ish + injectable (`renderer`, `fetchBytes`, `store` seam) so the
 * decode→composite→cache path is unit-testable without Skia or a native build.
 */
import type { MobileReaderPage } from "@/sources/mobileSourcePages";
import { mobileNativeFetch } from "@/sources/mobileNativeHttp";
import type { SecondaryRenderPlan } from "@nemu/core/dual-reader";
import {
  base64DecodedByteLength,
  base64ToBytes,
} from "./mobileBase64";
import {
  MobileDualReaderDecodeCancelledError,
  isMobileDualReaderDecodeCancelledError,
  mobileDualReaderDecodeScheduler,
  type MobileDualReaderDecodeScheduler,
} from "./mobileDualReaderDecodeScheduler";
import {
  MOBILE_DUAL_READER_MAX_ENCODED_BYTES,
  assertMobileDualReaderEncodedByteLength,
  assertMobileDualReaderSurfaceBudget,
} from "./mobileDualReaderImageSafety";
import type {
  DualReadSecondaryImageHandle,
  MobileDualReadStore,
} from "./mobileDualReaderStore";
import type {
  MobileDualReaderRealized,
  MobileDualReaderRenderer,
} from "./mobileDualReaderSkiaAdapter";

function base64FromDataUri(uri: string): string | null {
  const commaIndex = uri.indexOf(",");
  if (commaIndex < 0) return null;
  const metadata = uri.slice(0, commaIndex).toLowerCase();
  if (!metadata.includes(";base64")) return null;
  return uri.slice(commaIndex + 1);
}

export type MobilePageBytesFetcher = (
  page: Pick<MobileReaderPage, "imageUri" | "headers">,
  options?: { signal?: AbortSignal },
) => Promise<Uint8Array>;

export type MobilePageBytesOptions = {
  fetchImpl?: typeof fetch;
  readFileBytes?: (uri: string) => Promise<Uint8Array>;
  signal?: AbortSignal;
};

async function defaultReadFileBytes(uri: string): Promise<Uint8Array> {
  const { File } = await import("expo-file-system");
  const file = new File(uri);
  const size = file.info().size;
  if (size != null) assertMobileDualReaderEncodedByteLength(size);
  const bytes = await file.bytes();
  assertMobileDualReaderEncodedByteLength(bytes.byteLength);
  return bytes;
}

/**
 * Fetch a reader page's image as raw bytes for Skia decode. Mirrors the JL OCR
 * `imageUriToBase64` path but returns bytes (Skia takes `Uint8Array`, not
 * base64): `data:` → base64-decode, `http(s)://` → fetch with headers, file URI
 * → `readFileBytes`.
 */
export async function fetchMobilePageBytes(
  page: Pick<MobileReaderPage, "imageUri" | "headers">,
  options: MobilePageBytesOptions = {},
): Promise<Uint8Array> {
  const uri = page.imageUri;
  if (!uri) throw new Error("Secondary page has no image.");
  const fetchImpl = options.fetchImpl ?? fetch;
  const readFileBytes = options.readFileBytes ?? defaultReadFileBytes;
  if (options.signal?.aborted) {
    throw new MobileDualReaderDecodeCancelledError();
  }

  if (uri.startsWith("data:")) {
    const base64 = base64FromDataUri(uri);
    if (!base64)
      throw new Error("Secondary page image data is not base64 encoded.");
    assertMobileDualReaderEncodedByteLength(
      base64DecodedByteLength(base64),
    );
    return base64ToBytes(base64);
  }
  if (!uri.startsWith("http://") && !uri.startsWith("https://")) {
    const bytes = await readFileBytes(uri);
    assertMobileDualReaderEncodedByteLength(bytes.byteLength);
    return bytes;
  }
  if (fetchImpl === fetch) {
    const response = await mobileNativeFetch(uri, {
      headers: page.headers,
      responseMode: "bytes",
      maxResponseBytes: MOBILE_DUAL_READER_MAX_ENCODED_BYTES,
      signal: options.signal,
    });
    if (!response.ok) {
      throw new Error(`Secondary page image fetch failed: ${response.status}`);
    }
    assertMobileDualReaderEncodedByteLength(response.bytes.byteLength);
    return response.bytes;
  }

  const response = await fetchImpl(uri, {
    headers: page.headers,
    signal: options.signal,
  });
  if (!response.ok) {
    throw new Error(
      `Secondary page image fetch failed: ${response.status} ${response.statusText}`,
    );
  }
  const declaredLengthHeader = response.headers.get("content-length");
  const declaredLength = Number(declaredLengthHeader);
  if (declaredLengthHeader != null && Number.isFinite(declaredLength)) {
    assertMobileDualReaderEncodedByteLength(declaredLength);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  assertMobileDualReaderEncodedByteLength(bytes.byteLength);
  return bytes;
}

/** Cache key for a single secondary page. Mirrors web `${chapterId}:${index}`. */
export function makeSecondarySingleKey(
  chapterId: string,
  index: number,
): string {
  return `${chapterId}:${index}`;
}

/** Cache key for a composite (split/merge) plan. Mirrors web `makeCompositeKey`. */
export function makeSecondaryCompositeKey(plan: SecondaryRenderPlan): string {
  if (plan.kind === "split") {
    return `split:${plan.secondaryChapterId}:${plan.secondaryIndex}:${plan.side}`;
  }
  if (plan.kind === "merge") {
    return `merge:${plan.secondaryChapterId}:${plan.secondaryIndices[0]}:${plan.secondaryIndices[1]}:${plan.order}`;
  }
  return `invalid:${plan.secondaryChapterId}`;
}

/** Minimal store seam the resolver needs (so tests can inject a fake). */
export type SecondaryImageStoreSeam = {
  hasImage: (key: string) => boolean;
  getGeneration: () => number;
  setImage: (
    key: string,
    handle: DualReadSecondaryImageHandle,
    generation: number,
  ) => boolean;
};

/** Adapt the real mobile dual-reader store to the resolver seam. */
export function adaptMobileDualReadStore(
  store: MobileDualReadStore,
): SecondaryImageStoreSeam {
  return {
    hasImage: (key) => store.getState().secondaryImageUrls.has(key),
    getGeneration: () => store.getState().runtimeGeneration,
    setImage: (key, handle, generation) =>
      store.getState().setSecondaryImageUrl(key, handle, generation),
  };
}

// Module-level in-flight dedup, mirroring web's `loadingSecondaryImages` set.
const loadingSecondaryImages = new Set<string>();

function releaseRealized(
  renderer: MobileDualReaderRenderer,
  realized: MobileDualReaderRealized,
): void {
  try {
    renderer.release?.(realized);
  } catch {
    // Resource cleanup must not mask the render result or prevent another
    // decoded intermediate from being released.
  }
}

function throwIfDecodeCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new MobileDualReaderDecodeCancelledError();
}

async function makeHandle(
  renderer: MobileDualReaderRenderer,
  realized: MobileDualReaderRealized,
): Promise<DualReadSecondaryImageHandle> {
  const { width, height } = await renderer.getDimensions(realized);
  const cost = assertMobileDualReaderSurfaceBudget(
    width,
    height,
    "Dual-reader cached image",
  );
  return {
    image: realized,
    ...cost,
    dispose: () => {
      releaseRealized(renderer, realized);
    },
  };
}

/** Decode a single secondary page to a SkImage and cache it under its key. */
export async function ensureSecondaryImage(input: {
  renderer: MobileDualReaderRenderer;
  fetchBytes: MobilePageBytesFetcher;
  store: SecondaryImageStoreSeam;
  pages: MobileReaderPage[];
  chapterId: string;
  index: number;
  signal?: AbortSignal;
  decodeScheduler?: MobileDualReaderDecodeScheduler;
}): Promise<void> {
  const {
    renderer,
    fetchBytes,
    store,
    pages,
    chapterId,
    index,
    signal,
    decodeScheduler = mobileDualReaderDecodeScheduler,
  } = input;
  if (pages.length === 0) return;
  const clamped = Math.max(0, Math.min(index, pages.length - 1));
  const key = makeSecondarySingleKey(chapterId, clamped);
  const generation = store.getGeneration();
  const loadingKey = `${generation}:${key}`;
  if (store.hasImage(key) || loadingSecondaryImages.has(loadingKey)) return;

  const page = pages[clamped];
  if (!page) return;
  loadingSecondaryImages.add(loadingKey);
  let realized: MobileDualReaderRealized | null = null;
  try {
    await decodeScheduler.schedule(
      async () => {
        throwIfDecodeCancelled(signal);
        const bytes = await fetchBytes(page, { signal });
        throwIfDecodeCancelled(signal);
        realized = await renderer.decodeImage(bytes);
        throwIfDecodeCancelled(signal);
        return realized;
      },
      { signal },
    );
    if (!realized) return;
    const handle = await makeHandle(renderer, realized);
    if (
      signal?.aborted ||
      generation !== store.getGeneration() ||
      !store.setImage(key, handle, generation)
    ) {
      releaseRealized(renderer, realized);
    } else {
      // The cache handle owns the native image from this point forward.
      realized = null;
    }
  } catch (err) {
    if (realized) releaseRealized(renderer, realized);
    if (!isMobileDualReaderDecodeCancelledError(err)) {
      console.error("[DualRead] Failed to load secondary image", err);
    }
  } finally {
    loadingSecondaryImages.delete(loadingKey);
  }
}

/**
 * Composite a split/merge plan into a single SkImage and cache it under the
 * composite key. `single`/`missing` plans are no-ops (single uses
 * `ensureSecondaryImage`; missing has no image).
 */
export async function ensureSecondaryCompositeImage(input: {
  renderer: MobileDualReaderRenderer;
  fetchBytes: MobilePageBytesFetcher;
  store: SecondaryImageStoreSeam;
  pages: MobileReaderPage[];
  plan: SecondaryRenderPlan;
  signal?: AbortSignal;
  decodeScheduler?: MobileDualReaderDecodeScheduler;
}): Promise<void> {
  const {
    renderer,
    fetchBytes,
    store,
    pages,
    plan,
    signal,
    decodeScheduler = mobileDualReaderDecodeScheduler,
  } = input;
  if (plan.kind === "single" || plan.kind === "missing") return;
  const key = makeSecondaryCompositeKey(plan);
  const generation = store.getGeneration();
  const loadingKey = `${generation}:${key}`;
  if (store.hasImage(key) || loadingSecondaryImages.has(loadingKey)) return;

  loadingSecondaryImages.add(loadingKey);
  let realized: MobileDualReaderRealized | null = null;
  try {
    await decodeScheduler.schedule(
      async () => {
        throwIfDecodeCancelled(signal);
        if (plan.kind === "split") {
          const page = pages[plan.secondaryIndex];
          if (!page) return null;
          const bytes = await fetchBytes(page, { signal });
          throwIfDecodeCancelled(signal);
          const decoded = await renderer.decodeImage(bytes);
          try {
            throwIfDecodeCancelled(signal);
            realized = await renderer.renderSplit(decoded, plan.side);
            throwIfDecodeCancelled(signal);
            return realized;
          } finally {
            releaseRealized(renderer, decoded);
          }
        }

        const [aIndex, bIndex] = plan.secondaryIndices;
        const pageA = pages[aIndex];
        const pageB = pages[bIndex];
        if (!pageA || !pageB) return null;
        const decoded: MobileDualReaderRealized[] = [];
        let bytes = await fetchBytes(pageA, { signal });
        throwIfDecodeCancelled(signal);
        const decodedA = await renderer.decodeImage(bytes);
        decoded.push(decodedA);
        try {
          throwIfDecodeCancelled(signal);
          bytes = await fetchBytes(pageB, { signal });
          throwIfDecodeCancelled(signal);
          const decodedB = await renderer.decodeImage(bytes);
          decoded.push(decodedB);
          throwIfDecodeCancelled(signal);
          realized = await renderer.renderMerge(
            decodedA,
            decodedB,
            plan.order,
          );
          throwIfDecodeCancelled(signal);
          return realized;
        } finally {
          decoded.forEach((image) => releaseRealized(renderer, image));
        }
      },
      { signal },
    );

    if (!realized) return;
    const handle = await makeHandle(renderer, realized);
    if (
      signal?.aborted ||
      generation !== store.getGeneration() ||
      !store.setImage(key, handle, generation)
    ) {
      releaseRealized(renderer, realized);
    } else {
      realized = null;
    }
  } catch (err) {
    if (realized) releaseRealized(renderer, realized);
    if (!isMobileDualReaderDecodeCancelledError(err)) {
      console.error("[DualRead] Failed to build secondary composite image", err);
    }
  } finally {
    loadingSecondaryImages.delete(loadingKey);
  }
}

/** Test-only: reset the module-level in-flight set between test files. */
export function __resetSecondaryImageLoading(): void {
  loadingSecondaryImages.clear();
  mobileDualReaderDecodeScheduler.cancelPending();
  mobileDualReaderDecodeScheduler.setAppState("active");
}
