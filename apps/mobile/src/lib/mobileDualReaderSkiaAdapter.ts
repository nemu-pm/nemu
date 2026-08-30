/**
 * Mobile Skia renderer for dual-reader visual alignment.
 *
 * Two responsibilities, mirroring web:
 *
 * 1. **Alignment** — `decodeToRgba(bytes)` decodes encoded image bytes to RGBA
 *    pixels for dHash/FFT alignment (`computeHashFromBytes` / alignment thread).
 * 2. **Rendering** — `decodeImage(bytes)` decodes to a full-res Skia image, and
 *    `renderSplit`/`renderMerge` composite (crop half / height-scale + concat)
 *    into a single Skia image the overlay draws with the alignment transform.
 *    This matches web's `renderSplitBlob`/`renderMergeBlob` (which pre-composite
 *    to one image then position it with CSS), because RN-skia's `<Image>` takes
 *    a full image + rect (no src subset), so split/merge must be pre-composited.
 *
 * The compositing **math** (crop rect, merge target dimensions, pixel placement)
 * is exported as pure functions and unit-tested against the web reference. The
 * Skia glue is lazy + injectable so the renderer is exercisable without a native
 * build: tests inject a pure-RGBA renderer; on device the default lazily imports
 * `@shopify/react-native-skia` and returns real Skia images.
 *
 * DEVICE-GATED: the Skia path requires the native build (T2.1) and is verified
 * on-device (T7.4). The math + queue/dispose logic is unit-tested here.
 *
 * For a `merge` plan, `a` is the index-A secondary page and `b` is the index-B
 * page; `order` selects which is drawn on the left (`normal` → A left, `swap` →
 * B left), matching web's `leftDecoded`/`rightDecoded` swap.
 */
import type {
  AlphaType,
  ColorType,
  ImageInfo,
  SkCanvas,
  SkColor,
  SkData,
  SkImage,
  SkPaint,
  SkRect,
} from "@shopify/react-native-skia";
import type { DualReaderRgbaImage } from "@nemu/core/dual-reader";
import {
  assertMobileDualReaderDecodedImageBudget,
  assertMobileDualReaderEncodedByteLength,
  assertMobileDualReaderRgbaDataLength,
  assertMobileDualReaderSurfaceBudget,
  fitMobileDualReaderHashDimensions,
  fitMobileDualReaderSurfaceDimensions,
} from "./mobileDualReaderImageSafety";

// ---------------------------------------------------------------------------
// Pure compositing math (parity with web, unit-tested).
// ---------------------------------------------------------------------------

/** Compute the source crop rect for a split plan. Mirrors `renderSplitBlob`. */
export function computeSplitCrop(input: {
  width: number;
  height: number;
  side: "left" | "right";
}): { sx: number; sy: number; cropWidth: number; height: number } {
  const leftWidth = Math.floor(input.width / 2);
  const rightWidth = Math.max(1, input.width - leftWidth);
  const cropWidth =
    input.side === "left" ? Math.max(1, leftWidth) : rightWidth;
  const sx = input.side === "left" ? 0 : input.width - cropWidth;
  return { sx, sy: 0, cropWidth, height: input.height };
}

/** Compute the merge target layout. Mirrors `renderMergeBlob`. */
export function computeMergeLayout(input: {
  left: { width: number; height: number };
  right: { width: number; height: number };
}): {
  targetHeight: number;
  leftWidth: number;
  rightWidth: number;
  totalWidth: number;
  leftScale: number;
  rightScale: number;
} {
  const targetHeight = Math.max(input.left.height, input.right.height);
  const leftScale = targetHeight / input.left.height;
  const rightScale = targetHeight / input.right.height;
  const leftWidth = Math.max(1, Math.round(input.left.width * leftScale));
  const rightWidth = Math.max(1, Math.round(input.right.width * rightScale));
  return {
    targetHeight,
    leftWidth,
    rightWidth,
    totalWidth: leftWidth + rightWidth,
    leftScale,
    rightScale,
  };
}

/** Crop an RGBA image to a sub-rect (pure, nearest copy). */
export function cropRgba(
  image: DualReaderRgbaImage,
  rect: { sx: number; sy: number; width: number; height: number },
): DualReaderRgbaImage {
  const { sx, sy, width, height } = rect;
  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const si = ((y + sy) * image.width + (x + sx)) * 4;
      const di = (y * width + x) * 4;
      out[di] = image.data[si]!;
      out[di + 1] = image.data[si + 1]!;
      out[di + 2] = image.data[si + 2]!;
      out[di + 3] = image.data[si + 3]!;
    }
  }
  return { data: out, width, height };
}

