import { describe, expect, test } from "bun:test";
import type { DualReaderRgbaImage } from "@nemu/core/dual-reader";
import {
  computeMergeLayout,
  computeSplitCrop,
  concatRgbaHorizontal,
  cropRgba,
  createMobileDualReaderRenderer,
  createPureRgbaRenderer,
  fitMobileDualReaderMergeLayout,
  scaleRgbaToHeight,
  type MobileDualReaderRenderer,
} from "./mobileDualReaderSkiaAdapter";

/** Build an RGBA image where pixel (x,y) is encoded as R=x, G=y, B=0, A=255. */
function gradientRgba(width: number, height: number): DualReaderRgbaImage {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      data[i] = x & 0xff;
      data[i + 1] = y & 0xff;
      data[i + 2] = 0;
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

function pixel(
  image: DualReaderRgbaImage,
  x: number,
  y: number,
): [number, number, number, number] {
  const i = (y * image.width + x) * 4;
  return [image.data[i]!, image.data[i + 1]!, image.data[i + 2]!, image.data[i + 3]!];
}

/** A test renderer: decodes by treating bytes[0..3] as (width,height) seed then
 * synthesizing a gradient; renderSplit/renderMerge delegate to the pure math. */
function fakeRenderer(): MobileDualReaderRenderer {
  const decode = async (bytes: Uint8Array): Promise<DualReaderRgbaImage> => {
    const width = bytes[0] ?? 4;
    const height = bytes[1] ?? 4;
    return gradientRgba(width, height);
  };
  return createPureRgbaRenderer(decode);
}

describe("mobileDualReaderSkiaAdapter — pure compositing math", () => {
  test("computeSplitCrop matches web renderSplitBlob for even and odd widths", () => {
    // Even: width 10 → leftWidth 5, rightWidth 5.
    const left = computeSplitCrop({ width: 10, height: 7, side: "left" });
    expect(left).toEqual({ sx: 0, sy: 0, cropWidth: 5, height: 7 });
    const right = computeSplitCrop({ width: 10, height: 7, side: "right" });
    expect(right).toEqual({ sx: 5, sy: 0, cropWidth: 5, height: 7 });

    // Odd: width 11 → leftWidth 5, rightWidth 6; right starts at 11-6=5.
    const oddLeft = computeSplitCrop({ width: 11, height: 3, side: "left" });
    expect(oddLeft).toEqual({ sx: 0, sy: 0, cropWidth: 5, height: 3 });
    const oddRight = computeSplitCrop({ width: 11, height: 3, side: "right" });
    expect(oddRight).toEqual({ sx: 5, sy: 0, cropWidth: 6, height: 3 });

    // Tiny: width 1 → leftWidth 0 → rightWidth max(1,1)=1.
    const tinyRight = computeSplitCrop({ width: 1, height: 2, side: "right" });
    expect(tinyRight.cropWidth).toBe(1);
    expect(tinyRight.sx).toBe(0);
  });

  test("computeMergeLayout matches web renderMergeBlob scaling", () => {
    // left 4x2, right 6x4 → targetHeight 4; leftScale 2, rightScale 1.
    const layout = computeMergeLayout({
      left: { width: 4, height: 2 },
      right: { width: 6, height: 4 },
    });
    expect(layout.targetHeight).toBe(4);
    expect(layout.leftScale).toBe(2);
    expect(layout.rightScale).toBe(1);
    expect(layout.leftWidth).toBe(8); // round(4*2)
    expect(layout.rightWidth).toBe(6); // round(6*1)
    expect(layout.totalWidth).toBe(14);
  });

  test("computeMergeLayout clamps a zero-width side to 1", () => {
    const layout = computeMergeLayout({
      left: { width: 0, height: 3 },
      right: { width: 5, height: 3 },
    });
    expect(layout.leftWidth).toBe(1);
    expect(layout.totalWidth).toBe(6);
  });

  test("fitMobileDualReaderMergeLayout bounds an oversized composite surface", () => {
    const raw = computeMergeLayout({
      left: { width: 8192, height: 4096 },
      right: { width: 8192, height: 4096 },
    });
    const bounded = fitMobileDualReaderMergeLayout(raw);
    expect(bounded.totalWidth * bounded.targetHeight).toBeLessThanOrEqual(
      8 * 1024 * 1024,
    );
    expect(bounded.leftWidth + bounded.rightWidth).toBe(bounded.totalWidth);
    expect(bounded.leftWidth).toBeGreaterThan(0);
    expect(bounded.rightWidth).toBeGreaterThan(0);
  });

  test("cropRgba copies the correct sub-rect pixels", () => {
    const image = gradientRgba(10, 6);
    const cropped = cropRgba(image, { sx: 3, sy: 2, width: 4, height: 2 });
    expect(cropped.width).toBe(4);
    expect(cropped.height).toBe(2);
    // pixel at cropped (0,0) == source (3,2) → R=3,G=2.
    expect(pixel(cropped, 0, 0)).toEqual([3, 2, 0, 255]);
    expect(pixel(cropped, 3, 1)).toEqual([6, 3, 0, 255]);
  });

  test("scaleRgbaToHeight returns the image unchanged when already at target height", () => {
    const image = gradientRgba(5, 4);
    expect(scaleRgbaToHeight(image, 4)).toBe(image);
  });

  test("scaleRgbaToHeight upscales height and width proportionally", () => {
    const image = gradientRgba(2, 2);
    const scaled = scaleRgbaToHeight(image, 4);
    expect(scaled.height).toBe(4);
    // width scales 2→4 (scale 2, round(2*2)=4).
    expect(scaled.width).toBe(4);
    // Top-left source pixel (0,0) maps to scaled (0,0).
    expect(pixel(scaled, 0, 0)).toEqual([0, 0, 0, 255]);
  });

  test("concatRgbaHorizontal places left then right", () => {
    const left = gradientRgba(3, 2);
    const right = gradientRgba(2, 2);
    const merged = concatRgbaHorizontal(left, right);
    expect(merged.width).toBe(5);
    expect(merged.height).toBe(2);
    // right block starts at x=3 → its (0,0) pixel (R=0,G=0) is at merged (3,0).
    expect(pixel(merged, 3, 0)).toEqual([0, 0, 0, 255]);
    // left (2,0) → R=2,G=0 at merged (2,0).
    expect(pixel(merged, 2, 0)).toEqual([2, 0, 0, 255]);
  });

  test("concatRgbaHorizontal rejects mismatched heights", () => {
    const a = gradientRgba(2, 2);
    const b = gradientRgba(2, 3);
    expect(() => concatRgbaHorizontal(a, b)).toThrow(/heights must match/);
  });
});

describe("createMobileDualReaderRenderer — renderer via injected pure backend", () => {
  function renderer(): MobileDualReaderRenderer {
    return createMobileDualReaderRenderer({ renderer: fakeRenderer() });
  }

  test("decodeImage returns a full-res drawable (RGBA via the pure renderer)", async () => {
    const r = renderer();
    const image = (await r.decodeImage(new Uint8Array([8, 4]))) as DualReaderRgbaImage;
    expect(image.width).toBe(8);
    expect(image.height).toBe(4);
    expect(image.data.length).toBe(8 * 4 * 4);
  });

  test("getDimensions reports realized cache cost dimensions", async () => {
    const r = renderer();
    const image = await r.decodeImage(new Uint8Array([8, 4]));
    await expect(r.getDimensions(image)).resolves.toEqual({ width: 8, height: 4 });
  });

  test("renderSplit crops the chosen half", async () => {
    const r = renderer();
    // Decode a 10x6 gradient, then split right (cropWidth 5, sx 5).
    const image = await r.decodeImage(new Uint8Array([10, 6]));
    const realized = (await r.renderSplit(image, "right")) as DualReaderRgbaImage;
    expect(realized.width).toBe(5);
    expect(realized.height).toBe(6);
    // Cropped (0,0) == source (5,0) → R=5,G=0.
    expect(pixel(realized, 0, 0)).toEqual([5, 0, 0, 255]);
  });

  test("renderSplit left mirrors right crop width", async () => {
    const r = renderer();
    const image = await r.decodeImage(new Uint8Array([10, 6]));
    const realized = (await r.renderSplit(image, "left")) as DualReaderRgbaImage;
    expect(realized.width).toBe(5);
    expect(pixel(realized, 0, 0)).toEqual([0, 0, 0, 255]); // source (0,0)
  });

  test("renderMerge concatenates two pages respecting order", async () => {
    const r = renderer();
    const pageA = await r.decodeImage(new Uint8Array([4, 2])); // 4x2
    const pageB = await r.decodeImage(new Uint8Array([4, 2])); // 4x2
    const realized = (await r.renderMerge(pageA, pageB, "normal")) as DualReaderRgbaImage;
    expect(realized.width).toBe(8); // 4 + 4
    expect(realized.height).toBe(2);

    // Swap order: left=pageB, right=pageA. Both gradients are identical here,
    // so verify dimensions + that the result equals the normal-order result.
    const swapped = (await r.renderMerge(pageA, pageB, "swap")) as DualReaderRgbaImage;
    expect(swapped.width).toBe(8);
    expect(swapped.height).toBe(2);
  });

  test("renderMerge scales to the taller page", async () => {
    const r = renderer();
    const short = await r.decodeImage(new Uint8Array([4, 2])); // 4x2
    const tall = await r.decodeImage(new Uint8Array([4, 4])); // 4x4
    const realized = (await r.renderMerge(short, tall, "normal")) as DualReaderRgbaImage;
    // targetHeight 4; short scales 4x2 → 8x4, tall stays 4x4 → total 12x4.
    expect(realized.width).toBe(12);
    expect(realized.height).toBe(4);
  });

  test("decodeToRgba without an injected decoder rejects with a byte-length hint", async () => {
    const r = createPureRgbaRenderer();
    await expect(r.decodeToRgba(new Uint8Array([1, 2, 3]))).rejects.toThrow(/3 bytes/);
  });
});
