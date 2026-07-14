import type { MobileStrings } from "@/lib/mobileI18n";
import {
  extractCfUrlFromMessage,
  isCloudflareErrorMessage,
  isNetworkSourceError,
  readErrorUrl,
} from "@nemu/core/sources";

export type MobileSourceErrorKind =
  | "cloudflare"
  | "network"
  | "runtime"
  | "source";

export type MobileSourceErrorPresentation = {
  kind: MobileSourceErrorKind;
  title: string;
  detail: string;
  url?: string;
};

export type MobileSourceErrorRecoveryAction = {
  type: "open-settings";
  label: string;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isMobileCloudflareError(error: unknown): boolean {
  // Mobile keeps a lenient wrapper: the shared message primitive + the
  // `CloudflareBlockedError` name check (instanceof-gated), but the message is
  // derived via `errorMessage()` so a plain string CAN be classified as
  // Cloudflare (matching prior mobile behavior).
  if (error instanceof Error && error.name === "CloudflareBlockedError") {
    return true;
  }
  return isCloudflareErrorMessage(errorMessage(error));
}

export function extractMobileCloudflareUrl(error: unknown): string | undefined {
  const url = readErrorUrl(error);
  if (url) return url;
  return extractCfUrlFromMessage(errorMessage(error));
}

export function isMobileNetworkSourceError(error: unknown): boolean {
  return isNetworkSourceError(error);
}

export function isMobileRuntimeUnavailableError(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase();
  return (
    message.includes("webassembly") ||
    message.includes("react native javascript engine") ||
    message.includes("react native source bridge") ||
    message.includes("hermes")
  );
}

export function getMobileRuntimeUnavailableDetail(
  candidates: ReadonlyArray<string | null | undefined>,
): string | null {
  for (const candidate of candidates) {
    if (candidate && isMobileRuntimeUnavailableError(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function getMobileSourceErrorPresentation(
  error: unknown,
  strings: Pick<MobileStrings, "common">,
): MobileSourceErrorPresentation {
  if (isMobileCloudflareError(error)) {
    return {
      kind: "cloudflare",
      title: strings.common.sourceCloudflareBlocked,
      detail: strings.common.sourceCloudflareBlockedDescription,
      url: extractMobileCloudflareUrl(error),
    };
  }

  if (isMobileRuntimeUnavailableError(error)) {
    return {
      kind: "runtime",
      title: strings.common.sourceRuntimeUnavailable,
      detail: strings.common.sourceRuntimeUnavailableDescription,
    };
  }

  if (isMobileNetworkSourceError(error)) {
    return {
      kind: "network",
      title: strings.common.sourceNetworkError,
      detail: strings.common.sourceNetworkErrorDescription,
    };
  }

  return {
    kind: "source",
    title: strings.common.sourceError,
    detail: errorMessage(error),
  };
}

export function getMobileSourceErrorSummary(
  error: unknown,
  strings: Pick<MobileStrings, "common">,
): string {
  const presentation = getMobileSourceErrorPresentation(error, strings);
  return presentation.kind === "source" ? presentation.detail : presentation.title;
}

export function getMobileSourceErrorRecoveryAction(
  presentation: MobileSourceErrorPresentation,
  strings: Pick<MobileStrings, "common">,
): MobileSourceErrorRecoveryAction | null {
  if (presentation.kind !== "cloudflare") return null;
  return {
    type: "open-settings",
    label: strings.common.openSettings,
  };
}
