/**
 * Synchronous image codec using jpeg-js library.
 * Provides sync JPEG/PNG decode/encode for Kotlin/JS shims.
 */
import { Buffer } from "buffer";
import * as jpeg from "jpeg-js";

// jpeg-js requires Buffer polyfill in browser/worker environments
if (typeof globalThis.Buffer === "undefined") {
  (globalThis as Record<string, unknown>).Buffer = Buffer;
}

export interface DecodedImage {
  width: number;
  height: number;
  // ARGB pixel array (Android format)
  pixels: Int32Array;
}

/**
 * Decode JPEG bytes to ARGB pixels (Android format).
 */
export function decodeJpeg(data: Uint8Array): DecodedImage {
  const decoded = jpeg.decode(data, { useTArray: true, formatAsRGBA: true });
  const { width, height, data: rgba } = decoded;
  
  // Convert RGBA to ARGB (Android Bitmap format)
  const pixels = new Int32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    const a = rgba[i * 4 + 3];
    // ARGB = (A << 24) | (R << 16) | (G << 8) | B
    pixels[i] = ((a << 24) | (r << 16) | (g << 8) | b) | 0;
  }
  
  return { width, height, pixels };
}

/**
 * Decode PNG bytes to ARGB pixels.
 * Uses a simple PNG decoder for uncompressed/deflate PNGs.
 */
export function decodePng(data: Uint8Array): DecodedImage | null {
  // PNG signature check
  if (data[0] !== 0x89 || data[1] !== 0x50 || data[2] !== 0x4e || data[3] !== 0x47) {
    return null;
  }
  
  let pos = 8; // Skip signature
  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idatChunks: Uint8Array[] = [];
  
  while (pos + 8 <= data.length) {
    const length = (data[pos] << 24) | (data[pos + 1] << 16) | (data[pos + 2] << 8) | data[pos + 3];
    const type = String.fromCharCode(data[pos + 4], data[pos + 5], data[pos + 6], data[pos + 7]);
    pos += 8;
    
    if (type === "IHDR") {
      width = (data[pos] << 24) | (data[pos + 1] << 16) | (data[pos + 2] << 8) | data[pos + 3];
      height = (data[pos + 4] << 24) | (data[pos + 5] << 16) | (data[pos + 6] << 8) | data[pos + 7];
      bitDepth = data[pos + 8];
      colorType = data[pos + 9];
    } else if (type === "IDAT") {
      idatChunks.push(data.slice(pos, pos + length));
    } else if (type === "IEND") {
      break;
    }
    
    pos += length + 4; // data + CRC
  }
  
  if (width === 0 || height === 0) return null;
  // This decoder only supports 8-bit channels.
  if (bitDepth !== 8) return null;
  
  // Concatenate IDAT chunks
  const compressedLen = idatChunks.reduce((sum, c) => sum + c.length, 0);
  const compressed = new Uint8Array(compressedLen);
  let offset = 0;
  for (const chunk of idatChunks) {
    compressed.set(chunk, offset);
    offset += chunk.length;
  }
  
  // Decompress using pako-like inflate (simplified)
  const inflated = inflateSync(compressed);
  if (!inflated) return null;
  
  // Determine bytes per pixel
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 4 ? 2 : 1;
  const scanlineSize = 1 + width * bpp;
  
  // Unfilter scanlines
  const pixels = new Int32Array(width * height);
  const prevScanline = new Uint8Array(width * bpp);
  
  for (let y = 0; y < height; y++) {
    const scanlineStart = y * scanlineSize;
    const filterType = inflated[scanlineStart];
    const scanline = new Uint8Array(width * bpp);
    
    for (let x = 0; x < width * bpp; x++) {
      const raw = inflated[scanlineStart + 1 + x];
      const a = x >= bpp ? scanline[x - bpp] : 0;
      const b = prevScanline[x];
      const c = x >= bpp ? prevScanline[x - bpp] : 0;
      
      switch (filterType) {
        case 0: scanline[x] = raw; break;
        case 1: scanline[x] = (raw + a) & 0xff; break;
        case 2: scanline[x] = (raw + b) & 0xff; break;
        case 3: scanline[x] = (raw + Math.floor((a + b) / 2)) & 0xff; break;
        case 4: scanline[x] = (raw + paeth(a, b, c)) & 0xff; break;
        default: scanline[x] = raw;
      }
    }
    
    // Convert to ARGB
    for (let x = 0; x < width; x++) {
      let r: number, g: number, b: number, a: number;
      if (colorType === 6) { // RGBA
        r = scanline[x * 4];
        g = scanline[x * 4 + 1];
        b = scanline[x * 4 + 2];
        a = scanline[x * 4 + 3];
      } else if (colorType === 2) { // RGB
        r = scanline[x * 3];
        g = scanline[x * 3 + 1];
        b = scanline[x * 3 + 2];
        a = 255;
      } else if (colorType === 4) { // Grayscale + Alpha
        r = g = b = scanline[x * 2];
        a = scanline[x * 2 + 1];
      } else { // Grayscale
        r = g = b = scanline[x];
        a = 255;
      }
      pixels[y * width + x] = ((a << 24) | (r << 16) | (g << 8) | b) | 0;
    }
    
    prevScanline.set(scanline);
  }
  
  return { width, height, pixels };
}

