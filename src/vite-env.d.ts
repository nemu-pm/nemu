/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Service (CORS proxy) origin; defaults to https://service.nemu.pm. */
  readonly VITE_SERVICE_URL?: string;
  /** Sentry DSN (public); crash reporting is off without it. */
  readonly VITE_SENTRY_DSN?: string;
  /** Set by vite.config.ts from the commit being built. */
  readonly VITE_SENTRY_RELEASE?: string;
  /** Set by vite.config.ts from VERCEL_ENV (production, preview). */
  readonly VITE_SENTRY_ENVIRONMENT?: string;
}

declare module '*.wasm?url' {
  const src: string;
  export default src;
}
