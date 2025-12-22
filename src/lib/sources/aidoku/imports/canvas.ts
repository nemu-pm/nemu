// Canvas namespace - for bitmap operations
// Used by sources for image manipulation/descrambling
import { GlobalStore } from "../global-store";
import { decodeF32, decodeVarint, decodeVec } from "../postcard";

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

// ============================================================================
// Postcard decoders for Path and StrokeStyle (B5)
// ============================================================================

interface Point {
  x: number;
  y: number;
}

function decodePoint(bytes: Uint8Array, offset: number): [Point, number] {
  let pos = offset;
  let x: number, y: number;
  [x, pos] = decodeF32(bytes, pos);
  [y, pos] = decodeF32(bytes, pos);
  return [{ x, y }, pos];
}

// PathOp enum variants:
// 0 = MoveTo(Point)
// 1 = LineTo(Point)
// 2 = QuadTo(Point, Point)
// 3 = CubicTo(Point, Point, Point)
// 4 = Arc(Point, f32, f32, f32)
// 5 = Close
type PathOp =
  | { type: "moveTo"; point: Point }
  | { type: "lineTo"; point: Point }
  | { type: "quadTo"; to: Point; control: Point }
  | { type: "cubicTo"; to: Point; c1: Point; c2: Point }
  | { type: "arc"; center: Point; radius: number; startAngle: number; sweepAngle: number }
  | { type: "close" };

function decodePathOp(bytes: Uint8Array, offset: number): [PathOp, number] {
  let pos = offset;
  const [variant, variantEnd] = decodeVarint(bytes, pos);
  pos = variantEnd;

  switch (variant) {
    case 0: { // MoveTo
      const [point, pointEnd] = decodePoint(bytes, pos);
      return [{ type: "moveTo", point }, pointEnd];
    }
    case 1: { // LineTo
      const [point, pointEnd] = decodePoint(bytes, pos);
      return [{ type: "lineTo", point }, pointEnd];
    }
    case 2: { // QuadTo(to, control)
      const [to, toEnd] = decodePoint(bytes, pos);
      const [control, controlEnd] = decodePoint(bytes, toEnd);
      return [{ type: "quadTo", to, control }, controlEnd];
    }
    case 3: { // CubicTo(to, c1, c2)
      const [to, toEnd] = decodePoint(bytes, pos);
      const [c1, c1End] = decodePoint(bytes, toEnd);
      const [c2, c2End] = decodePoint(bytes, c1End);
      return [{ type: "cubicTo", to, c1, c2 }, c2End];
    }
    case 4: { // Arc(center, radius, start, sweep)
      const [center, centerEnd] = decodePoint(bytes, pos);
      let radius: number, startAngle: number, sweepAngle: number;
      [radius, pos] = decodeF32(bytes, centerEnd);
      [startAngle, pos] = decodeF32(bytes, pos);
      [sweepAngle, pos] = decodeF32(bytes, pos);
      return [{ type: "arc", center, radius, startAngle, sweepAngle }, pos];
    }
    case 5: // Close
      return [{ type: "close" }, pos];
    default:
      throw new Error(`Unknown PathOp variant: ${variant}`);
  }
}

interface DecodedPath {
  ops: PathOp[];
}

function decodePath(bytes: Uint8Array, offset: number): [DecodedPath, number] {
  // Path struct: { ops: Vec<PathOp> }
  const [ops, opsEnd] = decodeVec(bytes, offset, decodePathOp);
  return [{ ops }, opsEnd];
}

