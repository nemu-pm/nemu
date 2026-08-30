import { NativeModule, registerWebModule } from "expo";
import type {
  NemuAidokuCfEventsMap,
  NemuAidokuHttpClientStatus,
  NemuAidokuHttpFileRequest,
  NemuAidokuHttpFileResponse,
  NemuAidokuHttpRequest,
  NemuAidokuHttpResponse,
  NemuAidokuSandboxStatus,
} from "./NemuAidoku.types";

class NemuAidokuModule extends NativeModule<NemuAidokuCfEventsMap> {
  isAvailable(): boolean {
    return false;
  }

  getHttpClientStatus(): NemuAidokuHttpClientStatus {
    return {
      available: false,
      abiVersion: 0,
      supportsRequestLifecycle: false,
      supportsCloudflareSolver: false,
      platform: "web",
      detail: "Native source networking is not available on web.",
    };
  }

  getAidokuSandboxStatus(): NemuAidokuSandboxStatus {
    return {
      available: false,
      platform: "web",
      detail: "The isolated Android Aidoku runtime is not available on web.",
    };
  }

  prepareHttpRequest(requestId: string): boolean {
    void requestId;
    return false;
  }

  cancelHttpRequest(requestId: string): boolean {
    void requestId;
    return false;
  }

  releaseHttpRequest(requestId: string): void {
    void requestId;
  }

  async downloadHttpFile(
    request: NemuAidokuHttpFileRequest,
  ): Promise<NemuAidokuHttpFileResponse> {
    void request;
    throw new Error("NemuAidoku native HTTP file download is not available on web.");
  }

  async sendHttpRequest(request: NemuAidokuHttpRequest): Promise<NemuAidokuHttpResponse> {
    void request;
    throw new Error("NemuAidoku native HTTP is not available on web.");
  }

  sendHttpRequestSync(request: NemuAidokuHttpRequest): NemuAidokuHttpResponse {
    void request;
    throw new Error("NemuAidoku native HTTP is not available on web.");
  }

  async clearImageMemoryCache(): Promise<void> {}

  async resetMobileSourceProfileAuthState(): Promise<void> {}

  async createAidokuSandboxSession(): Promise<string> {
    throw new Error("The isolated Android Aidoku runtime is not available on web.");
  }

  async executeAidokuSandboxOperation(): Promise<string> {
    throw new Error("The isolated Android Aidoku runtime is not available on web.");
  }

  async processAidokuSandboxImage(): Promise<Uint8Array | null> {
    throw new Error("The isolated Android Aidoku runtime is not available on web.");
  }

  async updateAidokuSandboxSettings(): Promise<string> {
    throw new Error("The isolated Android Aidoku runtime is not available on web.");
  }

  async clearAidokuSandboxSettings(): Promise<string> {
    return '{"status":"cleared"}';
  }

  async disposeAidokuSandboxSession(): Promise<string> {
    return '{"status":"disposed"}';
  }

  async solveCloudflare(url: string): Promise<boolean> {
    void url;
    throw new Error("NemuAidoku Cloudflare solver is not available on web.");
  }
}

export default registerWebModule(NemuAidokuModule, "NemuAidoku");
