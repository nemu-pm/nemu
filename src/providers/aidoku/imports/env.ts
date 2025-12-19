// env namespace - environment functions (print, abort, sleep, etc.)
import { GlobalStore } from "../global-store";

export function createEnvImports(store: GlobalStore) {
  return {
    print: (strPtr: number, strLen: number): void => {
      const str = store.readString(strPtr, strLen);
      console.log(`[${store.id}]`, str);
    },

    abort: (msgPtr: number, filePtr: number, line: number, col: number): void => {
      const msg = store.readString(msgPtr, 256) || "Unknown error";
      const file = store.readString(filePtr, 256) || "Unknown file";
      console.error(`[${store.id}] Abort: ${msg} at ${file}:${line}:${col}`);
      // In browser we can't actually abort, but we log the error
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
      // This is used for streaming results back to the app
      // In our browser implementation, we can emit an event or callback
      console.log(`[${store.id}] Partial result at ptr:`, valuePtr);
      // Could implement: window.dispatchEvent(new CustomEvent('aidoku-partial', { detail: valuePtr }));
    },
  };
}

