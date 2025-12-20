// Canvas namespace - for bitmap operations
// Used by sources for image manipulation/descrambling
import { GlobalStore } from "../global-store";

// Canvas error codes matching Rust CanvasError
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

// Internal types for stored canvas resources
interface CanvasContext {
  type: "canvas";
  canvas: OffscreenCanvas;
  ctx: OffscreenCanvasRenderingContext2D;
}

interface ImageResource {
  type: "image";
  bitmap: ImageBitmap | null; // null if not yet decoded
  data: Uint8Array; // Original encoded data
  width: number;
  height: number;
}

interface FontResource {
  type: "font";
  family: string;
  weight?: number;
}

// Check if value is a canvas resource
function isCanvasContext(r: unknown): r is CanvasContext {
  return r !== null && typeof r === "object" && (r as CanvasContext).type === "canvas";
}

function isImageResource(r: unknown): r is ImageResource {
  return r !== null && typeof r === "object" && (r as ImageResource).type === "image";
}


function isFontResource(r: unknown): r is FontResource {
  return r !== null && typeof r === "object" && (r as FontResource).type === "font";
}

// Pending image decode operations (rid -> Promise<ImageBitmap>)
const pendingDecodes = new Map<number, Promise<ImageBitmap>>();

/**
 * Create an image resource directly from the host side (for processPageImage).
 * Returns the image rid and a promise that resolves when decoding completes.
 */
export async function createHostImage(store: GlobalStore, imageData: Uint8Array): Promise<{ rid: number; width: number; height: number } | null> {
  try {
    const dataCopy = new Uint8Array(imageData);
    
    // Decode the image first
    const blob = new Blob([dataCopy.buffer]);
    const bitmap = await createImageBitmap(blob);
    
    // Store the fully decoded image resource
    const resource: ImageResource = {
      type: "image",
      bitmap,
      data: dataCopy,
      width: bitmap.width,
      height: bitmap.height,
    };
    const rid = store.storeStdValue(resource);
    
    return { rid, width: bitmap.width, height: bitmap.height };
  } catch (e) {
    console.error("[Canvas] createHostImage error:", e);
    return null;
  }
}

/**
 * Get image data from an image resource by rid.
 */
export function getHostImageData(store: GlobalStore, rid: number): Uint8Array | null {
  const resource = store.readStdValue(rid);
  if (!isImageResource(resource)) return null;
  
  // If bitmap exists, we need to get the PNG/JPEG data
  // The stored `data` is the original encoded data, which may not reflect canvas operations
  // For processed images, we need to render the bitmap back to bytes
  if (resource.bitmap) {
    try {
      // Create a canvas and draw the bitmap
      const canvas = new OffscreenCanvas(resource.bitmap.width, resource.bitmap.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) return resource.data;
      
      ctx.drawImage(resource.bitmap, 0, 0);
      
      // Get as PNG blob synchronously isn't possible, so return raw RGBA
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      return new Uint8Array(imageData.data);
    } catch {
      return resource.data;
    }
  }
  
  return resource.data;
}

