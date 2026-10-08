import { useEffect, useState } from "react";
import { AlphaType, ColorType, Skia } from "@shopify/react-native-skia";
import { File, Paths } from "expo-file-system";
import { resolveCachedMobileImageUri } from "./mobileImageCache";
import { pickMobileCoverTint, type MobileCoverRgb } from "./mobileCoverTint";
import { pickMobileCoverRegionTints } from "./mobileCoverMesh";
import {
  parseMobileCoverTintStore,
  rememberMobileCoverTint,
  serializeMobileCoverTintStore,
  type MobileCoverTintStore,
} from "./mobileCoverTintStore";

type CoverTintSource = { uri: string; headers?: Record<string, string> } | null | undefined;

// A 12×18 raster keeps the 2:3 cover aspect and is plenty for a hue vote.
const SAMPLE_WIDTH = 12;
const SAMPLE_HEIGHT = 18;
const MAX_CACHED_TINTS = 200;

const tintCache = new Map<string, MobileCoverRgb | null>();
const inflight = new Map<string, Promise<MobileCoverRgb | null>>();

function cacheKey(source: NonNullable<CoverTintSource>): string {
  const headers = source.headers
    ? Object.entries(source.headers)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join("&")
    : "";
  return `${source.uri}\u0000${headers}`;
}

/**
 * Reads a cover through the shared image cache (the same file the cover view
 * paints, so no second download) as a tiny RGBA raster.
 */
async function sampleCoverPixels(
  source: NonNullable<CoverTintSource>,
): Promise<Uint8Array | null> {
  const file = await resolveCachedMobileImageUri({
    uri: source.uri,
    headers: source.headers,
    cacheKind: "cover",
  });
  if (!file) return null;
  const data = await Skia.Data.fromURI(file);
  const image = Skia.Image.MakeImageFromEncoded(data);
  if (!image) return null;
  const surface = Skia.Surface.Make(SAMPLE_WIDTH, SAMPLE_HEIGHT);
  if (!surface) return null;
  surface
    .getCanvas()
    .drawImageRect(
      image,
      Skia.XYWHRect(0, 0, image.width(), image.height()),
      Skia.XYWHRect(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT),
      Skia.Paint(),
    );
  surface.flush();
  const pixels = surface.makeImageSnapshot().readPixels(0, 0, {
    width: SAMPLE_WIDTH,
    height: SAMPLE_HEIGHT,
    colorType: ColorType.RGBA_8888,
    alphaType: AlphaType.Unpremul,
  });
  return pixels instanceof Uint8Array ? pixels : null;
}

/**
 * A cover's pixels on the fingerprint grid (`mobileCoverPreference`: the
 * 12×18 raster the tint is voted on), for telling whether two covers show the
 * same artwork. Null when it cannot be read.
 */
export function sampleMobileCoverFingerprint(source: CoverTintSource): Promise<Uint8Array | null> {
  if (!source?.uri) return Promise.resolve(null);
  return sampleCoverPixels(source).catch(() => null);
}

const pixelWidths = new Map<string, number | null>();
const pixelWidthsInflight = new Map<string, Promise<number | null>>();

/**
 * A cover's own width in pixels, read from the shared image cache (the file
 * the cover view paints; fetched into the cache if it is not there yet).
 * Null when it cannot be read. Memoised for the session.
 */
export function measureMobileCoverPixelWidth(source: CoverTintSource): Promise<number | null> {
  if (!source?.uri) return Promise.resolve(null);
  const key = cacheKey(source);
  if (pixelWidths.has(key)) return Promise.resolve(pixelWidths.get(key) ?? null);
  const pending = pixelWidthsInflight.get(key);
  if (pending) return pending;
  const next = (async () => {
    const file = await resolveCachedMobileImageUri({
      uri: source.uri,
      headers: source.headers,
      cacheKind: "cover",
    });
    if (!file) return null;
    const image = Skia.Image.MakeImageFromEncoded(await Skia.Data.fromURI(file));
    const width = image?.width() ?? 0;
    return width > 0 ? width : null;
  })()
    .catch(() => null)
    .then((width) => {
      pixelWidthsInflight.delete(key);
      if (pixelWidths.size >= MAX_CACHED_TINTS) {
        const oldest = pixelWidths.keys().next().value;
        if (oldest !== undefined) pixelWidths.delete(oldest);
      }
      pixelWidths.set(key, width);
      return width;
    });
  pixelWidthsInflight.set(key, next);
  return next;
}

