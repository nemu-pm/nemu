/**
 * FFT backend types shared by the dual-reader alignment core.
 *
 * The pure alignment core in `@nemu/core` is platform-agnostic and must not
 * depend on a specific wasm loader (Vite `?url` imports, Emscripten modules,
 * etc.). Instead, the wasm FFT module is injected through a `FftWasmProvider`
 * so the web build can wire in `kissfft-wasm` while mobile (no WebAssembly
 * polyfill) passes no provider and falls back to the pure-JS `fft.js`
 * backend inside `resolveFftBackend`.
 *
 * The `KissFftModule` shape mirrors the Emscripten-exported `kissfft-wasm`
 * module used by `src/lib/dual-reader/fft-wasm.ts` on web.
 */
export type KissFftModule = {
  _malloc: (size: number) => number;
  _free: (ptr: number) => void;
  _allocate: (size: number) => number;
  _kiss_fftndr_alloc: (
    dimsPtr: number,
    ndims: number,
    inverse: number,
    tmp1: number,
    tmp2: number
  ) => number;
  _kiss_fftndr: (cfg: number, inputPtr: number, outputPtr: number) => void;
  _kiss_fftnd_alloc: (
    dimsPtr: number,
    ndims: number,
    inverse: number,
    tmp1: number,
    tmp2: number
  ) => number;
  _kiss_fftnd: (cfg: number, inputPtr: number, outputPtr: number) => void;
  _scale: (ptr: number, length: number, scale: number) => void;
  HEAPF32: Float32Array;
  HEAP32: Int32Array;
};

/**
 * Injected accessor for the wasm FFT module. Web wires this to
 * `fft-wasm.ts` (`{ isReady: isAlignmentWasmReady, getModule:
 * getAlignmentWasmModule }`); mobile omits it so the JS backend is used.
 */
export type FftWasmProvider = {
  isReady(): boolean;
  getModule(): KissFftModule | null;
};