interface Color {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

function decodeColor(bytes: Uint8Array, offset: number): [Color, number] {
  let pos = offset;
  let red: number, green: number, blue: number, alpha: number;
  [red, pos] = decodeF32(bytes, pos);
  [green, pos] = decodeF32(bytes, pos);
  [blue, pos] = decodeF32(bytes, pos);
  [alpha, pos] = decodeF32(bytes, pos);
  return [{ red, green, blue, alpha }, pos];
}

// LineCap enum: Round=0, Square=1, Butt=2
type LineCap = "round" | "square" | "butt";
function decodeLineCap(bytes: Uint8Array, offset: number): [LineCap, number] {
  const [variant, variantEnd] = decodeVarint(bytes, offset);
  const caps: LineCap[] = ["round", "square", "butt"];
  return [caps[variant] || "butt", variantEnd];
}

// LineJoin enum: Round=0, Bevel=1, Miter=2
type LineJoin = "round" | "bevel" | "miter";
function decodeLineJoin(bytes: Uint8Array, offset: number): [LineJoin, number] {
  const [variant, variantEnd] = decodeVarint(bytes, offset);
  const joins: LineJoin[] = ["round", "bevel", "miter"];
  return [joins[variant] || "miter", variantEnd];
}

interface StrokeStyleDecoded {
  color: Color;
  width: number;
  cap: LineCap;
  join: LineJoin;
  miterLimit: number;
  dashArray: number[];
  dashOffset: number;
}

function decodeStrokeStyle(bytes: Uint8Array, offset: number): [StrokeStyleDecoded, number] {
  let pos = offset;
  let color: Color;
  let width: number, miterLimit: number, dashOffset: number;
  let cap: LineCap, join: LineJoin;
  let dashArray: number[];

  [color, pos] = decodeColor(bytes, pos);
  [width, pos] = decodeF32(bytes, pos);
  [cap, pos] = decodeLineCap(bytes, pos);
  [join, pos] = decodeLineJoin(bytes, pos);
  [miterLimit, pos] = decodeF32(bytes, pos);
  [dashArray, pos] = decodeVec(bytes, pos, decodeF32);
  [dashOffset, pos] = decodeF32(bytes, pos);

  return [{ color, width, cap, join, miterLimit, dashArray, dashOffset }, pos];
}

/**
 * Convert decoded Path to browser Path2D
 */
function pathToPath2D(decodedPath: DecodedPath): Path2D {
  const path = new Path2D();
  for (const op of decodedPath.ops) {
    switch (op.type) {
      case "moveTo":
        path.moveTo(op.point.x, op.point.y);
        break;
      case "lineTo":
        path.lineTo(op.point.x, op.point.y);
        break;
      case "quadTo":
        path.quadraticCurveTo(op.control.x, op.control.y, op.to.x, op.to.y);
        break;
      case "cubicTo":
        path.bezierCurveTo(op.c1.x, op.c1.y, op.c2.x, op.c2.y, op.to.x, op.to.y);
        break;
      case "arc":
        // Convert to arc: arc(x, y, radius, startAngle, endAngle, counterclockwise)
        path.arc(
          op.center.x,
          op.center.y,
          op.radius,
          op.startAngle,
          op.startAngle + op.sweepAngle,
          op.sweepAngle < 0
        );
        break;
      case "close":
        path.closePath();
        break;
    }
  }
  return path;
}

/**
 * Read postcard-encoded bytes from a Ptr (memory pointer).
 * The format is [len: u32 LE][cap: u32 LE][data...] where data is len-8 bytes starting at ptr+8.
 */
function readItemBytes(store: GlobalStore, ptr: number): Uint8Array | null {
  if (ptr <= 0 || !store.memory) return null;
  try {
    const view = new DataView(store.memory.buffer);
    const len = view.getUint32(ptr, true);
    if (len <= 8) return null;
    const dataLen = len - 8;
    return new Uint8Array(store.memory.buffer, ptr + 8, dataLen).slice();
  } catch {
    return null;
  }
}

/**
 * Encode RGBA data as PNG (minimal uncompressed PNG for sync operation).
 * B6: get_image_data should return PNG bytes like aidoku-rs test runner.
 */
function encodeRGBAasPNG(rgba: Uint8ClampedArray, width: number, height: number): Uint8Array {
  // PNG signature
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

  // Helper to compute CRC32
  const crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[i] = c;
  }
  const crc32 = (data: Uint8Array): number => {
    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i++) {
      crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  };

  // Create chunk helper
  const makeChunk = (type: string, data: Uint8Array): Uint8Array => {
    const typeBytes = new TextEncoder().encode(type);
    const chunk = new Uint8Array(4 + 4 + data.length + 4);
    const view = new DataView(chunk.buffer);
    view.setUint32(0, data.length, false); // big-endian length
    chunk.set(typeBytes, 4);
    chunk.set(data, 8);
    const crcData = new Uint8Array(4 + data.length);
    crcData.set(typeBytes, 0);
    crcData.set(data, 4);
    view.setUint32(8 + data.length, crc32(crcData), false);
    return chunk;
  };

