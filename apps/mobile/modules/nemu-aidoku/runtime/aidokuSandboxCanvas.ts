import {
  type CanvasModule,
  type GlobalStore,
} from "@nemu.pm/aidoku-runtime";

export const SANDBOX_IMAGE_MAX_COMPRESSED_BYTES = 8 * 1024 * 1024;
export const SANDBOX_IMAGE_MAX_DIMENSION = 8_192;
export const SANDBOX_IMAGE_MAX_PIXELS = 12_000_000;
export const SANDBOX_IMAGE_MAX_CONTEXTS = 16;
export const SANDBOX_IMAGE_MAX_COMMANDS = 512;
export const SANDBOX_IMAGE_MAX_PLAN_BYTES = 128 * 1024;

const PLAN_PREFIX = "NEMU_CANVAS_PLAN_V2\n";

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

type PlanTransform = {
  translateX: number;
  translateY: number;
  scaleX: number;
  scaleY: number;
  rotateAngle: number;
};

type PlanRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SandboxCanvasCommand = {
  op: "copy";
  destinationContextId: number;
  source: { type: "input" } | { type: "context"; id: number };
  sourceRect: PlanRect;
  destinationRect: PlanRect;
  transform: PlanTransform;
};

export type SandboxCanvasPlan = {
  version: 2;
  outputContextId: number;
  contexts: Array<{
    id: number;
    width: number;
    height: number;
  }>;
  commands: SandboxCanvasCommand[];
};

type RawImageResource = {
  type: "sandbox-raw-image";
  bytes: Uint8Array;
  width: number;
  height: number;
};

type PlanImageResource = {
  type: "sandbox-plan-image";
  contextId: number;
  width: number;
  height: number;
};

type ContextResource = {
  type: "sandbox-plan-context";
  id: number;
  width: number;
  height: number;
  transform: PlanTransform;
};

type ImageResource = RawImageResource | PlanImageResource;

const identityTransform = (): PlanTransform => ({
  translateX: 0,
  translateY: 0,
  scaleX: 1,
  scaleY: 1,
  rotateAngle: 0,
});

function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) <= 1_000_000;
}

function validDimensions(width: number, height: number): boolean {
  return (
    Number.isSafeInteger(width) &&
    Number.isSafeInteger(height) &&
    width > 0 &&
    height > 0 &&
    width <= SANDBOX_IMAGE_MAX_DIMENSION &&
    height <= SANDBOX_IMAGE_MAX_DIMENSION &&
    width * height <= SANDBOX_IMAGE_MAX_PIXELS
  );
}

function validInputDimensions(width: number, height: number): boolean {
  // Byte-transform processors (MANGA Plus) receive an encrypted JPEG whose
  // dimensions cannot be decoded until after Wasm transforms the bytes.
  return (width === 0 && height === 0) || validDimensions(width, height);
}

function validRect(rect: PlanRect): boolean {
  return (
    isFiniteNumber(rect.x) &&
    isFiniteNumber(rect.y) &&
    isFiniteNumber(rect.width) &&
    isFiniteNumber(rect.height) &&
    rect.width > 0 &&
    rect.height > 0
  );
}

function ownedBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const output = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  output.set(bytes);
  return output;
}

function isRawImage(value: unknown): value is RawImageResource {
  return (
    !!value &&
    typeof value === "object" &&
    (value as RawImageResource).type === "sandbox-raw-image"
  );
}

function isPlanImage(value: unknown): value is PlanImageResource {
  return (
    !!value &&
    typeof value === "object" &&
    (value as PlanImageResource).type === "sandbox-plan-image"
  );
}

function isContext(value: unknown): value is ContextResource {
  return (
    !!value &&
    typeof value === "object" &&
    (value as ContextResource).type === "sandbox-plan-context"
  );
}

