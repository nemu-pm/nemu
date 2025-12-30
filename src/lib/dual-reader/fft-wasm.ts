export type KissFftModule = {
  _malloc: (size: number) => number;
  _free: (ptr: number) => void;
  _allocate: (size: number) => number;
  _kiss_fftndr_alloc: (dimsPtr: number, ndims: number, inverse: number, tmp1: number, tmp2: number) => number;
  _kiss_fftndr: (cfg: number, inputPtr: number, outputPtr: number) => void;
  _kiss_fftnd_alloc: (dimsPtr: number, ndims: number, inverse: number, tmp1: number, tmp2: number) => number;
  _kiss_fftnd: (cfg: number, inputPtr: number, outputPtr: number) => void;
  _scale: (ptr: number, length: number, scale: number) => void;
  HEAPF32: Float32Array;
  HEAP32: Int32Array;
};

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
