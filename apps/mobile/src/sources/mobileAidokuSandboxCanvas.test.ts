import { describe, expect, test } from "bun:test";
import {
  createAidokuSandboxCanvasModule,
  decodeAidokuSandboxCanvasPlan,
  SANDBOX_IMAGE_MAX_COMMANDS,
} from "../../modules/nemu-aidoku/runtime/aidokuSandboxCanvas";

class FakeGlobalStore {
  private nextRid = 1;
  private readonly values = new Map<number, unknown>();
  readonly pointerBytes = new Map<number, Uint8Array>();

  storeStdValue(value: unknown): number {
    const rid = this.nextRid;
    this.nextRid += 1;
    this.values.set(rid, value);
    return rid;
  }

  readStdValue(rid: number): unknown {
    return this.values.get(rid);
  }

  readBytes(pointer: number, length: number): Uint8Array | null {
    const bytes = this.pointerBytes.get(pointer);
    return bytes?.byteLength === length ? bytes : null;
  }
}

type CanvasImports = Record<string, (...args: number[]) => number>;

describe("Android Aidoku bounded sandbox canvas", () => {
  test("supports MANGA Plus-style encoded-byte transforms without pixel IPC", async () => {
    const store = new FakeGlobalStore();
    const canvas = createAidokuSandboxCanvasModule({
      // Encrypted image headers cannot be decoded before the source transforms them.
      inputWidth: 0,
      inputHeight: 0,
    });
    const backing = Uint8Array.of(99, 1, 2, 3, 4, 99);
    const encrypted = backing.subarray(1, 5);
    const host = await canvas.createHostImage(store as never, encrypted);
    expect(host).not.toBeNull();
    backing[1] = 42;

    const imports = canvas.createCanvasImports(store as never) as CanvasImports;
    const inputDataRid = imports.get_image_data(host!.rid);
    expect(store.readStdValue(inputDataRid)).toEqual(Uint8Array.of(1, 2, 3, 4));

    const transformed = Uint8Array.of(9, 8, 7, 6);
    store.pointerBytes.set(10_000, transformed);
    const outputImageRid = imports.new_image(10_000, transformed.byteLength);
    expect(canvas.getHostImageData(store as never, outputImageRid)).toEqual(
      transformed,
    );
  });

  test("emits a small declarative copy plan for native Bitmap rendering", async () => {
    const store = new FakeGlobalStore();
    const canvas = createAidokuSandboxCanvasModule({
      inputWidth: 100,
      inputHeight: 200,
    });
    const host = await canvas.createHostImage(
      store as never,
      Uint8Array.of(0x89, 0x50, 0x4e, 0x47),
    );
    const imports = canvas.createCanvasImports(store as never) as CanvasImports;
    const context = imports.new_context(50, 100);
    expect(imports.copy_image(context, host!.rid, 0, 0, 100, 200, 0, 0, 50, 100)).toBe(0);
    const outputImage = imports.get_image(context);
    const bytes = canvas.getHostImageData(store as never, outputImage);
    const plan = decodeAidokuSandboxCanvasPlan(bytes!);

    expect(plan).toEqual({
      version: 2,
      outputContextId: 1,
      contexts: [
        {
          id: 1,
          width: 50,
          height: 100,
        },
      ],
      commands: [
        {
          op: "copy",
          destinationContextId: 1,
          source: { type: "input" },
          sourceRect: { x: 0, y: 0, width: 100, height: 200 },
          destinationRect: { x: 0, y: 0, width: 50, height: 100 },
          transform: {
            translateX: 0,
            translateY: 0,
            scaleX: 1,
            scaleY: 1,
            rotateAngle: 0,
          },
        },
      ],
    });
  });

  test("preserves chronological cross-context draws instead of creation order", async () => {
    const store = new FakeGlobalStore();
    const canvas = createAidokuSandboxCanvasModule({
      inputWidth: 10,
      inputHeight: 10,
    });
    const host = await canvas.createHostImage(store as never, Uint8Array.of(1));
    const imports = canvas.createCanvasImports(store as never) as CanvasImports;
    // The final destination is deliberately created first. A context-grouped
    // replay would try to read context 2 while rendering context 1 and fail.
    const finalContext = imports.new_context(10, 10);
    const intermediateContext = imports.new_context(10, 10);
    expect(imports.draw_image(intermediateContext, host!.rid, 0, 0, 10, 10)).toBe(0);
    const intermediateImage = imports.get_image(intermediateContext);
    expect(imports.draw_image(finalContext, intermediateImage, 0, 0, 10, 10)).toBe(0);

    const finalImage = imports.get_image(finalContext);
    const plan = decodeAidokuSandboxCanvasPlan(
      canvas.getHostImageData(store as never, finalImage)!,
    );
    expect(plan?.commands.map((command) => command.destinationContextId)).toEqual([
      2, 1,
    ]);
    expect(plan?.commands[1]?.source).toEqual({ type: "context", id: 2 });
  });

  test("fails closed once a source exceeds the command ceiling", async () => {
    const store = new FakeGlobalStore();
    const canvas = createAidokuSandboxCanvasModule({
      inputWidth: 1,
      inputHeight: 1,
    });
    const host = await canvas.createHostImage(store as never, Uint8Array.of(1));
    const imports = canvas.createCanvasImports(store as never) as CanvasImports;
    const context = imports.new_context(1, 1);

    for (let index = 0; index < SANDBOX_IMAGE_MAX_COMMANDS; index += 1) {
      expect(imports.draw_image(context, host!.rid, 0, 0, 1, 1)).toBe(0);
    }
    expect(imports.draw_image(context, host!.rid, 0, 0, 1, 1)).toBeLessThan(0);
  });
});
