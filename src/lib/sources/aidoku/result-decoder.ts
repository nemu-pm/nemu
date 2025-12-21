// Shared helpers for decoding WASM result pointers (aidoku-rs ABI)
// 
// Result format from aidoku-rs __handle_result:
// [len: i32 LE][cap: i32 LE][postcard payload...]
//
// The payload is postcard-encoded and may contain:
// - Primitive values (i32 as zigzag varint, bool, etc.)
// - Structs (serialized fields in order)
// - Rids (i32 references to store resources)

/**
 * Read the raw postcard payload from a WASM result pointer.
 * Returns null if the pointer is invalid or the result is empty.
 */
export function readResultPayload(
  memory: WebAssembly.Memory,
  ptr: number
): Uint8Array | null {
  if (ptr <= 0) {
    return null;
  }

  try {
    const view = new DataView(memory.buffer);
    const len = view.getInt32(ptr, true);

    if (len <= 8) {
      return null;
    }

    // Data starts after the 8-byte header (len + capacity)
    const payloadLen = len - 8;
    const data = new Uint8Array(memory.buffer, ptr + 8, payloadLen);
    return data.slice(); // Copy to avoid issues with memory changes
  } catch {
    return null;
  }
}

/**
 * Decode a zigzag-encoded varint from bytes.
 * Returns [decodedValue, bytesRead].
 */
export function decodeZigzagVarint(
  bytes: Uint8Array,
  offset = 0
): [number, number] {
  let result = 0;
  let shift = 0;
  let pos = offset;

  while (pos < bytes.length) {
    const byte = bytes[pos++];
    result |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) break;
    shift += 7;
  }

  // Decode zigzag: (n >>> 1) ^ -(n & 1)
  const decoded = (result >>> 1) ^ -(result & 1);
  return [decoded, pos - offset];
}

/**
 * Decode an i32 RID from a WASM result payload.
 * Used for get_image_request and process_page_image results.
 */
export function decodeRidFromPayload(payload: Uint8Array): number | null {
  if (!payload || payload.length === 0) {
    return null;
  }

  try {
    const [rid] = decodeZigzagVarint(payload, 0);
    return rid;
  } catch {
    return null;
  }
}

/**
 * Check if a result pointer indicates an error.
 * Error codes from aidoku-rs:
 * -1 = General error
 * -2 = Unimplemented
 * -3 = RequestError
 */
export function isResultError(ptr: number): boolean {
  return ptr < 0;
}

/**
 * Get error message from error result pointer.
 * For -1 (Message error), the format is:
 * [error_code: i32 LE][-1][0,0,0,0][len: i32 LE][cap: i32 LE][message bytes...]
 */
export function getResultErrorMessage(
  memory: WebAssembly.Memory,
  ptr: number
): string | null {
  if (ptr >= 0) {
    return null;
  }

  // Standard error codes
  if (ptr === -2) return "Unimplemented";
  if (ptr === -3) return "Request error";

  // For -1, try to read error message from the result pointer
  // This is complex - the ptr itself is negative, and the actual message
  // is stored elsewhere. For now, just return a generic error.
  return `Error code: ${ptr}`;
}

/**
 * Runtime mode for ABI detection
 */
export enum RuntimeMode {
  /** Legacy Swift-era ABI with descriptors and object model */
  Legacy = "legacy",
  /** Modern aidoku-rs ABI with postcard encoding */
  AidokuRs = "aidoku-rs",
}

/**
 * Detect runtime mode based on available WASM exports.
 */
export function detectRuntimeMode(
  exports: Record<string, WebAssembly.ExportValue>
): RuntimeMode {
  // NEW ABI (aidoku-rs): get_search_manga_list, get_manga_update, get_page_list (2 args)
  // OLD ABI (legacy): get_manga_list, get_manga_details, get_chapter_list
  
  const hasNewAbiExports =
    "get_search_manga_list" in exports || "get_manga_update" in exports;
  
  const hasLegacyExports =
    "get_manga_details" in exports || "get_chapter_list" in exports;

  // If we have new ABI exports, use aidoku-rs mode
  // (even if legacy exports also exist, prefer new ABI)
  if (hasNewAbiExports) {
    return RuntimeMode.AidokuRs;
  }

  // Fallback to legacy mode
  if (hasLegacyExports) {
    return RuntimeMode.Legacy;
  }

  // Default to aidoku-rs for unknown exports
  return RuntimeMode.AidokuRs;
}

