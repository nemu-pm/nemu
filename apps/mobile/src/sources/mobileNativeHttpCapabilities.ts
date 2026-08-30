import type { NemuAidokuHttpClientStatus } from "../../modules/nemu-aidoku/src/NemuAidoku.types";

export const MOBILE_NATIVE_HTTP_REQUIRED_ABI_VERSION = 6;

type MobileNativeHttpModuleCapabilities = {
  prepareHttpRequest?: unknown;
  cancelHttpRequest?: unknown;
  releaseHttpRequest?: unknown;
  downloadHttpFile?: unknown;
  sendHttpRequest?: unknown;
  sendHttpRequestSync?: unknown;
  resetMobileSourceProfileAuthState?: unknown;
};

const STALE_NATIVE_HTTP_DETAIL =
  "The installed React Native source bridge is out of date. Rebuild or reinstall Nemu, then try the source again.";

export function resolveMobileNativeHttpCapabilityStatus(
  reportedStatus: NemuAidokuHttpClientStatus,
  module: MobileNativeHttpModuleCapabilities,
): NemuAidokuHttpClientStatus {
  if (!reportedStatus.available) return reportedStatus;

  const hasRequiredMethods = [
    module.prepareHttpRequest,
    module.cancelHttpRequest,
    module.releaseHttpRequest,
    module.downloadHttpFile,
    module.sendHttpRequest,
    module.sendHttpRequestSync,
    module.resetMobileSourceProfileAuthState,
  ].every((method) => typeof method === "function");
  const abiVersion = reportedStatus.abiVersion;
  const hasCompatibleAbi =
    Number.isSafeInteger(abiVersion) &&
    abiVersion! >= MOBILE_NATIVE_HTTP_REQUIRED_ABI_VERSION;
  const advertisesLifecycle =
    reportedStatus.supportsRequestLifecycle !== false;

  if (hasRequiredMethods && hasCompatibleAbi && advertisesLifecycle) {
    return {
      ...reportedStatus,
      supportsRequestLifecycle: true,
    };
  }

  return {
    ...reportedStatus,
    available: false,
    supportsRequestLifecycle: false,
    detail: STALE_NATIVE_HTTP_DETAIL,
  };
}

export function assertMobileNativeHttpCapability(
  status: NemuAidokuHttpClientStatus,
): void {
  if (status.available) return;
  throw new Error(
    status.detail ||
      "The React Native source bridge is not available in this build.",
  );
}
