// The `KissFftModule` shape is owned by the platform-agnostic dual-reader
// core in `@nemu/core` so the alignment pipeline can depend on it without a
// wasm-loader import. This web-only module wires the actual `kissfft-wasm`
// loader (Vite `?url`) into that type and exposes the provider the web worker
// passes into `computeAlignmentTransform({ options: { wasmProvider } })`.
import type { KissFftModule } from "@nemu/core/dual-reader";

export type { KissFftModule };

type WasmState = {
  module: KissFftModule | null;
  promise: Promise<KissFftModule | null> | null;
};

const wasmState: WasmState = {
  module: null,
  promise: null,
};

async function loadKissFftModule(): Promise<KissFftModule | null> {
  if (typeof WebAssembly === 'undefined') return null;
  const wasmUrl = (await import('kissfft-wasm/lib/kissfft.wasm?url')).default as string;
  const moduleFactory = (await import('kissfft-wasm/lib/kissfft.mjs')).default as unknown as (opts?: {
    locateFile?: (path: string, scriptDirectory: string) => string;
  }) => Promise<KissFftModule>;
  return moduleFactory({
    locateFile: (path) => (path.endsWith('.wasm') ? wasmUrl : path),
  });
}

export async function initAlignmentWasm(): Promise<boolean> {
  if (wasmState.module) return true;
  if (!wasmState.promise) {
    wasmState.promise = loadKissFftModule();
  }
  try {
    const module = await wasmState.promise;
    if (module) {
      wasmState.module = module;
      return true;
    }
  } catch {
    wasmState.promise = null;
    return false;
  }
  return false;
}

export function isAlignmentWasmReady(): boolean {
  return wasmState.module !== null;
}

export function getAlignmentWasmModule(): KissFftModule | null {
  return wasmState.module;
}

/**
 * Provider the web dual-reader worker passes to
 * `computeAlignmentTransform({ options: { wasmProvider } })`. The pure core
 * calls `isReady()` / `getModule()` instead of importing this loader
 * directly, so the same core runs on mobile (no provider → JS backend).
 */
import type { FftWasmProvider } from "@nemu/core/dual-reader";

export const alignmentWasmProvider: FftWasmProvider = {
  isReady: isAlignmentWasmReady,
  getModule: getAlignmentWasmModule,
};
