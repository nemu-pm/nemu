export type NemuAidokuHttpResponseMode = "auto" | "text" | "bytes" | "both";

export type NemuAidokuHttpRequest = {
  requestId?: string | null;
  /**
   * Optional profile/source cookie namespace. A nonblank value gets an
   * isolated persistent jar; absent or blank requests are always stateless.
   */
  cookieScope?: string | null;
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string | null;
  timeoutMs?: number | null;
  responseMode?: NemuAidokuHttpResponseMode | null;
  maxResponseBytes?: number | null;
  /**
   * Require the initial request and every followed redirect to remain HTTPS.
   * Use for requests whose body contains one-time credentials (for example an
   * OAuth authorization code and PKCE verifier). Ordinary source traffic keeps
   * its existing HTTP compatibility when this is absent.
   */
  requireHttps?: boolean | null;
};

export type NemuAidokuHttpResponse = {
  status: number;
  headers: Record<string, string>;
  body?: string | null;
  bytesBase64?: string | null;
  error?: string | null;
  handledCloudflare?: boolean | null;
};

/**
 * A bounded GET whose body stays in native code and is published only as an
 * owned temporary file after every redirect/peer policy check succeeds.
 */
export type NemuAidokuHttpFileRequest = {
  requestId?: string | null;
  cookieScope?: string | null;
  url: string;
  headers: Record<string, string>;
  timeoutMs?: number | null;
  maxResponseBytes: number;
  /** Require the initial URL and every redirect to remain HTTPS. */
  requireHttps?: boolean | null;
  /** Optional, paired decoded-image limits. Omit both for non-image files. */
  maxImageDimension?: number | null;
  maxImagePixels?: number | null;
  /** Android-only opt-in for a bounded manifest of static portrait-strip tiles. */
  allowLongStripSegments?: boolean | null;
};

export type NemuAidokuHttpImageSegment = {
  fileUri: string;
  byteLength: number;
  width: number;
  height: number;
  mimeType: "image/jpeg" | "image/png";
};

export type NemuAidokuHttpFileResponse = {
  status: number;
  headers: Record<string, string>;
  kind?: "file" | "segmented-image" | null;
  fileUri?: string | null;
  byteLength?: number | null;
  manifestVersion?: number | null;
  imageWidth?: number | null;
  imageHeight?: number | null;
  imageSegments?: NemuAidokuHttpImageSegment[] | null;
  error?: string | null;
};

export type NemuAidokuHttpClientStatus = {
  available: boolean;
  abiVersion?: number | null;
  supportsRequestLifecycle?: boolean | null;
  supportsCloudflareSolver?: boolean | null;
  version?: string | null;
  platform?: string | null;
  detail?: string | null;
};

export type NemuAidokuSandboxStatus = {
  available: boolean;
  platform?: string | null;
  detail?: string | null;
};

export type NemuNetworkAccessState =
  | "unknown"
  | "restricted"
  | "notRestricted";

export type NemuNetworkAccessEventPayload = {
  state: NemuNetworkAccessState;
};

/**
 * Cloudflare solver lifecycle events emitted by `solveCloudflare`. Each event
 * carries the url being solved; `nemuAidokuCfFailed` adds a `reason` when one
 * is known. These drive the live "Nemu Agent" sheet (see `useNemuAgentSheet`).
 */
export type NemuAidokuCfSolveEventPayload = {
  url: string;
  reason?: string;
};

export type NemuAidokuCfEventsMap = {
  nemuAidokuCfSolveStart: (payload: NemuAidokuCfSolveEventPayload) => void;
  nemuAidokuCfWaiting: (payload: NemuAidokuCfSolveEventPayload) => void;
  nemuAidokuCfCaptcha: (payload: NemuAidokuCfSolveEventPayload) => void;
  nemuAidokuCfSuccess: (payload: NemuAidokuCfSolveEventPayload) => void;
  nemuAidokuCfFailed: (payload: NemuAidokuCfSolveEventPayload) => void;
};

export type NemuAidokuEventsMap = NemuAidokuCfEventsMap & {
  nemuNetworkAccessChanged: (payload: NemuNetworkAccessEventPayload) => void;
};
