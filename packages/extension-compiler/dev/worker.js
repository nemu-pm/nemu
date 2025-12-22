/**
 * Test Web Worker for Keiyoushi WASM extensions.
 * 
 * Usage: Update EXTENSION below, then run:
 *   cd packages && ./gradlew :extension-compiler:devBuild -Pextension=all/mangadex
 *   npx serve extension-compiler/dev
 */

// Configure which extension to load
const EXTENSION = 'all-mangadex';

let wasmExports = null;

async function initWasm() {
    if (wasmExports) return wasmExports;

    console.log(`[Worker] Loading ${EXTENSION} WASM...`);
    try {
        const { instantiate } = await import(`./wasm/${EXTENSION}/${EXTENSION}.uninstantiated.mjs`);
        const { exports } = await instantiate({
            [`./${EXTENSION}.wasm`]: new URL(`./wasm/${EXTENSION}/${EXTENSION}.wasm`, import.meta.url).href
        }, true);
        
        wasmExports = exports;
        console.log(`[Worker] Loaded! Sources: ${exports.getSourceCount()}`);
        return exports;
    } catch (e) {
        console.error('[Worker] Failed to load WASM:', e);
        throw e;
    }
}

self.onmessage = async (event) => {
    const { id, method, args } = event.data;

    try {
        const exports = await initWasm();
        let result = exports[method](...args);

        // Parse JSON string results (all except getSourceCount which returns Int)
        if (typeof result === 'string') {
            result = JSON.parse(result);
        }
        
        self.postMessage({ id, result });
    } catch (e) {
        console.error(`[Worker] ${method} failed:`, e);
        self.postMessage({ id, error: e.message || String(e) });
    }
};

console.log('[Worker] Ready');