/**
 * Height-scale an RGBA image to `targetHeight` using nearest-neighbor sampling
 * (pure reference; Skia uses bilinear on-device — visually equivalent for the
 * dual-reader merge). Width is scaled by the same factor as web's canvas draw.
 */
export function scaleRgbaToHeight(
  image: DualReaderRgbaImage,
  targetHeight: number,
): DualReaderRgbaImage {
  if (image.height === targetHeight) return image;
  const scale = targetHeight / image.height;
  const outWidth = Math.max(1, Math.round(image.width * scale));
  return scaleRgbaToDimensions(image, outWidth, targetHeight);
}

/** Scale RGBA to an exact bounded output size using nearest-neighbor sampling. */
export function scaleRgbaToDimensions(
  image: DualReaderRgbaImage,
  outWidth: number,
  outHeight: number,
): DualReaderRgbaImage {
  if (image.width === outWidth && image.height === outHeight) return image;
  assertMobileDualReaderSurfaceBudget(outWidth, outHeight, "Dual-reader RGBA scale");
  const scaleX = outWidth / image.width;
  const scaleY = outHeight / image.height;
  const out = new Uint8Array(outWidth * outHeight * 4);
  for (let y = 0; y < outHeight; y += 1) {
    const sy = Math.min(image.height - 1, Math.floor(y / scaleY));
    for (let x = 0; x < outWidth; x += 1) {
      const sx = Math.min(image.width - 1, Math.floor(x / scaleX));
      const si = (sy * image.width + sx) * 4;
      const di = (y * outWidth + x) * 4;
      out[di] = image.data[si]!;
      out[di + 1] = image.data[si + 1]!;
      out[di + 2] = image.data[si + 2]!;
      out[di + 3] = image.data[si + 3]!;
    }
  }
  return { data: out, width: outWidth, height: outHeight };
}

export function fitMobileDualReaderMergeLayout(
  layout: ReturnType<typeof computeMergeLayout>,
): ReturnType<typeof computeMergeLayout> {
  const fitted = fitMobileDualReaderSurfaceDimensions(
    layout.totalWidth,
    layout.targetHeight,
  );
  if (
    fitted.width === layout.totalWidth &&
    fitted.height === layout.targetHeight
  ) {
    return layout;
  }
  const leftWidth = Math.max(
    1,
    Math.min(
      fitted.width - 1,
      Math.round((fitted.width * layout.leftWidth) / layout.totalWidth),
    ),
  );
  const rightWidth = fitted.width - leftWidth;
  const heightScale = fitted.height / layout.targetHeight;
  const bounded = {
    targetHeight: fitted.height,
    leftWidth,
    rightWidth,
    totalWidth: fitted.width,
    leftScale: layout.leftScale * heightScale,
    rightScale: layout.rightScale * heightScale,
  };
  assertMobileDualReaderSurfaceBudget(
    bounded.totalWidth,
    bounded.targetHeight,
    "Dual-reader merge surface",
  );
  return bounded;
}

/**
 * Horizontally concatenate two RGBA images (both already scaled to the same
 * height). Rows are interleaved (left row then right row per output row) so the
 * result is a true `(leftW+rightW) × H` row-major image.
 */
export function concatRgbaHorizontal(
  left: DualReaderRgbaImage,
  right: DualReaderRgbaImage,
): DualReaderRgbaImage {
  if (left.height !== right.height) {
    throw new Error("concatRgbaHorizontal: heights must match");
  }
  const totalWidth = left.width + right.width;
  const out = new Uint8Array(totalWidth * left.height * 4);
  const rowBytes = totalWidth * 4;
  const leftRowBytes = left.width * 4;
  const rightRowBytes = right.width * 4;
  for (let y = 0; y < left.height; y += 1) {
    out.set(
      left.data.subarray(y * leftRowBytes, (y + 1) * leftRowBytes),
      y * rowBytes,
    );
    out.set(
      right.data.subarray(y * rightRowBytes, (y + 1) * rightRowBytes),
      y * rowBytes + leftRowBytes,
    );
  }
  return { data: out, width: totalWidth, height: left.height };
}

// ---------------------------------------------------------------------------
// Renderer seam (injectable; default lazily imports Skia on device).
// ---------------------------------------------------------------------------

/**
 * Renderer interface. `decodeImage`/`renderSplit`/`renderMerge` return an
 * opaque realized drawable (`unknown`) — a Skia `SkImage` on device, a
 * `DualReaderRgbaImage` in the pure test renderer. The overlay (device) casts
 * to `SkImage`; tests cast to `DualReaderRgbaImage`.
 */
