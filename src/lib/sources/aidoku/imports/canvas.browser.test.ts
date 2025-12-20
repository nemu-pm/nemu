/**
 * Browser-only canvas tests - run with: bun test:browser
 *
 * Requirements:
 * - Playwright with chromium: bunx playwright install chromium
 * - System dependencies: bunx playwright install-deps chromium (requires sudo)
 *
 * These tests require a real browser environment with OffscreenCanvas support.
 * They are skipped in happy-dom (unit test) environment.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { GlobalStore } from "../global-store";
import { createCanvasImports } from "./canvas";

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

describe("canvas imports (browser)", () => {
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

  describe("new_context", () => {
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

    it("should handle negative dimensions", () => {
      const ctxId = canvas.new_context(-10, -20);
      expect(ctxId).toBeGreaterThan(0);

      const resource = store.readStdValue(ctxId) as { type: string; canvas: OffscreenCanvas };
      expect(resource.canvas.width).toBe(1);
      expect(resource.canvas.height).toBe(1);
    });
  });

  describe("set_transform", () => {
    it("should set transform on valid context", () => {
      const ctxId = canvas.new_context(100, 100);
      const result = canvas.set_transform(ctxId, 10, 20, 2, 2, 0);
      expect(result).toBe(0);
    });

    it("should return error for invalid context", () => {
      const result = canvas.set_transform(-1, 10, 20, 2, 2, 0);
      expect(result).toBe(CanvasError.InvalidContext);
    });
  });

  describe("draw_text", () => {
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

    it("should return InvalidString for empty text", () => {
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
  });

  describe("fill", () => {
    it("should return InvalidPath for invalid path descriptor", () => {
      const ctxId = canvas.new_context(100, 100);
      const result = canvas.fill(ctxId, -1, 1, 0, 0, 1);
      expect(result).toBe(CanvasError.InvalidPath);
    });

    it("should fill with Path2D", () => {
      const ctxId = canvas.new_context(100, 100);
      const path = new Path2D();
      path.rect(10, 10, 80, 80);
      const pathId = store.storeStdValue(path);

      const result = canvas.fill(ctxId, pathId, 1, 0, 0, 1);
      expect(result).toBe(0);
    });

    it("should fallback to fillRect when path is not Path2D", () => {
      const ctxId = canvas.new_context(100, 100);
      const pathId = store.storeStdValue({ type: "custom-path" });

      const result = canvas.fill(ctxId, pathId, 0, 1, 0, 1);
      expect(result).toBe(0);
    });
  });

  describe("stroke", () => {
    it("should return InvalidPath for invalid path", () => {
      const ctxId = canvas.new_context(100, 100);
      const styleId = store.storeStdValue({});
      const result = canvas.stroke(ctxId, -1, styleId);
      expect(result).toBe(CanvasError.InvalidPath);
    });

    it("should return InvalidStyle for invalid style", () => {
      const ctxId = canvas.new_context(100, 100);
      const pathId = store.storeStdValue(new Path2D());
      const result = canvas.stroke(ctxId, pathId, -1);
      expect(result).toBe(CanvasError.InvalidStyle);
    });

    it("should stroke path with style", () => {
      const ctxId = canvas.new_context(100, 100);
      const path = new Path2D();
      path.moveTo(10, 10);
      path.lineTo(90, 90);
      const pathId = store.storeStdValue(path);

      const style = {
        color: { red: 0, green: 0, blue: 1, alpha: 1 },
        width: 2,
        cap: "round",
        join: "round",
      };
      const styleId = store.storeStdValue(style);

      const result = canvas.stroke(ctxId, pathId, styleId);
      expect(result).toBe(0);
    });
  });

  describe("get_image", () => {
    it("should return error for invalid context", () => {
      const result = canvas.get_image(-1);
      expect(result).toBe(CanvasError.InvalidContext);
    });

    it("should create image from canvas content", () => {
      const ctxId = canvas.new_context(50, 50);

      // Draw something on the canvas first
      const path = new Path2D();
      path.rect(0, 0, 50, 50);
      const pathId = store.storeStdValue(path);
      canvas.fill(ctxId, pathId, 1, 0, 0, 1);

      const imageId = canvas.get_image(ctxId);
      expect(imageId).toBeGreaterThan(0);

      const resource = store.readStdValue(imageId) as { type: string; width: number; height: number };
      expect(resource.type).toBe("image");
      expect(resource.width).toBe(50);
      expect(resource.height).toBe(50);
    });
  });

  describe("image dimensions", () => {
    it("should return correct dimensions for canvas-generated image", () => {
      const ctxId = canvas.new_context(120, 80);
      const imageId = canvas.get_image(ctxId);

      expect(canvas.get_image_width(imageId)).toBe(120);
      expect(canvas.get_image_height(imageId)).toBe(80);
    });

    it("should return 0 for invalid image", () => {
      expect(canvas.get_image_width(-1)).toBe(0);
      expect(canvas.get_image_height(-1)).toBe(0);
    });
  });

  describe("get_image_data", () => {
    it("should return image data buffer", () => {
      const ctxId = canvas.new_context(10, 10);
      const imageId = canvas.get_image(ctxId);

      const dataId = canvas.get_image_data(imageId);
      expect(dataId).toBeGreaterThan(0);

      const data = store.readStdValue(dataId) as Uint8Array;
      expect(data).toBeInstanceOf(Uint8Array);
      expect(data.length).toBe(10 * 10 * 4); // RGBA
    });
  });

  describe("draw_image", () => {
    it("should return InvalidImage for invalid image", () => {
      const ctxId = canvas.new_context(100, 100);
      const result = canvas.draw_image(ctxId, -1, 0, 0, 100, 100);
      expect(result).toBe(CanvasError.InvalidImage);
    });

    it("should draw canvas-generated image", () => {
      const srcCtxId = canvas.new_context(50, 50);
      const path = new Path2D();
      path.rect(0, 0, 50, 50);
      canvas.fill(srcCtxId, store.storeStdValue(path), 1, 0, 0, 1);
      const srcImageId = canvas.get_image(srcCtxId);

      const dstCtxId = canvas.new_context(100, 100);
      const result = canvas.draw_image(dstCtxId, srcImageId, 25, 25, 50, 50);
      expect(result).toBe(0);
    });
  });

  describe("copy_image", () => {
    it("should return InvalidImage for invalid image", () => {
      const ctxId = canvas.new_context(100, 100);
      const result = canvas.copy_image(ctxId, -1, 0, 0, 50, 50, 0, 0, 50, 50);
      expect(result).toBe(CanvasError.InvalidImage);
    });

    it("should copy portion of image", () => {
      const srcCtxId = canvas.new_context(100, 100);
      const path = new Path2D();
      path.rect(0, 0, 100, 100);
      canvas.fill(srcCtxId, store.storeStdValue(path), 0, 0, 1, 1);
      const srcImageId = canvas.get_image(srcCtxId);

      const dstCtxId = canvas.new_context(200, 200);
      const result = canvas.copy_image(dstCtxId, srcImageId, 25, 25, 50, 50, 75, 75, 50, 50);
      expect(result).toBe(0);
    });
  });

  describe("new_image", () => {
    it("should return error for null data", () => {
      const result = canvas.new_image(0, 0);
      expect(result).toBe(CanvasError.InvalidImagePointer);
    });

    it("should create pending image from PNG data", () => {
      // Minimal 1x1 PNG
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
      expect(resource.data.length).toBe(minimalPng.length);
    });
  });

  describe("integration: image descrambling workflow", () => {
    it("should support typical descrambling pattern", () => {
      const srcWidth = 100;
      const srcHeight = 100;

      // Create source with 4 colored quadrants
      const srcCtxId = canvas.new_context(srcWidth, srcHeight);

      const redPath = new Path2D();
      redPath.rect(0, 0, 50, 50);
      canvas.fill(srcCtxId, store.storeStdValue(redPath), 1, 0, 0, 1);

      const greenPath = new Path2D();
      greenPath.rect(50, 0, 50, 50);
      canvas.fill(srcCtxId, store.storeStdValue(greenPath), 0, 1, 0, 1);

      const bluePath = new Path2D();
      bluePath.rect(0, 50, 50, 50);
      canvas.fill(srcCtxId, store.storeStdValue(bluePath), 0, 0, 1, 1);

      const yellowPath = new Path2D();
      yellowPath.rect(50, 50, 50, 50);
      canvas.fill(srcCtxId, store.storeStdValue(yellowPath), 1, 1, 0, 1);

      const srcImageId = canvas.get_image(srcCtxId);
      expect(srcImageId).toBeGreaterThan(0);

      // Unscramble by swapping quadrants
      const dstCtxId = canvas.new_context(srcWidth, srcHeight);

      expect(canvas.copy_image(dstCtxId, srcImageId, 50, 0, 50, 50, 0, 50, 50, 50)).toBe(0);
      expect(canvas.copy_image(dstCtxId, srcImageId, 0, 50, 50, 50, 50, 0, 50, 50)).toBe(0);
      expect(canvas.copy_image(dstCtxId, srcImageId, 0, 0, 50, 50, 50, 50, 50, 50)).toBe(0);
      expect(canvas.copy_image(dstCtxId, srcImageId, 50, 50, 50, 50, 0, 0, 50, 50)).toBe(0);

      const resultImageId = canvas.get_image(dstCtxId);
      expect(resultImageId).toBeGreaterThan(0);
      expect(canvas.get_image_width(resultImageId)).toBe(srcWidth);
      expect(canvas.get_image_height(resultImageId)).toBe(srcHeight);

      const dataId = canvas.get_image_data(resultImageId);
      expect(dataId).toBeGreaterThan(0);
    });
  });
});

