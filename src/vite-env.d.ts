/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Service (CORS proxy) origin; defaults to https://service.nemu.pm. */
  readonly VITE_SERVICE_URL?: string;
}

declare module '*.wasm?url' {
  const src: string;
  export default src;
}