export type MobileDualReaderRealized = unknown;

export interface MobileDualReaderRenderer {
  /** Decode encoded bytes to RGBA for dHash/alignment. */
  decodeToRgba(bytes: Uint8Array): Promise<DualReaderRgbaImage>;
  /** Decode encoded bytes to a full-res realized drawable (SkImage on device). */
  decodeImage(bytes: Uint8Array): Promise<MobileDualReaderRealized>;
  /** Composite a split plan (crop left/right half) into a realized drawable. */
  renderSplit(
    image: MobileDualReaderRealized,
    side: "left" | "right",
  ): Promise<MobileDualReaderRealized>;
  /** Composite a merge plan (height-scale + concat) into a realized drawable. */
  renderMerge(
    a: MobileDualReaderRealized,
    b: MobileDualReaderRealized,
    order: "normal" | "swap",
  ): Promise<MobileDualReaderRealized>;
  /** Dimensions used for byte/pixel-aware native image cache accounting. */
  getDimensions(
    image: MobileDualReaderRealized,
  ): Promise<{ width: number; height: number }>;
  /** Release resources backing a realized drawable (optional). */
  release?(image: MobileDualReaderRealized): void;
}

/**
 * Pure-RGBA renderer: uses the exported pure math. Used in tests; on device the
 * Skia renderer replaces it (same math, native pixel ops). `decodeToRgba` throws
 * — the pure renderer cannot truly decode; tests that need decode inject a fake.
 */
export function createPureRgbaRenderer(
  decode?: (bytes: Uint8Array) => Promise<DualReaderRgbaImage>,
): MobileDualReaderRenderer {
  const decodeAndValidate = async (bytes: Uint8Array) => {
    assertMobileDualReaderEncodedByteLength(bytes.byteLength);
    if (!decode) {
      throw new Error(
        `createPureRgbaRenderer.decodeToRgba: no decoder (got ${bytes.length} bytes); inject a fake or use the Skia renderer on device`,
      );
    }
    const rgba = await decode(bytes);
    assertMobileDualReaderDecodedImageBudget(rgba.width, rgba.height);
    assertMobileDualReaderRgbaDataLength(rgba.data, rgba.width, rgba.height);
    return rgba;
  };
  return {
    async decodeToRgba(bytes) {
      const rgba = await decodeAndValidate(bytes);
      const fitted = fitMobileDualReaderHashDimensions(rgba.width, rgba.height);
      return scaleRgbaToDimensions(rgba, fitted.width, fitted.height);
    },
    async decodeImage(bytes: Uint8Array): Promise<MobileDualReaderRealized> {
      // Without a real decoder, treat the bytes as a synthetic RGBA source via
      // the injected decode (tests pass bytes that decode to a gradient).
      if (!decode) throw new Error("createPureRgbaRenderer.decodeImage: no decode hook");
      return decodeAndValidate(bytes);
    },
    async renderSplit(image, side) {
      const rgba = image as DualReaderRgbaImage;
      assertMobileDualReaderDecodedImageBudget(rgba.width, rgba.height);
      const rect = computeSplitCrop({
        width: rgba.width,
        height: rgba.height,
        side,
      });
      assertMobileDualReaderSurfaceBudget(
        rect.cropWidth,
        rect.height,
        "Dual-reader split surface",
      );
      return cropRgba(rgba, {
        sx: rect.sx,
        sy: rect.sy,
        width: rect.cropWidth,
        height: rect.height,
      });
    },
    async renderMerge(a, b, order) {
      const leftIn = (order === "normal" ? a : b) as DualReaderRgbaImage;
      const rightIn = (order === "normal" ? b : a) as DualReaderRgbaImage;
      const layout = fitMobileDualReaderMergeLayout(
        computeMergeLayout({
          left: { width: leftIn.width, height: leftIn.height },
          right: { width: rightIn.width, height: rightIn.height },
        }),
      );
      return concatRgbaHorizontal(
        scaleRgbaToDimensions(
          leftIn,
          layout.leftWidth,
          layout.targetHeight,
        ),
        scaleRgbaToDimensions(
          rightIn,
          layout.rightWidth,
          layout.targetHeight,
        ),
      );
    },
    async getDimensions(image) {
      const rgba = image as DualReaderRgbaImage;
      return { width: rgba.width, height: rgba.height };
    },
  };
}