/** The width measured this session, if any (undefined: not measured yet). */
function getMobileCoverPixelWidthSync(source: CoverTintSource): number | null | undefined {
  if (!source?.uri) return null;
  const key = cacheKey(source);
  return pixelWidths.has(key) ? (pixelWidths.get(key) ?? null) : undefined;
}

/**
 * A cover's pixel width for sizing it (null until known). Known on the first
 * render when any surface measured the same cover this session, so a page
 * the cover zooms into is laid out for it from its first frame.
 */
export function useMobileCoverPixelWidth(source: CoverTintSource): number | null {
  const uri = source?.uri ?? null;
  const headersKey = source?.headers ? JSON.stringify(source.headers) : "";
  const [state, setState] = useState<{ key: string; width: number | null } | null>(null);
  const key = `${uri}|${headersKey}`;
  const sync = getMobileCoverPixelWidthSync(source);
  useEffect(() => {
    if (!uri) return undefined;
    let cancelled = false;
    const headers = headersKey ? (JSON.parse(headersKey) as Record<string, string>) : undefined;
    void measureMobileCoverPixelWidth({ uri, headers }).then((width) => {
      if (!cancelled) setState({ key, width });
    });
    return () => {
      cancelled = true;
    };
  }, [headersKey, key, uri]);
  if (state && state.key === key) return state.width;
  return sync ?? null;
}

/** Samples a cover and returns its tint colour. */
async function sampleCoverTint(
  source: NonNullable<CoverTintSource>,
): Promise<MobileCoverRgb | null> {
  const pixels = await sampleCoverPixels(source);
  return pixels ? pickMobileCoverTint(pixels) : null;
}

// Sampled tints survive restarts in one small cache file, so the first frame
// after a cold start already paints each card in its cover's colour. Read once,
// synchronously, on first use; written back debounced. Best effort throughout:
// a missing or damaged file only costs the one-second indigo fallback.
const PERSISTED_TINTS_FILE = "nemu-cover-tints-v1.json";
const PERSIST_DELAY_MS = 1500;
let persistedTints: MobileCoverTintStore | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function persistedTintStore(): MobileCoverTintStore {
  if (persistedTints) return persistedTints;
  let text: string | null = null;
  try {
    const file = new File(Paths.cache, PERSISTED_TINTS_FILE);
    if (file.exists) text = file.textSync();
  } catch {
    text = null;
  }
  persistedTints = parseMobileCoverTintStore(text);
  return persistedTints;
}

function persistTint(keys: Array<string | null | undefined>, tint: MobileCoverRgb): void {
  const store = persistedTintStore();
  let dirty = false;
  for (const key of keys) {
    if (key && rememberMobileCoverTint(store, key, tint)) dirty = true;
  }
  if (!dirty || persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      new File(Paths.cache, PERSISTED_TINTS_FILE).writeSync(
        serializeMobileCoverTintStore(store),
      );
    } catch {
      // Best effort (see above).
    }
  }, PERSIST_DELAY_MS);
}

/**
 * The tint known right now, without sampling: this session's result, else the
 * one persisted for the cover URL, else the one persisted for `alias` (a
 * stable id such as `item:<libraryItemId>`, for the frame before the cover
 * URL has resolved). `undefined` when nothing is known yet.
 */
function getMobileCoverTintSync(
  source: CoverTintSource,
  alias?: string,
): MobileCoverRgb | null | undefined {
  const persisted = persistedTintStore();
  const byAlias = alias ? persisted.get(alias) : undefined;
  if (!source?.uri) return byAlias;
  const key = cacheKey(source);
  // A failed sample this session (`null`) falls back to what was persisted.
  return (
    tintCache.get(key) ??
    persisted.get(source.uri) ??
    byAlias ??
    (tintCache.has(key) ? null : undefined)
  );
}

function loadMobileCoverTint(
  source: CoverTintSource,
  alias?: string,
): Promise<MobileCoverRgb | null> {
  if (!source?.uri) return Promise.resolve(null);
  const key = cacheKey(source);
  if (tintCache.has(key)) return Promise.resolve(tintCache.get(key) ?? null);
  const pending = inflight.get(key);
  if (pending) return pending;
  const uri = source.uri;
  const next = sampleCoverTint(source)
    .catch(() => null)
    .then((tint) => {
      inflight.delete(key);
      if (tintCache.size >= MAX_CACHED_TINTS) {
        const oldest = tintCache.keys().next().value;
        if (oldest !== undefined) tintCache.delete(oldest);
      }
      tintCache.set(key, tint);
      if (tint) persistTint([uri, alias], tint);
      return tint;
    });
  inflight.set(key, next);
  return next;
}

