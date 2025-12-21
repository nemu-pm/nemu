// env namespace - environment functions (print, abort, sleep, etc.)
import { GlobalStore } from "../global-store";

export function createEnvImports(store: GlobalStore) {
  // Helper to read AssemblyScript string length from ptr-4
  // AssemblyScript stores string length at offset -4 from the data pointer
  // Swift reads 1 byte for legacy compat, but proper AS uses 4-byte LE i32
  function readAsStringLength(ptr: number): number {
    if (!store.memory || ptr < 4) return 0;
    try {
      // Try reading 4-byte length first (proper AssemblyScript format)
      const bytes = store.readBytes(ptr - 4, 4);
      if (bytes && bytes.length === 4) {
        // Read as little-endian i32
        const len = bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24);
        // Sanity check - if length is too large or negative, fall back to single byte
        if (len > 0 && len < 10000) {
          return len;
        }
      }
      // Fall back to single byte (Swift legacy behavior)
      const singleByte = store.readBytes(ptr - 4, 1);
      return singleByte?.[0] ?? 0;
    } catch {
      return 0;
    }
  }

  return {
    print: (strPtr: number, strLen: number): void => {
      const str = store.readString(strPtr, strLen);
      console.log(`[${store.id}]`, str);
    },

    // AssemblyScript abort - reads string lengths from ptr-4
    abort: (msgPtr: number, filePtr: number, line: number, col: number): never => {
      // Read message length from msgPtr - 4, then read message
      const msgLen = readAsStringLength(msgPtr);
      const msg = msgLen > 0 ? store.readString(msgPtr, msgLen) : "Unknown error";

      // Read file length from filePtr - 4, then read file
      const fileLen = readAsStringLength(filePtr);
      const file = fileLen > 0 ? store.readString(filePtr, fileLen) : "Unknown file";

      const error = `[${store.id}] Abort: ${msg} at ${file}:${line}:${col}`;
      console.error(error);
      throw new Error(error);
    },

    sleep: (seconds: number): void => {
      // Blocking sleep in browser using sync XHR trick
      // This is a hack but necessary for WASM sync calls
      const start = Date.now();
      while (Date.now() - start < seconds * 1000) {
        // Busy wait - not ideal but works for short sleeps
      }
    },

    send_partial_result: (valuePtr: number): void => {
      // This is used for streaming home results back to the app
      // The value pointer points to a postcard-encoded HomePartialResult
      // IMPORTANT: We must copy the bytes NOW because WASM will free them immediately after this returns
      try {
        if (!store.memory || valuePtr <= 0) return;
        
        const view = new DataView(store.memory.buffer);
        const len = view.getInt32(valuePtr, true);
        
        if (len <= 8) return;
        
        // Data starts after the 8-byte header (len + capacity)
        const data = new Uint8Array(store.memory.buffer, valuePtr + 8, len - 8);
        const copiedData = data.slice(); // Make a copy before WASM frees it
        
        store.partialHomeResultBytes.push(copiedData);
        
        // Notify callback for progressive streaming (if set)
        store.onPartialHomeBytes?.(copiedData);
      } catch (e) {
        console.warn(`[${store.id}] Failed to capture partial result:`, e);
      }
    },
  };
}