/** Minimal structural shape of the Skia module we use (device path). */
type SkiaModule = {
  Skia: {
    Color: (color: unknown) => SkColor;
    Paint: () => SkPaint;
    Data: { fromBytes: (bytes: Uint8Array) => SkData };
    Image: {
      MakeImageFromEncoded: (encoded: unknown) => SkImage | null;
    };
    ColorType: { RGBA_8888: ColorType };
    AlphaType: { Unpremul: AlphaType };
    Surface: {
      Make: (width: number, height: number) => {
        getCanvas: () => SkCanvas;
        flush: () => void;
        makeImageSnapshot: () => SkImage;
        dispose?: () => void;
      } | null;
    };
  };
};

/**
 * Lazily create the on-device Skia renderer. Dynamic import (non-literal
 * specifier) so the package is resolved at runtime; the cast carries the
 * structural shape. Verified on-device in T7.4.
 */
async function createSkiaRenderer(): Promise<MobileDualReaderRenderer> {
  const skiaModule: string = "@shopify/react-native-skia";
  const mod = (await import(skiaModule)) as SkiaModule;
  const { Skia } = mod;
  const transparent = Skia.Color("transparent");
  const rgbaInfo = (w: number, h: number): ImageInfo => ({
    width: w,
    height: h,
    colorType: Skia.ColorType.RGBA_8888,
    alphaType: Skia.AlphaType.Unpremul,
  });

  function skRect(x: number, y: number, width: number, height: number): SkRect {
    return { x, y, width, height } as SkRect;
  }

  function decodeEncodedImage(bytes: Uint8Array): SkImage {
    assertMobileDualReaderEncodedByteLength(bytes.byteLength);
    const encoded = Skia.Data.fromBytes(bytes);
    let image: SkImage | null = null;
    try {
      image = Skia.Image.MakeImageFromEncoded(encoded);
    } finally {
      encoded.dispose();
    }
    if (!image) throw new Error("Skia failed to decode image bytes");
    try {
      assertMobileDualReaderDecodedImageBudget(image.width(), image.height());
      return image;
    } catch (error) {
      image.dispose();
      throw error;
    }
  }

  function readBoundedRgba(image: SkImage): DualReaderRgbaImage {
    const sourceWidth = image.width();
    const sourceHeight = image.height();
    assertMobileDualReaderDecodedImageBudget(sourceWidth, sourceHeight);
    const target = fitMobileDualReaderHashDimensions(sourceWidth, sourceHeight);
    let readImage = image;
    let snapshot: SkImage | null = null;
    let surface: ReturnType<typeof Skia.Surface.Make> = null;
    let paint: SkPaint | null = null;

    try {
      if (target.width !== sourceWidth || target.height !== sourceHeight) {
        assertMobileDualReaderSurfaceBudget(
          target.width,
          target.height,
          "Dual-reader hash surface",
        );
        surface = Skia.Surface.Make(target.width, target.height);
        if (!surface) throw new Error("Skia Surface.Make returned null (hash)");
        paint = Skia.Paint();
        const canvas = surface.getCanvas();
        canvas.clear(transparent);
        canvas.drawImageRect(
          image,
          skRect(0, 0, sourceWidth, sourceHeight),
          skRect(0, 0, target.width, target.height),
          paint,
        );
        surface.flush();
        snapshot = surface.makeImageSnapshot();
        readImage = snapshot;
      }

      const pixels = readImage.readPixels(
        0,
        0,
        rgbaInfo(target.width, target.height),
      );
      if (!pixels) throw new Error("Skia readPixels returned null");
      const data =
        pixels instanceof Uint8Array
          ? pixels
          : new Uint8Array(pixels as unknown as ArrayBuffer);
      assertMobileDualReaderRgbaDataLength(data, target.width, target.height);
      return { data, width: target.width, height: target.height };
    } finally {
      snapshot?.dispose();
      paint?.dispose();
      surface?.dispose?.();
    }
  }

  return {
    async decodeToRgba(bytes: Uint8Array): Promise<DualReaderRgbaImage> {
      const image = decodeEncodedImage(bytes);
      try {
        return readBoundedRgba(image);
      } finally {
        image.dispose();
      }
    },

    async decodeImage(bytes: Uint8Array): Promise<MobileDualReaderRealized> {
      return decodeEncodedImage(bytes);
    },

    async renderSplit(image, side) {
      const src = image as SkImage;
      assertMobileDualReaderDecodedImageBudget(src.width(), src.height());
      const rect = computeSplitCrop({
        width: src.width(),
        height: src.height(),
        side,
      });
      assertMobileDualReaderSurfaceBudget(
        rect.cropWidth,
        rect.height,
        "Dual-reader split surface",
      );
      const surface = Skia.Surface.Make(rect.cropWidth, rect.height);
      if (!surface) throw new Error("Skia Surface.Make returned null (split)");
      const canvas = surface.getCanvas();
      const paint = Skia.Paint();
      try {
        canvas.clear(transparent);
        canvas.drawImageRect(
          src,
          skRect(rect.sx, rect.sy, rect.cropWidth, rect.height),
          skRect(0, 0, rect.cropWidth, rect.height),
          paint,
        );
        surface.flush();
        return surface.makeImageSnapshot();
      } finally {
        try {
          paint.dispose();
        } finally {
          surface.dispose?.();
        }
      }
    },

    async renderMerge(a, b, order) {
      const leftSrc = (order === "normal" ? a : b) as SkImage;
      const rightSrc = (order === "normal" ? b : a) as SkImage;
      assertMobileDualReaderDecodedImageBudget(
        leftSrc.width(),
        leftSrc.height(),
        "Dual-reader merge left image",
      );
      assertMobileDualReaderDecodedImageBudget(
        rightSrc.width(),
        rightSrc.height(),
        "Dual-reader merge right image",
      );
      const layout = fitMobileDualReaderMergeLayout(
        computeMergeLayout({
          left: { width: leftSrc.width(), height: leftSrc.height() },
          right: { width: rightSrc.width(), height: rightSrc.height() },
        }),
      );
      assertMobileDualReaderSurfaceBudget(
        layout.totalWidth,
        layout.targetHeight,
        "Dual-reader merge surface",
      );
      const surface = Skia.Surface.Make(layout.totalWidth, layout.targetHeight);
      if (!surface) throw new Error("Skia Surface.Make returned null (merge)");
      const canvas = surface.getCanvas();
      const paint = Skia.Paint();
      try {
        canvas.clear(transparent);
        canvas.drawImageRect(
          leftSrc,
          skRect(0, 0, leftSrc.width(), leftSrc.height()),
          skRect(0, 0, layout.leftWidth, layout.targetHeight),
          paint,
        );
        canvas.drawImageRect(
          rightSrc,
          skRect(0, 0, rightSrc.width(), rightSrc.height()),
          skRect(layout.leftWidth, 0, layout.rightWidth, layout.targetHeight),
          paint,
        );
        surface.flush();
        return surface.makeImageSnapshot();
      } finally {
        try {
          paint.dispose();
        } finally {
          surface.dispose?.();
        }
      }
    },

    async getDimensions(image) {
      const skImage = image as SkImage;
      return { width: skImage.width(), height: skImage.height() };
    },

    release(image) {
      (image as SkImage | undefined)?.dispose?.();
    },
  };
}

