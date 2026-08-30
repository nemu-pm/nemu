import type { SecondaryRenderPlan } from "./types";

/**
 * Platform adapter for dual-reader visual alignment rendering.
 *
 * The pure alignment core (dhash, alignment transform, split/merge render
 * plans) lives in `@nemu/core` and is platform-agnostic. Compositing the
 * aligned split/merge result into actual pixels is platform-specific:
 *
 * - **Web** decodes images to RGBA via `OffscreenCanvas`/`createImageBitmap`
 *   and composites onto a `<canvas>` (see
 *   `src/lib/plugins/builtin/dual-reader/components.tsx`).
 * - **Mobile** decodes via Skia (`@shopify/react-native-skia`
 *   `makeImageFromEncoded` + `readPixels`) and composites onto a Skia
 *   `Canvas` (see `apps/mobile/src/lib/mobileDualReaderSkiaAdapter.ts`).
 *
 * `DualReaderRealized` is intentionally platform-opaque: web stores a
 * canvas/drawable, mobile stores a Skia image. The platform renderer owns the
 * type's concrete shape; the core only threads it through.
 *
 * NOTE: the mobile Skia adapter + rendering (T3.3–T3.5) is device-gated work
 * that requires a native build (`@shopify/react-native-skia`) and on-device
 * verification; it is not part of the verifiable foundation port.
 */
export type DualReaderRgbaImage = {
  data: Uint8Array;
  width: number;
  height: number;
};

export type DualReaderRealized = unknown;

export type DualReaderPlatformAdapter = {
  /** Decode an encoded image (bytes) to RGBA pixels for dhash/alignment. */
  decodeToRgba(input: Uint8Array): Promise<DualReaderRgbaImage>;

  /** Composite a split render plan into a platform-opaque realized drawable. */
  realizeSplit(
    plan: Extract<SecondaryRenderPlan, { kind: "split" }>,
    primary: DualReaderRgbaImage,
    secondary: DualReaderRgbaImage
  ): Promise<DualReaderRealized>;

  /** Composite a merge render plan into a platform-opaque realized drawable. */
  realizeMerge(
    plan: Extract<SecondaryRenderPlan, { kind: "merge" }>,
    primary: DualReaderRgbaImage,
    secondary: DualReaderRgbaImage
  ): Promise<DualReaderRealized>;

  /** Release platform resources backing a realized drawable (optional). */
  releaseRealized?(realized: DualReaderRealized): void;
};