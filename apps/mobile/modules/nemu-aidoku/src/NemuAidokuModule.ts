import { NativeModule, requireNativeModule } from "expo";
import type {
  NemuAidokuCfEventsMap,
  NemuAidokuHttpClientStatus,
  NemuAidokuHttpFileRequest,
  NemuAidokuHttpFileResponse,
  NemuAidokuHttpRequest,
  NemuAidokuHttpResponse,
  NemuAidokuSandboxStatus,
} from "./NemuAidoku.types";

export type {
  NemuAidokuCfEventsMap,
  NemuAidokuCfSolveEventPayload,
} from "./NemuAidoku.types";

declare class NemuAidokuModule extends NativeModule<NemuAidokuCfEventsMap> {
  isAvailable(): boolean;
  getHttpClientStatus(): NemuAidokuHttpClientStatus;
  getAidokuSandboxStatus(): NemuAidokuSandboxStatus;
  prepareHttpRequest(requestId: string): boolean;
  cancelHttpRequest(requestId: string): boolean;
  releaseHttpRequest(requestId: string): void;
  clearImageMemoryCache(): Promise<void>;
  resetMobileSourceProfileAuthState(): Promise<void>;
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
  /** Retained for ABI compatibility. Secure mobile builds currently advertise
   * `supportsCloudflareSolver: false` and resolve `false` without loading a
   * source-controlled WebView. */
  solveCloudflare(url: string): Promise<boolean>;
}

export default requireNativeModule<NemuAidokuModule>("NemuAidoku");