export function createAidokuSandboxCanvasModule({
  inputWidth,
  inputHeight,
}: {
  inputWidth: number;
  inputHeight: number;
}): CanvasModule {
  let nextContextId = 1;
  const contexts = new Map<number, ContextResource>();
  const commands: SandboxCanvasCommand[] = [];

  const readImage = (store: GlobalStore, rid: number): ImageResource | null => {
    const value = store.readStdValue(rid);
    return isRawImage(value) || isPlanImage(value) ? value : null;
  };

  const readContext = (store: GlobalStore, rid: number): ContextResource | null => {
    const value = store.readStdValue(rid);
    return isContext(value) ? value : null;
  };

  const appendCopy = (
    store: GlobalStore,
    contextRid: number,
    imageRid: number,
    sourceRect: PlanRect,
    destinationRect: PlanRect,
  ): number => {
    const context = readContext(store, contextRid);
    if (!context) return CanvasError.InvalidContext;
    const image = readImage(store, imageRid);
    if (!image) return CanvasError.InvalidImage;
    if (!validRect(sourceRect)) return CanvasError.InvalidSrcRect;
    if (!validRect(destinationRect)) return CanvasError.InvalidBounds;
    if (
      sourceRect.x < 0 ||
      sourceRect.y < 0 ||
      sourceRect.x + sourceRect.width > image.width ||
      sourceRect.y + sourceRect.height > image.height
    ) {
      return CanvasError.InvalidSrcRect;
    }
    if (commands.length >= SANDBOX_IMAGE_MAX_COMMANDS) {
      return CanvasError.InvalidResult;
    }
    commands.push({
      op: "copy",
      destinationContextId: context.id,
      source: isRawImage(image)
        ? { type: "input" }
        : { type: "context", id: image.contextId },
      sourceRect,
      destinationRect,
      transform: { ...context.transform },
    });
    return 0;
  };

  return {
    async createHostImage(store, imageData) {
      if (
        !validInputDimensions(inputWidth, inputHeight) ||
        imageData.byteLength === 0 ||
        imageData.byteLength > SANDBOX_IMAGE_MAX_COMPRESSED_BYTES
      ) {
        return null;
      }
      const image: RawImageResource = {
        type: "sandbox-raw-image",
        bytes: ownedBytes(imageData),
        width: inputWidth,
        height: inputHeight,
      };
      return {
        rid: store.storeStdValue(image),
        width: inputWidth,
        height: inputHeight,
      };
    },

    getHostImageData(store, rid) {
      const image = readImage(store, rid);
      if (!image) return null;
      if (isRawImage(image)) return ownedBytes(image.bytes);
      const plan: SandboxCanvasPlan = {
        version: 2,
        outputContextId: image.contextId,
        contexts: [...contexts.values()].map((context) => ({
          id: context.id,
          width: context.width,
          height: context.height,
        })),
        // Canvas draw calls are temporal. Keeping one global command stream
        // preserves cross-context copies even when the destination context was
        // created before its source or the source is modified again later.
        commands,
      };
      const bytes = new TextEncoder().encode(`${PLAN_PREFIX}${JSON.stringify(plan)}`);
      return bytes.byteLength <= SANDBOX_IMAGE_MAX_PLAN_BYTES ? bytes : null;
    },

    createCanvasImports(store) {
      return {
        new_context(width: number, height: number): number {
          if (
            !validDimensions(width, height) ||
            contexts.size >= SANDBOX_IMAGE_MAX_CONTEXTS
          ) {
            return CanvasError.InvalidContext;
          }
          const context: ContextResource = {
            type: "sandbox-plan-context",
            id: nextContextId,
            width,
            height,
            transform: identityTransform(),
          };
          nextContextId += 1;
          contexts.set(context.id, context);
          return store.storeStdValue(context);
        },

        set_transform(
          contextRid: number,
          translateX: number,
          translateY: number,
          scaleX: number,
          scaleY: number,
          rotateAngle: number,
        ): number {
          const context = readContext(store, contextRid);
          if (!context) return CanvasError.InvalidContext;
          if (
            ![
              translateX,
              translateY,
              scaleX,
              scaleY,
              rotateAngle,
            ].every(isFiniteNumber) ||
            Math.abs(scaleX) > 16 ||
            Math.abs(scaleY) > 16 ||
            Math.abs(rotateAngle) > Math.PI * 100
          ) {
            return CanvasError.InvalidBounds;
          }
          context.transform = {
            translateX,
            translateY,
            scaleX,
            scaleY,
            rotateAngle,
          };
          return 0;
        },

        copy_image(
          contextRid: number,
          imageRid: number,
          srcX: number,
          srcY: number,
          srcWidth: number,
          srcHeight: number,
          dstX: number,
          dstY: number,
          dstWidth: number,
          dstHeight: number,
        ): number {
          return appendCopy(
            store,
            contextRid,
            imageRid,
            { x: srcX, y: srcY, width: srcWidth, height: srcHeight },
            { x: dstX, y: dstY, width: dstWidth, height: dstHeight },
          );
        },

        draw_image(
          contextRid: number,
          imageRid: number,
          dstX: number,
          dstY: number,
          dstWidth: number,
          dstHeight: number,
        ): number {
          const image = readImage(store, imageRid);
          if (!image) return CanvasError.InvalidImage;
          return appendCopy(
            store,
            contextRid,
            imageRid,
            { x: 0, y: 0, width: image.width, height: image.height },
            { x: dstX, y: dstY, width: dstWidth, height: dstHeight },
          );
        },

        get_image(contextRid: number): number {
          const context = readContext(store, contextRid);
          if (!context) return CanvasError.InvalidContext;
          const image: PlanImageResource = {
            type: "sandbox-plan-image",
            contextId: context.id,
            width: context.width,
            height: context.height,
          };
          return store.storeStdValue(image);
        },

        new_image(dataPtr: number, dataLength: number): number {
          if (
            dataPtr <= 0 ||
            dataLength <= 0 ||
            dataLength > SANDBOX_IMAGE_MAX_COMPRESSED_BYTES
          ) {
            return CanvasError.InvalidImagePointer;
          }
          const bytes = store.readBytes(dataPtr, dataLength);
          if (!bytes) return CanvasError.InvalidImagePointer;
          const image: RawImageResource = {
            type: "sandbox-raw-image",
            bytes: ownedBytes(bytes),
            // Encoded byte transformers such as MANGA Plus do not query the
            // dimensions of their newly produced image before returning it.
            width: 0,
            height: 0,
          };
          return store.storeStdValue(image);
        },

        get_image_data(imageRid: number): number {
          const image = readImage(store, imageRid);
          if (!image || !isRawImage(image)) return CanvasError.InvalidImage;
          return store.storeStdValue(ownedBytes(image.bytes));
        },

        get_image_width(imageRid: number): number {
          return readImage(store, imageRid)?.width ?? 0;
        },

        get_image_height(imageRid: number): number {
          return readImage(store, imageRid)?.height ?? 0;
        },

        fill: () => CanvasError.InvalidPath,
        stroke: () => CanvasError.InvalidStyle,
        draw_text: () => CanvasError.InvalidFont,
        new_font: () => CanvasError.InvalidFont,
        system_font: () => CanvasError.InvalidFont,
        load_font: () => CanvasError.FontLoadFailed,
      };
    },
  };
}

export function decodeAidokuSandboxCanvasPlan(
  bytes: Uint8Array,
): SandboxCanvasPlan | null {
  if (bytes.byteLength === 0 || bytes.byteLength > SANDBOX_IMAGE_MAX_PLAN_BYTES) {
    return null;
  }
  const prefixBytes = new TextEncoder().encode(PLAN_PREFIX);
  if (
    bytes.byteLength < prefixBytes.byteLength ||
    prefixBytes.some((byte, index) => bytes[index] !== byte)
  ) {
    return null;
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(
    bytes.subarray(prefixBytes.byteLength),
  );
  const plan = JSON.parse(text) as SandboxCanvasPlan;
  if (
    plan?.version !== 2 ||
    !Number.isSafeInteger(plan.outputContextId) ||
    !Array.isArray(plan.contexts) ||
    plan.contexts.length === 0 ||
    plan.contexts.length > SANDBOX_IMAGE_MAX_CONTEXTS ||
    !Array.isArray(plan.commands) ||
    plan.commands.length > SANDBOX_IMAGE_MAX_COMMANDS
  ) {
    throw new Error("The Aidoku canvas plan is invalid.");
  }
  return plan;
}