export function createCanvasImports(store: GlobalStore) {
  // Helper to get canvas context from descriptor
  const getCanvas = (rid: number): CanvasContext | null => {
    const resource = store.readStdValue(rid);
    return isCanvasContext(resource) ? resource : null;
  };

  // Helper to get image from descriptor
  const getImage = (rid: number): ImageResource | null => {
    const resource = store.readStdValue(rid);
    return isImageResource(resource) ? resource : null;
  };

  // Helper to get font from descriptor
  const getFont = (rid: number): FontResource | null => {
    const resource = store.readStdValue(rid);
    return isFontResource(resource) ? resource : null;
  };

  // Start decoding an image and store the promise
  const startImageDecode = (rid: number, data: Uint8Array): void => {
    const blob = new Blob([data.buffer as ArrayBuffer]);
    const promise = createImageBitmap(blob).then((bitmap) => {
      // Update the stored image resource with the decoded bitmap
      const image = getImage(rid);
      if (image) {
        image.bitmap = bitmap;
        image.width = bitmap.width;
        image.height = bitmap.height;
      }
      pendingDecodes.delete(rid);
      return bitmap;
    });
    pendingDecodes.set(rid, promise);
  };

  return {
    // Create a new canvas context with given dimensions
    // fn new_context(width: f32, height: f32) -> Rid
    new_context: (width: number, height: number): number => {
      try {
        const canvas = new OffscreenCanvas(Math.max(1, width), Math.max(1, height));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          return CanvasError.InvalidContext;
        }
        const resource: CanvasContext = { type: "canvas", canvas, ctx };
        return store.storeStdValue(resource);
      } catch {
        return CanvasError.InvalidContext;
      }
    },

    // Set transform matrix (translate_x, translate_y, scale_x, scale_y, rotate_angle)
    // fn set_transform(context: Rid, translate_x: f32, translate_y: f32, scale_x: f32, scale_y: f32, rotate_angle: f32) -> FFIResult
    set_transform: (
      ctxId: number,
      translateX: number,
      translateY: number,
      scaleX: number,
      scaleY: number,
      rotateAngle: number
    ): number => {
      const canvas = getCanvas(ctxId);
      if (!canvas) return CanvasError.InvalidContext;

      try {
        const { ctx } = canvas;
        ctx.resetTransform();
        ctx.translate(translateX, translateY);
        ctx.rotate(rotateAngle);
        ctx.scale(scaleX, scaleY);
        return 0; // Success
      } catch {
        return CanvasError.InvalidContext;
      }
    },

    // Copy image from source rect to dest rect
    // fn copy_image(context: Rid, image: Rid, src_x, src_y, src_width, src_height, dst_x, dst_y, dst_width, dst_height) -> FFIResult
    copy_image: (
      ctxId: number,
      imageId: number,
      srcX: number,
      srcY: number,
      srcWidth: number,
      srcHeight: number,
      dstX: number,
      dstY: number,
      dstWidth: number,
      dstHeight: number
    ): number => {
      const canvas = getCanvas(ctxId);
      if (!canvas) return CanvasError.InvalidContext;

      const image = getImage(imageId);
      if (!image) return CanvasError.InvalidImage;
      if (!image.bitmap) return CanvasError.InvalidImage;

      try {
        canvas.ctx.drawImage(
          image.bitmap,
          srcX,
          srcY,
          srcWidth,
          srcHeight,
          dstX,
          dstY,
          dstWidth,
          dstHeight
        );
        return 0;
      } catch {
        return CanvasError.InvalidSrcRect;
      }
    },

    // Draw image to dest rect (simpler version without source rect)
    // fn draw_image(context: Rid, image: Rid, dst_x, dst_y, dst_width, dst_height) -> FFIResult
    draw_image: (
      ctxId: number,
      imageId: number,
      dstX: number,
      dstY: number,
      dstWidth: number,
      dstHeight: number
    ): number => {
      const canvas = getCanvas(ctxId);
      if (!canvas) return CanvasError.InvalidContext;

      const image = getImage(imageId);
      if (!image) return CanvasError.InvalidImage;
      if (!image.bitmap) return CanvasError.InvalidImage;

      try {
        canvas.ctx.drawImage(image.bitmap, dstX, dstY, dstWidth, dstHeight);
        return 0;
      } catch {
        return CanvasError.InvalidBounds;
      }
    },

    // Fill path with color (path is a msgpack-encoded Path struct)
    // fn fill(context: Rid, path: Ptr, r: f32, g: f32, b: f32, a: f32) -> FFIResult
    fill: (
      ctxId: number,
      pathPtr: number,
      r: number,
      g: number,
      b: number,
      a: number
    ): number => {
      const canvas = getCanvas(ctxId);
      if (!canvas) return CanvasError.InvalidContext;
      if (pathPtr < 0) return CanvasError.InvalidPath;

      try {
        // Path is encoded, read it from the descriptor
        const pathData = store.readStdValue(pathPtr);
        if (!pathData) return CanvasError.InvalidPath;

        const { ctx } = canvas;
        // Colors are 0-1 floats in Rust, convert to CSS
        const color = `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
        ctx.fillStyle = color;

        // Apply path if it's a Path2D or path commands
        if (pathData instanceof Path2D) {
          ctx.fill(pathData);
        } else {
          // Fallback: fill a rect covering the canvas
          ctx.fillRect(0, 0, canvas.canvas.width, canvas.canvas.height);
        }
        return 0;
      } catch {
        return CanvasError.InvalidPath;
      }
    },

    // Stroke path with style
    // fn stroke(context: Rid, path: Ptr, style: Ptr) -> FFIResult
    stroke: (ctxId: number, pathPtr: number, stylePtr: number): number => {
      const canvas = getCanvas(ctxId);
      if (!canvas) return CanvasError.InvalidContext;
      if (pathPtr < 0) return CanvasError.InvalidPath;
      if (stylePtr < 0) return CanvasError.InvalidStyle;

      try {
        const pathData = store.readStdValue(pathPtr);
        const styleData = store.readStdValue(stylePtr) as {
          color?: { red: number; green: number; blue: number; alpha: number };
          width?: number;
          cap?: string;
          join?: string;
        } | null;

        if (!pathData) return CanvasError.InvalidPath;

        const { ctx } = canvas;

        // Apply style
        if (styleData) {
          if (styleData.color) {
            const { red, green, blue, alpha } = styleData.color;
            ctx.strokeStyle = `rgba(${Math.round(red * 255)}, ${Math.round(green * 255)}, ${Math.round(blue * 255)}, ${alpha})`;
          }
          if (styleData.width) ctx.lineWidth = styleData.width;
          if (styleData.cap) ctx.lineCap = styleData.cap as CanvasLineCap;
          if (styleData.join) ctx.lineJoin = styleData.join as CanvasLineJoin;
        }

        if (pathData instanceof Path2D) {
          ctx.stroke(pathData);
        }
        return 0;
      } catch {
        return CanvasError.InvalidStyle;
      }
    },

    // Draw text onto canvas
    // fn draw_text(context: Rid, text: *const u8, text_len: usize, size: f32, x: f32, y: f32, font: Rid, r: f32, g: f32, b: f32, a: f32) -> FFIResult
    draw_text: (
      ctxId: number,
      textPtr: number,
      textLen: number,
      fontSize: number,
      x: number,
      y: number,
      fontId: number,
      r: number,
      g: number,
      b: number,
      a: number
    ): number => {
      const canvas = getCanvas(ctxId);
      if (!canvas) return CanvasError.InvalidContext;

      const text = store.readString(textPtr, textLen);
      if (!text) return CanvasError.InvalidString;

      const font = getFont(fontId);
      // Allow drawing without font (use default)
      const fontFamily = font?.family ?? "sans-serif";

      try {
        const { ctx } = canvas;
        ctx.font = `${fontSize}px "${fontFamily}"`;
        ctx.fillStyle = `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
        ctx.fillText(text, x, y);
        return 0;
      } catch {
        return CanvasError.InvalidFont;
      }
    },

    // Get image from canvas (renders canvas to image)
    // fn get_image(context: Rid) -> Rid
    get_image: (ctxId: number): number => {
      const canvas = getCanvas(ctxId);
      if (!canvas) return CanvasError.InvalidContext;

      try {
        // Transfer canvas content to ImageBitmap
        const bitmap = canvas.canvas.transferToImageBitmap();

        // Get raw image data for storage
        const tempCanvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const tempCtx = tempCanvas.getContext("2d");
        if (!tempCtx) return CanvasError.InvalidResult;
        tempCtx.drawImage(bitmap, 0, 0);
        const imageData = tempCtx.getImageData(0, 0, bitmap.width, bitmap.height);

        const resource: ImageResource = {
          type: "image",
          bitmap,
          data: new Uint8Array(imageData.data),
          width: bitmap.width,
          height: bitmap.height,
        };
        return store.storeStdValue(resource);
      } catch {
        return CanvasError.InvalidResult;
      }
    },

    // Create font by family name
    // fn new_font(name_ptr: *const u8, name_len: usize) -> FFIResult
    new_font: (familyPtr: number, familyLen: number): number => {
      const family = store.readString(familyPtr, familyLen);
      if (!family) return CanvasError.InvalidString;

      const resource: FontResource = { type: "font", family };
      return store.storeStdValue(resource);
    },

    // Get system font with weight
    // fn system_font(weight: u8) -> Rid
    system_font: (weight: number): number => {
      // Map weight enum to CSS font weight
      // FontWeight enum: 100-900 in steps
      const weightMap: Record<number, number> = {
        0: 100, // UltraLight
        1: 200, // Thin
        2: 300, // Light
        3: 400, // Regular
        4: 500, // Medium
        5: 600, // Semibold
        6: 700, // Bold
        7: 800, // Heavy
        8: 900, // Black
      };
      const cssWeight = weightMap[weight] ?? 400;
      const resource: FontResource = { type: "font", family: `system-ui` };
      // Store weight info for later use
      return store.storeStdValue({ ...resource, weight: cssWeight });
    },

    // Load font from URL (async - stores a promise)
    // fn load_font(url_ptr: *const u8, url_len: usize) -> FFIResult
    load_font: (urlPtr: number, urlLen: number): number => {
      const url = store.readString(urlPtr, urlLen);
      if (!url) return CanvasError.InvalidString;

      try {
        // Generate unique font family name
        const fontFamily = `loaded-font-${Date.now()}`;

        // Load font using FontFace API
        const fontFace = new FontFace(fontFamily, `url(${url})`);
        fontFace
          .load()
          .then((loaded) => {
            document.fonts.add(loaded);
          })
          .catch(() => {
            console.warn(`[Canvas] Failed to load font from ${url}`);
          });

        const resource: FontResource = { type: "font", family: fontFamily };
        return store.storeStdValue(resource);
      } catch {
        return CanvasError.FontLoadFailed;
      }
    },

    // Create image from data bytes
    // fn new_image(data_ptr: *const u8, data_len: usize) -> FFIResult
    new_image: (dataPtr: number, dataLen: number): number => {
      const data = store.readBytes(dataPtr, dataLen);
      if (!data) return CanvasError.InvalidImagePointer;

      try {
        // Create a copy of the data
        const dataCopy = new Uint8Array(data);

        // Store image resource (bitmap will be decoded async)
        const resource: ImageResource = {
          type: "image",
          bitmap: null,
          data: dataCopy,
          width: 0,
          height: 0,
        };
        const rid = store.storeStdValue(resource);

        // Start async decode
        startImageDecode(rid, dataCopy);

        return rid;
      } catch {
        return CanvasError.InvalidImage;
      }
    },

    // Get image data as buffer descriptor
    // fn get_image_data(image_rid: Rid) -> FFIResult
    get_image_data: (imageId: number): number => {
      const image = getImage(imageId);
      if (!image) return CanvasError.InvalidImage;

      try {
        // Return the stored data
        return store.storeStdValue(image.data);
      } catch {
        return CanvasError.InvalidResult;
      }
    },

    // Get image width
    // fn get_image_width(image_rid: Rid) -> f32
    get_image_width: (imageId: number): number => {
      const image = getImage(imageId);
      if (!image) return 0;
      return image.width;
    },

    // Get image height
    // fn get_image_height(image_rid: Rid) -> f32
    get_image_height: (imageId: number): number => {
      const image = getImage(imageId);
      if (!image) return 0;
      return image.height;
    },
  };
}