/**
 * Encode ARGB pixels to JPEG bytes.
 */
export function encodeJpeg(pixels: Int32Array, width: number, height: number, quality: number): Uint8Array {
  // Convert ARGB to RGBA
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const pixel = pixels[i];
    rgba[i * 4] = (pixel >> 16) & 0xff;     // R
    rgba[i * 4 + 1] = (pixel >> 8) & 0xff;  // G
    rgba[i * 4 + 2] = pixel & 0xff;         // B
    rgba[i * 4 + 3] = (pixel >> 24) & 0xff; // A
  }
  
  const encoded = jpeg.encode({ data: rgba, width, height }, quality);
  return encoded.data;
}

/**
 * Encode ARGB pixels to PNG bytes (uncompressed).
 */
export function encodePng(pixels: Int32Array, width: number, height: number): Uint8Array {
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  
  // CRC32 table
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
    for (const byte of data) {
      crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  };
  
  const makeChunk = (type: string, data: Uint8Array): Uint8Array => {
    const typeBytes = new TextEncoder().encode(type);
    const chunk = new Uint8Array(4 + 4 + data.length + 4);
    const view = new DataView(chunk.buffer);
    view.setUint32(0, data.length, false);
    chunk.set(typeBytes, 4);
    chunk.set(data, 8);
    const crcData = new Uint8Array(4 + data.length);
    crcData.set(typeBytes, 0);
    crcData.set(data, 4);
    view.setUint32(8 + data.length, crc32(crcData), false);
    return chunk;
  };
  
  // IHDR
  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width, false);
  ihdrView.setUint32(4, height, false);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const ihdrChunk = makeChunk("IHDR", ihdr);
  
  // Build raw scanlines
  const rawData = new Uint8Array(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 4)] = 0; // filter: None
    for (let x = 0; x < width; x++) {
      const pixel = pixels[y * width + x];
      const dstIdx = y * (1 + width * 4) + 1 + x * 4;
      rawData[dstIdx] = (pixel >> 16) & 0xff;     // R
      rawData[dstIdx + 1] = (pixel >> 8) & 0xff;  // G
      rawData[dstIdx + 2] = pixel & 0xff;         // B
      rawData[dstIdx + 3] = (pixel >> 24) & 0xff; // A
    }
  }
  
  // DEFLATE store blocks
  const deflateBlocks: Uint8Array[] = [];
  const BLOCK_SIZE = 65535;
  for (let i = 0; i < rawData.length; i += BLOCK_SIZE) {
    const isLast = i + BLOCK_SIZE >= rawData.length;
    const blockData = rawData.slice(i, Math.min(i + BLOCK_SIZE, rawData.length));
    const blockLen = blockData.length;
    const block = new Uint8Array(5 + blockLen);
    block[0] = isLast ? 1 : 0;
    block[1] = blockLen & 0xff;
    block[2] = (blockLen >> 8) & 0xff;
    block[3] = (~blockLen) & 0xff;
    block[4] = ((~blockLen) >> 8) & 0xff;
    block.set(blockData, 5);
    deflateBlocks.push(block);
  }
  
  // Adler-32
  let s1 = 1, s2 = 0;
  for (const byte of rawData) {
    s1 = (s1 + byte) % 65521;
    s2 = (s2 + s1) % 65521;
  }
  const adler32 = (s2 << 16) | s1;
  
  // Zlib stream
  const deflateLen = deflateBlocks.reduce((sum, b) => sum + b.length, 0);
  const zlibData = new Uint8Array(2 + deflateLen + 4);
  zlibData[0] = 0x78;
  zlibData[1] = 0x01;
  let offset = 2;
  for (const block of deflateBlocks) {
    zlibData.set(block, offset);
    offset += block.length;
  }
  const zlibView = new DataView(zlibData.buffer);
  zlibView.setUint32(offset, adler32, false);
  
  const idatChunk = makeChunk("IDAT", zlibData);
  const iendChunk = makeChunk("IEND", new Uint8Array(0));
  
  // Combine
  const png = new Uint8Array(signature.length + ihdrChunk.length + idatChunk.length + iendChunk.length);
  let pos = 0;
  png.set(signature, pos); pos += signature.length;
  png.set(ihdrChunk, pos); pos += ihdrChunk.length;
  png.set(idatChunk, pos); pos += idatChunk.length;
  png.set(iendChunk, pos);
  
  return png;
}

