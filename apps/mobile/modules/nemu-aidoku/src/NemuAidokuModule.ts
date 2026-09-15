import { NativeModule, requireNativeModule } from "expo";
import type {
  NemuAidokuEventsMap,
  NemuAidokuHttpClientStatus,
  NemuAidokuHttpFileRequest,
  NemuAidokuHttpFileResponse,
  NemuAidokuHttpRequest,
  NemuAidokuHttpResponse,
  NemuAidokuCloudflareSolveOptions,
  NemuAidokuSandboxStatus,
  NemuNetworkAccessState,
} from "./NemuAidoku.types";

export type {
  NemuAidokuCfEventsMap,
  NemuAidokuCfFailureReason,
  NemuAidokuCfSolveEventPayload,
  NemuAidokuCloudflareSolveOptions,
} from "./NemuAidoku.types";

declare class NemuAidokuModule extends NativeModule<NemuAidokuEventsMap> {
  isAvailable(): boolean;
  getNetworkAccessState(): NemuNetworkAccessState;
  getHttpClientStatus(): NemuAidokuHttpClientStatus;
  getAidokuSandboxStatus(): NemuAidokuSandboxStatus;
  prepareHttpRequest(requestId: string): boolean;
  cancelHttpRequest(requestId: string): boolean;
  releaseHttpRequest(requestId: string): void;
  clearImageMemoryCache(): Promise<void>;
  resetMobileSourceProfileAuthState(): Promise<void>;
  /**
   * Clears the cookies of exactly one source, for a `clear_cookies_on_log_out`
   * log out. Pass the same scope the source's requests use as `cookieScope`.
   * Other sources' jars, and the shared WebView cookie store, are untouched.
   * Rejects with `E_SOURCE_COOKIE_SCOPE` for a blank, oversized, or control-
   * character scope.
   */
  clearSourceCookies(cookieScope: string): Promise<void>;
  downloadHttpFile(
    request: NemuAidokuHttpFileRequest,
  ): Promise<NemuAidokuHttpFileResponse>;
  sendHttpRequest(request: NemuAidokuHttpRequest): Promise<NemuAidokuHttpResponse>;
  sendHttpRequestSync(request: NemuAidokuHttpRequest): NemuAidokuHttpResponse;
  createAidokuSandboxSession(
    sessionId: string,
    packageUri: string,
    sourceKey: string,
    expectedSourceId: string,
    expectedVersion: number,
    settingsJson: string,
  ): Promise<string>;
  executeAidokuSandboxOperation(
    sessionId: string,
    operationJson: string,
  ): Promise<string>;
  processAidokuSandboxImage(
    sessionId: string,
    operationJson: string,
    imageBytes: Uint8Array,
  ): Promise<Uint8Array | null>;
  updateAidokuSandboxSettings(
    sessionId: string,
    settingsJson: string,
  ): Promise<string>;
  clearAidokuSandboxSettings(
    key: string,
    matchPrefix: boolean,
  ): Promise<string>;
  disposeAidokuSandboxSession(sessionId: string): Promise<string>;
  /**
   * Explicit, never-inline Cloudflare verification. Call this only after the
   * runtime has already classified a source failure as a challenge; progress
   * arrives through the `nemuAidokuCf*` events and the promise resolves
   * `true`/`false` rather than rejecting for expected failures.
   *
   * `options` is optional, so `solveCloudflare(url)` stays valid.
   */
  solveCloudflare(
    url: string,
    options?: NemuAidokuCloudflareSolveOptions | null,
  ): Promise<boolean>;
  /**
   * Cancels the in-flight solve and everything queued behind it, dismissing
   * any presented challenge UI. Each cancelled solve reports
   * `nemuAidokuCfFailed` with `reason: "cancelled"` and its `solveCloudflare`
   * promise resolves `false`. Safe to call when nothing is in flight.
   */
  cancelCloudflareSolve(): Promise<void>;
}

export default requireNativeModule<NemuAidokuModule>("NemuAidoku");