/**
 * Create the mobile dual-reader renderer. `renderer` is injectable: tests pass
 * `createPureRgbaRenderer(decode)`; on device it defaults to the lazily-created
 * Skia renderer.
 */
export function createMobileDualReaderRenderer(options?: {
  renderer?: MobileDualReaderRenderer;
}): MobileDualReaderRenderer {
  const injected = options?.renderer ?? null;
  let skiaPromise: Promise<MobileDualReaderRenderer> | null = null;

  function resolve(): MobileDualReaderRenderer | Promise<MobileDualReaderRenderer> {
    if (injected) return injected;
    if (!skiaPromise) skiaPromise = createSkiaRenderer();
    return skiaPromise;
  }

  // Wrap so callers always get a renderer (awaiting the lazy Skia creation on
  // first use). The injected path returns synchronously.
  return {
    decodeToRgba: (bytes) => Promise.resolve(resolve()).then((r) => r.decodeToRgba(bytes)),
    decodeImage: (bytes) => Promise.resolve(resolve()).then((r) => r.decodeImage(bytes)),
    renderSplit: (image, side) =>
      Promise.resolve(resolve()).then((r) => r.renderSplit(image, side)),
    renderMerge: (a, b, order) =>
      Promise.resolve(resolve()).then((r) => r.renderMerge(a, b, order)),
    getDimensions: (image) =>
      Promise.resolve(resolve()).then((r) => r.getDimensions(image)),
    release: (image) => {
      const r = resolve();
      if (r instanceof Promise) {
        void r.then((renderer) => renderer.release?.(image));
      } else {
        r.release?.(image);
      }
    },
  };
}

/**
 * Process-wide singleton renderer (mirrors the store singleton pattern). The
 * per-page overlay + orchestrators all share this instance; on first use it
 * lazily creates the Skia renderer. Tests don't use this — they construct their
 * own `createPureRgbaRenderer`.
 */
let rendererSingleton: MobileDualReaderRenderer | null = null;
export function getMobileDualReaderRenderer(): MobileDualReaderRenderer {
  if (!rendererSingleton) rendererSingleton = createMobileDualReaderRenderer();
  return rendererSingleton;
}