// Helper: Paeth predictor for PNG filtering
function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

// Simple DEFLATE inflate for stored and fixed Huffman blocks
function inflateSync(data: Uint8Array): Uint8Array | null {
  if (data.length < 2) return null;
  
  // Skip zlib header
  let pos = 2;
  const output: number[] = [];
  const window = new Uint8Array(32768);
  let windowPos = 0;
  
  let bitBuffer = 0;
  let bitCount = 0;
  
  const readBit = (): number => {
    if (bitCount === 0) {
      if (pos >= data.length) return 0;
      bitBuffer = data[pos++];
      bitCount = 8;
    }
    const bit = bitBuffer & 1;
    bitBuffer >>= 1;
    bitCount--;
    return bit;
  };
  
  const readBits = (n: number): number => {
    let result = 0;
    for (let i = 0; i < n; i++) {
      result |= readBit() << i;
    }
    return result;
  };
  
  const writeOutput = (byte: number) => {
    output.push(byte);
    window[windowPos] = byte;
    windowPos = (windowPos + 1) & 0x7fff;
  };
  
  let bfinal = 0;
  while (bfinal === 0 && pos < data.length - 4) {
    bfinal = readBit();
    const btype = readBits(2);
    
    if (btype === 0) {
      // Stored block
      bitCount = 0;
      if (pos + 4 > data.length) break;
      const len = data[pos] | (data[pos + 1] << 8);
      pos += 4;
      for (let i = 0; i < len && pos < data.length; i++) {
        writeOutput(data[pos++]);
      }
    } else if (btype === 1 || btype === 2) {
      // Fixed or dynamic Huffman
      // Simplified: only handle common cases
      const lengthBase = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
      const lengthExtra = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
      const distBase = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
      const distExtra = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
      
      // Simplified fixed Huffman decode
      while (true) {
        // Read literal/length symbol
        let symbol: number;
        let bits = readBits(7);
        if (bits <= 23) {
          symbol = 256 + bits;
        } else {
          bits = (bits << 1) | readBit();
          if (bits >= 48 && bits <= 191) {
            symbol = bits - 48;
          } else if (bits >= 192 && bits <= 199) {
            symbol = 280 + (bits - 192);
          } else {
            bits = (bits << 1) | readBit();
            if (bits >= 400 && bits <= 511) {
              symbol = 144 + (bits - 400);
            } else {
              symbol = 256;
            }
          }
        }
        
        if (symbol < 256) {
          writeOutput(symbol);
        } else if (symbol === 256) {
          break;
        } else {
          const lengthIdx = symbol - 257;
          if (lengthIdx >= lengthBase.length) break;
          const length = lengthBase[lengthIdx] + readBits(lengthExtra[lengthIdx]);
          
          const distCode = readBits(5);
          if (distCode >= distBase.length) break;
          const dist = distBase[distCode] + readBits(distExtra[distCode]);
          
          for (let i = 0; i < length; i++) {
            const copyPos = (windowPos - dist) & 0x7fff;
            writeOutput(window[copyPos]);
          }
        }
      }
    }
  }
  
  return new Uint8Array(output);
}

/**
 * Detect image format from bytes.
 */
export function detectImageFormat(data: Uint8Array): "jpeg" | "png" | "unknown" {
  if (data.length >= 2 && data[0] === 0xff && data[1] === 0xd8) return "jpeg";
  if (data.length >= 8 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return "png";
  return "unknown";
}

/**
 * Decode any supported image format to ARGB pixels.
 */
export function decodeImage(data: Uint8Array): DecodedImage | null {
  const format = detectImageFormat(data);
  if (format === "jpeg") return decodeJpeg(data);
  if (format === "png") return decodePng(data);
  return null;
}