function sameTint(a: MobileCoverRgb | null, b: MobileCoverRgb | null): boolean {
  return a === b || (a !== null && b !== null && a.r === b.r && a.g === b.g && a.b === b.b);
}

/**
 * The cover's tint colour, or `null` while none is known (and for covers that
 * cannot be sampled). A tint persisted by an earlier session is returned on
 * the first render; the cover is still re-sampled once per session and the
 * value only changes if the cover did.
 */
export function useMobileCoverTint(
  source: CoverTintSource,
  alias?: string,
): MobileCoverRgb | null {
  const uri = source?.uri ?? null;
  const headersKey = source?.headers ? JSON.stringify(source.headers) : "";
  const key = `${uri}|${headersKey}|${alias ?? ""}`;
  const [state, setState] = useState<{ key: string; tint: MobileCoverRgb | null }>(() => ({
    key,
    tint: getMobileCoverTintSync(source, alias) ?? null,
  }));
  const current =
    state.key === key ? state.tint : (getMobileCoverTintSync(source, alias) ?? null);

  useEffect(() => {
    let cancelled = false;
    if (!uri) return undefined;
    const request = {
      uri,
      headers: headersKey ? (JSON.parse(headersKey) as Record<string, string>) : undefined,
    };
    void loadMobileCoverTint(request, alias).then((sampled) => {
      if (cancelled) return;
      // A failed sample keeps whatever tint is already known.
      const tint = sampled ?? getMobileCoverTintSync(request, alias) ?? null;
      setState((previous) =>
        previous.key === key && sameTint(previous.tint, tint) ? previous : { key, tint },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [alias, headersKey, key, uri]);

  return current;
}

// Region tints (the four quarters) for the detail hero's living page: this
// session only, sampled when a hero asks, not persisted (the page starts as
// the single tint and blends into the regions once they are known).
const regionCache = new Map<string, MobileCoverRgb[] | null>();
const regionInflight = new Map<string, Promise<MobileCoverRgb[] | null>>();

function loadMobileCoverRegionTints(
  source: NonNullable<CoverTintSource>,
): Promise<MobileCoverRgb[] | null> {
  const key = cacheKey(source);
  if (regionCache.has(key)) return Promise.resolve(regionCache.get(key) ?? null);
  const pending = regionInflight.get(key);
  if (pending) return pending;
  const next = sampleCoverPixels(source)
    .then((pixels) => (pixels ? pickMobileCoverRegionTints(pixels, SAMPLE_WIDTH, SAMPLE_HEIGHT) : null))
    .catch(() => null)
    .then((regions) => {
      regionInflight.delete(key);
      if (regionCache.size >= MAX_CACHED_TINTS) {
        const oldest = regionCache.keys().next().value;
        if (oldest !== undefined) regionCache.delete(oldest);
      }
      regionCache.set(key, regions);
      return regions;
    });
  regionInflight.set(key, next);
  return next;
}

/** The cover's four quarter tints, or `null` until sampled (or when it cannot be). */
export function useMobileCoverRegionTints(source: CoverTintSource): MobileCoverRgb[] | null {
  const uri = source?.uri ?? null;
  const headersKey = source?.headers ? JSON.stringify(source.headers) : "";
  const key = `${uri}|${headersKey}`;
  const [state, setState] = useState<{ key: string; regions: MobileCoverRgb[] | null }>(() => ({
    key,
    regions: source?.uri ? (regionCache.get(cacheKey(source)) ?? null) : null,
  }));
  useEffect(() => {
    let cancelled = false;
    if (!uri) return undefined;
    const request = {
      uri,
      headers: headersKey ? (JSON.parse(headersKey) as Record<string, string>) : undefined,
    };
    void loadMobileCoverRegionTints(request).then((regions) => {
      if (!cancelled) setState({ key, regions });
    });
    return () => {
      cancelled = true;
    };
  }, [headersKey, key, uri]);
  return state.key === key ? state.regions : null;
}