  // IHDR chunk
  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width, false);
  ihdrView.setUint32(4, height, false);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type (RGBA)
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const ihdrChunk = makeChunk("IHDR", ihdr);

  // IDAT chunk (uncompressed with zlib wrapper)
  // Build raw PNG scanlines (filter byte + RGBA for each pixel)
  const rawData = new Uint8Array(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 4)] = 0; // filter type: None
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      const dstIdx = y * (1 + width * 4) + 1 + x * 4;
      rawData[dstIdx] = rgba[srcIdx];     // R
      rawData[dstIdx + 1] = rgba[srcIdx + 1]; // G
      rawData[dstIdx + 2] = rgba[srcIdx + 2]; // B
      rawData[dstIdx + 3] = rgba[srcIdx + 3]; // A
    }
  }

  // Simple DEFLATE: store blocks (no compression)
  const deflateBlocks: Uint8Array[] = [];
  const BLOCK_SIZE = 65535;
  for (let i = 0; i < rawData.length; i += BLOCK_SIZE) {
    const isLast = i + BLOCK_SIZE >= rawData.length;
    const blockData = rawData.slice(i, Math.min(i + BLOCK_SIZE, rawData.length));
    const blockLen = blockData.length;
    const block = new Uint8Array(5 + blockLen);
    block[0] = isLast ? 1 : 0; // BFINAL + BTYPE=00 (stored)
    block[1] = blockLen & 0xff;
    block[2] = (blockLen >> 8) & 0xff;
    block[3] = (~blockLen) & 0xff;
    block[4] = ((~blockLen) >> 8) & 0xff;
    block.set(blockData, 5);
    deflateBlocks.push(block);
  }

  // Compute Adler-32
  let s1 = 1, s2 = 0;
  for (let i = 0; i < rawData.length; i++) {
    s1 = (s1 + rawData[i]) % 65521;
    s2 = (s2 + s1) % 65521;
  }
  const adler32 = ((s2 << 16) | s1) >>> 0;

  // Build zlib stream: CMF + FLG + deflate blocks + Adler32
  const deflateLen = deflateBlocks.reduce((sum, b) => sum + b.length, 0);
  const zlibData = new Uint8Array(2 + deflateLen + 4);
  zlibData[0] = 0x78; // CMF (deflate, 32K window)
  zlibData[1] = 0x01; // FLG (no dict, lowest compression check)
  let offset = 2;
  for (const block of deflateBlocks) {
    zlibData.set(block, offset);
    offset += block.length;
  }
  const adlerView = new DataView(zlibData.buffer, zlibData.byteOffset + offset, 4);
  adlerView.setUint32(0, adler32, false);

  const idatChunk = makeChunk("IDAT", zlibData);

  // IEND chunk
  const iendChunk = makeChunk("IEND", new Uint8Array(0));

  // Combine all chunks
  const png = new Uint8Array(signature.length + ihdrChunk.length + idatChunk.length + iendChunk.length);
  let pos = 0;
  png.set(signature, pos); pos += signature.length;
  png.set(ihdrChunk, pos); pos += ihdrChunk.length;
  png.set(idatChunk, pos); pos += idatChunk.length;
  png.set(iendChunk, pos);

  return png;
}

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
  const dataCopy = new Uint8Array(imageData);
  
  try {
    // Try to decode the image first
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
    // Image decode failed (e.g., scrambled/encrypted data)
    // Store raw bytes with bitmap=null - WASM code will process them
    // This matches Swift behavior: source.store(value: data)
    console.warn("[Canvas] createHostImage: decode failed, storing raw bytes");
    const resource: ImageResource = {
      type: "image",
      bitmap: null,
      data: dataCopy,
      width: 0,
      height: 0,
    };
    const rid = store.storeStdValue(resource);
    
    return { rid, width: 0, height: 0 };
  }
}

/**
 * Get image data from an image resource by rid.
 * B6: Returns PNG-encoded bytes.
 */
