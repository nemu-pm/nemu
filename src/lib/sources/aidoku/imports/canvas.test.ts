import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { GlobalStore } from "../global-store";
import { createCanvasImports, createHostImage, getHostImageData } from "./canvas";

// Canvas error codes
const CanvasError = {
  InvalidContext: -1,
  InvalidImagePointer: -2,
  InvalidImage: -3,
  InvalidSrcRect: -4,
  InvalidResult: -5,
  InvalidBounds: -6,
  InvalidPath: -7,
  InvalidStyle: -8,
  InvalidString: -9,
  InvalidFont: -10,
  FontLoadFailed: -11,
} as const;

// Check if OffscreenCanvas is available (not in happy-dom)
const hasOffscreenCanvas = typeof OffscreenCanvas !== "undefined";

describe("canvas imports", () => {
  let store: GlobalStore;
  let canvas: ReturnType<typeof createCanvasImports>;

  beforeEach(() => {
    store = new GlobalStore("test-source");
    const memory = new WebAssembly.Memory({ initial: 1 });
    store.setMemory(memory);
    canvas = createCanvasImports(store);
  });

  afterEach(() => {
    store.destroy();
  });

  function writeString(str: string): [number, number] {
    const bytes = new TextEncoder().encode(str);
    store.writeBytes(bytes, 0);
    return [0, bytes.length];
  }

  function writeBytes(data: Uint8Array, offset: number = 0): [number, number] {
    store.writeBytes(data, offset);
    return [offset, data.length];
  }

  // Tests that don't require OffscreenCanvas
  describe("new_font", () => {
    it("should create a font with family name", () => {
      const [ptr, len] = writeString("Arial");
      const fontId = canvas.new_font(ptr, len);
      expect(fontId).toBeGreaterThan(0);

      const resource = store.readStdValue(fontId) as { type: string; family: string };
      expect(resource.type).toBe("font");
      expect(resource.family).toBe("Arial");
    });

    it("should return error for empty family name", () => {
      const fontId = canvas.new_font(0, 0);
      expect(fontId).toBe(CanvasError.InvalidString);
    });
  });

  describe("system_font", () => {
    it("should create system font with weight", () => {
      const fontId = canvas.system_font(3); // Regular weight
      expect(fontId).toBeGreaterThan(0);

      const resource = store.readStdValue(fontId) as { type: string; family: string; weight: number };
      expect(resource.type).toBe("font");
      expect(resource.family).toBe("system-ui");
      expect(resource.weight).toBe(400);
    });

    it("should map different weights correctly", () => {
      // UltraLight = 0 -> 100
      let fontId = canvas.system_font(0);
      let resource = store.readStdValue(fontId) as { weight: number };
      expect(resource.weight).toBe(100);

      // Bold = 6 -> 700
      fontId = canvas.system_font(6);
      resource = store.readStdValue(fontId) as { weight: number };
      expect(resource.weight).toBe(700);

      // Black = 8 -> 900
      fontId = canvas.system_font(8);
      resource = store.readStdValue(fontId) as { weight: number };
      expect(resource.weight).toBe(900);
    });

    it("should default to 400 for unknown weight", () => {
      const fontId = canvas.system_font(99);
      const resource = store.readStdValue(fontId) as { weight: number };
      expect(resource.weight).toBe(400);
    });
  });

  describe("error handling (no OffscreenCanvas needed)", () => {
    it("should return InvalidContext for invalid context in set_transform", () => {
      const result = canvas.set_transform(-1, 10, 20, 2, 2, 0);
      expect(result).toBe(CanvasError.InvalidContext);
    });

    it("should return InvalidContext for non-existent context in set_transform", () => {
      const result = canvas.set_transform(999, 10, 20, 2, 2, 0);
      expect(result).toBe(CanvasError.InvalidContext);
    });

    it("should return InvalidContext for invalid context in draw_text", () => {
      const text = "Hello";
      const textBytes = new TextEncoder().encode(text);
      store.writeBytes(textBytes, 1000);

      const result = canvas.draw_text(-1, 1000, textBytes.length, 16, 10, 50, -1, 0, 0, 0, 1);
      expect(result).toBe(CanvasError.InvalidContext);
    });

    it("should return InvalidContext for get_image with invalid context", () => {
      const result = canvas.get_image(-1);
      expect(result).toBe(CanvasError.InvalidContext);
    });

    it("should return InvalidContext for fill with invalid context", () => {
      const pathId = store.storeStdValue({});
      const result = canvas.fill(-1, pathId, 1, 0, 0, 1);
      expect(result).toBe(CanvasError.InvalidContext);
    });

    it("should return InvalidContext for stroke with invalid context", () => {
      const pathId = store.storeStdValue({});
      const styleId = store.storeStdValue({});
      const result = canvas.stroke(-1, pathId, styleId);
      expect(result).toBe(CanvasError.InvalidContext);
    });

    it("should return InvalidContext for draw_image with invalid context", () => {
      const result = canvas.draw_image(-1, 1, 0, 0, 100, 100);
      expect(result).toBe(CanvasError.InvalidContext);
    });

    it("should return InvalidContext for copy_image with invalid context", () => {
      const result = canvas.copy_image(-1, 1, 0, 0, 50, 50, 0, 0, 50, 50);
      expect(result).toBe(CanvasError.InvalidContext);
    });

    it("should return 0 for get_image_width with invalid image", () => {
      expect(canvas.get_image_width(-1)).toBe(0);
      expect(canvas.get_image_width(999)).toBe(0);
    });

    it("should return 0 for get_image_height with invalid image", () => {
      expect(canvas.get_image_height(-1)).toBe(0);
      expect(canvas.get_image_height(999)).toBe(0);
    });

    it("should return InvalidImage for get_image_data with invalid image", () => {
      const result = canvas.get_image_data(-1);
      expect(result).toBe(CanvasError.InvalidImage);
    });

    it("should return InvalidImagePointer for new_image with null data", () => {
      const result = canvas.new_image(0, 0);
      expect(result).toBe(CanvasError.InvalidImagePointer);
    });

    it("should return InvalidString for load_font with empty URL", () => {
      const result = canvas.load_font(0, 0);
      expect(result).toBe(CanvasError.InvalidString);
    });
  });

  // Tests that require OffscreenCanvas - skip if not available
  describe.skipIf(!hasOffscreenCanvas)("canvas operations (requires OffscreenCanvas)", () => {
    it("should create a canvas context with given dimensions", () => {
      const ctxId = canvas.new_context(100, 200);
      expect(ctxId).toBeGreaterThan(0);

      const resource = store.readStdValue(ctxId) as { type: string; canvas: OffscreenCanvas };
      expect(resource.type).toBe("canvas");
      expect(resource.canvas.width).toBe(100);
      expect(resource.canvas.height).toBe(200);
    });

    it("should handle minimum dimensions", () => {
      const ctxId = canvas.new_context(0, 0);
      expect(ctxId).toBeGreaterThan(0);

      const resource = store.readStdValue(ctxId) as { type: string; canvas: OffscreenCanvas };
      expect(resource.canvas.width).toBe(1);
      expect(resource.canvas.height).toBe(1);
    });

    it("should set transform on valid context", () => {
      const ctxId = canvas.new_context(100, 100);
      const result = canvas.set_transform(ctxId, 10, 20, 2, 2, 0);
      expect(result).toBe(0);
    });

    it("should draw text on canvas", () => {
      const ctxId = canvas.new_context(200, 100);
      const [fontPtr, fontLen] = writeString("sans-serif");
      const fontId = canvas.new_font(fontPtr, fontLen);

      const text = "Hello World";
      const textBytes = new TextEncoder().encode(text);
      store.writeBytes(textBytes, 1000);

      const result = canvas.draw_text(ctxId, 1000, textBytes.length, 16, 10, 50, fontId, 0, 0, 0, 1);
      expect(result).toBe(0);
    });

    it("should return InvalidString for draw_text with empty text", () => {
      const ctxId = canvas.new_context(200, 100);
      const result = canvas.draw_text(ctxId, 0, 0, 16, 10, 50, -1, 0, 0, 0, 1);
      expect(result).toBe(CanvasError.InvalidString);
    });

    it("should use default font when font is invalid", () => {
      const ctxId = canvas.new_context(200, 100);

      const text = "Hello";
      const textBytes = new TextEncoder().encode(text);
      store.writeBytes(textBytes, 1000);

      const result = canvas.draw_text(ctxId, 1000, textBytes.length, 16, 10, 50, -1, 0, 0, 0, 1);
      expect(result).toBe(0);
    });

    it("should return InvalidPath for fill with invalid path", () => {
      const ctxId = canvas.new_context(100, 100);
      const result = canvas.fill(ctxId, -1, 1, 0, 0, 1);
      expect(result).toBe(CanvasError.InvalidPath);
    });

    it("should fill fallback rect when path is not Path2D", () => {
      const ctxId = canvas.new_context(100, 100);
      const pathId = store.storeStdValue({ type: "custom-path" });

      const result = canvas.fill(ctxId, pathId, 0, 1, 0, 1);
      expect(result).toBe(0);
    });

    it("should return InvalidPath for stroke with invalid path", () => {
      const ctxId = canvas.new_context(100, 100);
      const styleId = store.storeStdValue({});
      const result = canvas.stroke(ctxId, -1, styleId);
      expect(result).toBe(CanvasError.InvalidPath);
    });

    it("should return InvalidStyle for stroke with invalid style", () => {
      const ctxId = canvas.new_context(100, 100);
      const pathId = store.storeStdValue({});
      const result = canvas.stroke(ctxId, pathId, -1);
      expect(result).toBe(CanvasError.InvalidStyle);
    });

    it("should create image from canvas content", () => {
      const ctxId = canvas.new_context(50, 50);
      const imageId = canvas.get_image(ctxId);
      expect(imageId).toBeGreaterThan(0);

      const resource = store.readStdValue(imageId) as { type: string; width: number; height: number };
      expect(resource.type).toBe("image");
      expect(resource.width).toBe(50);
      expect(resource.height).toBe(50);
    });

    it("should return correct dimensions for canvas-generated image", () => {
      const ctxId = canvas.new_context(120, 80);
      const imageId = canvas.get_image(ctxId);

      expect(canvas.get_image_width(imageId)).toBe(120);
      expect(canvas.get_image_height(imageId)).toBe(80);
    });

    it("should return image data buffer", () => {
      const ctxId = canvas.new_context(10, 10);
      const imageId = canvas.get_image(ctxId);

      const dataId = canvas.get_image_data(imageId);
      expect(dataId).toBeGreaterThan(0);

      const data = store.readStdValue(dataId) as Uint8Array;
      expect(data).toBeInstanceOf(Uint8Array);
      // 10x10 canvas, 4 bytes per pixel (RGBA)
      expect(data.length).toBe(10 * 10 * 4);
    });

    it("should return InvalidImage for draw_image with invalid image", () => {
      const ctxId = canvas.new_context(100, 100);
      const result = canvas.draw_image(ctxId, -1, 0, 0, 100, 100);
      expect(result).toBe(CanvasError.InvalidImage);
    });

    it("should draw canvas-generated image", () => {
      // Create source canvas
      const srcCtxId = canvas.new_context(50, 50);
      const srcImageId = canvas.get_image(srcCtxId);

      // Create destination canvas
      const dstCtxId = canvas.new_context(100, 100);

      // Draw the source image onto destination
      const result = canvas.draw_image(dstCtxId, srcImageId, 25, 25, 50, 50);
      expect(result).toBe(0);
    });

    it("should return InvalidImage for copy_image with invalid image", () => {
      const ctxId = canvas.new_context(100, 100);
      const result = canvas.copy_image(ctxId, -1, 0, 0, 50, 50, 0, 0, 50, 50);
      expect(result).toBe(CanvasError.InvalidImage);
    });

    it("should copy portion of image", () => {
      // Create source image from canvas
      const srcCtxId = canvas.new_context(100, 100);
      const srcImageId = canvas.get_image(srcCtxId);

      // Create destination canvas
      const dstCtxId = canvas.new_context(200, 200);

      // Copy a 50x50 portion from (25,25) to (75,75) on destination
      const result = canvas.copy_image(dstCtxId, srcImageId, 25, 25, 50, 50, 75, 75, 50, 50);
      expect(result).toBe(0);
    });
  });

  describe.skipIf(!hasOffscreenCanvas)("new_image (requires OffscreenCanvas)", () => {
    it("should create pending image from valid PNG data", () => {
      // Minimal valid 1x1 red PNG
      const minimalPng = new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89,
        0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54,
        0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01,
        0x0d, 0x0a, 0x2d, 0xb4,
        0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44,
        0xae, 0x42, 0x60, 0x82,
      ]);

      const [ptr, len] = writeBytes(minimalPng);
      const imageId = canvas.new_image(ptr, len);

      expect(imageId).toBeGreaterThan(0);

      const resource = store.readStdValue(imageId) as { type: string; data: Uint8Array };
      expect(resource.type).toBe("image");
      expect(resource.data).toBeInstanceOf(Uint8Array);
      expect(resource.data.length).toBe(minimalPng.length);
    });
  });

  describe.skipIf(!hasOffscreenCanvas)("integration: image descrambling workflow", () => {
    it("should support typical descrambling pattern", () => {
      // This tests the workflow used by manga sources for image descrambling:
      // 1. Create source image
      // 2. Create destination canvas
      // 3. Copy parts of source to different positions
      // 4. Get resulting image

      const srcWidth = 100;
      const srcHeight = 100;

      // Step 1: Create a source canvas/image
      const srcCtxId = canvas.new_context(srcWidth, srcHeight);
      expect(srcCtxId).toBeGreaterThan(0);

      // Fill with a solid color (simulating source image content)
      const pathId = store.storeStdValue({ notPath2D: true });
      canvas.fill(srcCtxId, pathId, 0.5, 0.5, 0.5, 1);

      const srcImageId = canvas.get_image(srcCtxId);
      expect(srcImageId).toBeGreaterThan(0);

      // Step 2: Create destination canvas
      const dstCtxId = canvas.new_context(srcWidth, srcHeight);
      expect(dstCtxId).toBeGreaterThan(0);

      // Step 3: Copy quadrants in swapped positions
      // Top-left to bottom-right
      expect(canvas.copy_image(dstCtxId, srcImageId, 0, 0, 50, 50, 50, 50, 50, 50)).toBe(0);
      // Top-right to bottom-left
      expect(canvas.copy_image(dstCtxId, srcImageId, 50, 0, 50, 50, 0, 50, 50, 50)).toBe(0);
      // Bottom-left to top-right
      expect(canvas.copy_image(dstCtxId, srcImageId, 0, 50, 50, 50, 50, 0, 50, 50)).toBe(0);
      // Bottom-right to top-left
      expect(canvas.copy_image(dstCtxId, srcImageId, 50, 50, 50, 50, 0, 0, 50, 50)).toBe(0);

      // Step 4: Get the result
      const resultImageId = canvas.get_image(dstCtxId);
      expect(resultImageId).toBeGreaterThan(0);

      // Verify dimensions
      expect(canvas.get_image_width(resultImageId)).toBe(srcWidth);
      expect(canvas.get_image_height(resultImageId)).toBe(srcHeight);

      // Verify we can get the data
      const dataId = canvas.get_image_data(resultImageId);
      expect(dataId).toBeGreaterThan(0);

      const data = store.readStdValue(dataId) as Uint8Array;
      expect(data.length).toBe(srcWidth * srcHeight * 4);
    });
  });

  describe.skipIf(!hasOffscreenCanvas)("host image helpers (for processPageImage)", () => {
    // Minimal valid 1x1 transparent PNG
    const minimalPng = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89,
      0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54,
      0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01,
      0x0d, 0x0a, 0x2d, 0xb4,
      0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44,
      0xae, 0x42, 0x60, 0x82,
    ]);

    it("createHostImage should create and decode image", async () => {
      const result = await createHostImage(store, minimalPng);
      
      expect(result).not.toBeNull();
      expect(result!.rid).toBeGreaterThan(0);
      expect(result!.width).toBe(1);
      expect(result!.height).toBe(1);
      
      // Verify it's stored properly
      const resource = store.readStdValue(result!.rid) as { type: string; bitmap: ImageBitmap };
      expect(resource.type).toBe("image");
      expect(resource.bitmap).not.toBeNull();
    });

    it("createHostImage should return null for invalid image data", async () => {
      const invalidData = new Uint8Array([0, 1, 2, 3]);
      const result = await createHostImage(store, invalidData);
      
      expect(result).toBeNull();
    });

    it("getHostImageData should return PNG bytes, not raw RGBA (regression)", async () => {
      // This is a regression test for a bug where adapter.ts assumed getHostImageData
      // returned raw RGBA and tried to convert it, causing "ImageData length not multiple of 4*width"
      const result = await createHostImage(store, minimalPng);
      expect(result).not.toBeNull();
      
      const data = getHostImageData(store, result!.rid);
      
      expect(data).not.toBeNull();
      expect(data).toBeInstanceOf(Uint8Array);
      
      // Must be PNG format (starts with PNG signature), NOT raw RGBA
      // PNG header: 0x89 0x50 0x4E 0x47 (137 80 78 71)
      expect(data![0]).toBe(0x89); // PNG signature byte 1
      expect(data![1]).toBe(0x50); // 'P'
      expect(data![2]).toBe(0x4E); // 'N'
      expect(data![3]).toBe(0x47); // 'G'
      
      // PNG is much larger than raw RGBA (4 bytes for 1x1)
      expect(data!.length).toBeGreaterThan(4);
    });

    it("getHostImageData should return null for invalid rid", () => {
      const data = getHostImageData(store, -1);
      expect(data).toBeNull();
      
      const data2 = getHostImageData(store, 99999);
      expect(data2).toBeNull();
    });

    it("getHostImageData should work with canvas-generated images", () => {
      // Create a canvas and get its image
      const ctxId = canvas.new_context(10, 10);
      const imageId = canvas.get_image(ctxId);
      
      const data = getHostImageData(store, imageId);
      
      expect(data).not.toBeNull();
      // B6: getHostImageData returns PNG-encoded bytes, not raw RGBA
      // PNG header: 0x89 0x50 0x4E 0x47 (137 80 78 71)
      expect(data![0]).toBe(0x89);
      expect(data![1]).toBe(0x50);
      expect(data![2]).toBe(0x4E);
      expect(data![3]).toBe(0x47);
    });
  });
});