export function getHostImageData(store: GlobalStore, rid: number): Uint8Array | null {
  const resource = store.readStdValue(rid);
  if (!isImageResource(resource)) return null;
  
  // If bitmap exists, we need to get the PNG data
  // The stored `data` is the original encoded data, which may not reflect canvas operations
  // For processed images, we need to render the bitmap back to PNG bytes
  if (resource.bitmap) {
    try {
      // Create a canvas and draw the bitmap
      const canvas = new OffscreenCanvas(resource.bitmap.width, resource.bitmap.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) return resource.data;
      
      ctx.drawImage(resource.bitmap, 0, 0);
      
      // B6: Encode as PNG
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      return encodeRGBAasPNG(imageData.data, canvas.width, canvas.height);
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

    // Fill path with color (path is postcard-encoded Path at Ptr)
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
      if (pathPtr <= 0) return CanvasError.InvalidPath;

      try {
        // B5: Read postcard-encoded Path from memory pointer
        const pathBytes = readItemBytes(store, pathPtr);
        if (!pathBytes) return CanvasError.InvalidPath;

        const [decodedPath] = decodePath(pathBytes, 0);
        const path2d = pathToPath2D(decodedPath);

        const { ctx } = canvas;
        // Colors are 0-255 in aidoku-rs (see test-runner: r as u8, etc.)
        const color = `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`;
        ctx.fillStyle = color;
        ctx.fill(path2d);
        return 0;
      } catch (e) {
        console.error("[Canvas] fill error:", e);
        return CanvasError.InvalidPath;
      }
    },

    // Stroke path with style (both are postcard-encoded at Ptr)
    // fn stroke(context: Rid, path: Ptr, style: Ptr) -> FFIResult
    stroke: (ctxId: number, pathPtr: number, stylePtr: number): number => {
      const canvas = getCanvas(ctxId);
      if (!canvas) return CanvasError.InvalidContext;
      if (pathPtr <= 0) return CanvasError.InvalidPath;
      if (stylePtr <= 0) return CanvasError.InvalidStyle;

      try {
        // B5: Read postcard-encoded Path and StrokeStyle from memory pointers
        const pathBytes = readItemBytes(store, pathPtr);
        if (!pathBytes) return CanvasError.InvalidPath;

        const styleBytes = readItemBytes(store, stylePtr);
        if (!styleBytes) return CanvasError.InvalidStyle;

        const [decodedPath] = decodePath(pathBytes, 0);
        const [style] = decodeStrokeStyle(styleBytes, 0);

        const path2d = pathToPath2D(decodedPath);
        const { ctx } = canvas;

        // Apply style
        const { red, green, blue, alpha } = style.color;
        ctx.strokeStyle = `rgba(${Math.round(red)}, ${Math.round(green)}, ${Math.round(blue)}, ${alpha})`;
        ctx.lineWidth = style.width;
        ctx.lineCap = style.cap;
        ctx.lineJoin = style.join;
        ctx.miterLimit = style.miterLimit;
        if (style.dashArray.length > 0) {
          ctx.setLineDash(style.dashArray);
          ctx.lineDashOffset = style.dashOffset;
        }

        ctx.stroke(path2d);
        return 0;
      } catch (e) {
        console.error("[Canvas] stroke error:", e);
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

    // Get image data as buffer descriptor (B6: returns PNG bytes)
    // fn get_image_data(image_rid: Rid) -> FFIResult
    get_image_data: (imageId: number): number => {
      const image = getImage(imageId);
      if (!image) return CanvasError.InvalidImage;

      try {
        // B6: Return PNG-encoded bytes (like aidoku-rs test runner)
        if (image.bitmap) {
          // Render bitmap to canvas and export as PNG
          const canvas = new OffscreenCanvas(image.bitmap.width, image.bitmap.height);
          const ctx = canvas.getContext("2d");
          if (!ctx) return CanvasError.InvalidResult;
          
          ctx.drawImage(image.bitmap, 0, 0);
          
          // convertToBlob is async, but we need sync - fall back to raw RGBA
          // For sync operation, we store the raw ImageData
          // Note: In a future async version, use canvas.convertToBlob({ type: "image/png" })
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          
          // Encode as simple PNG using a minimal PNG encoder
          const pngBytes = encodeRGBAasPNG(imageData.data, canvas.width, canvas.height);
          return store.storeStdValue(pngBytes);
        }
        
        // If no bitmap, return original encoded data (which should already be PNG/JPEG)
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
