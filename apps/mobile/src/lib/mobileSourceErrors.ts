import type { MobileStrings } from "@/lib/mobileI18n";
import {
  extractCfUrlFromMessage,
  isCloudflareErrorMessage,
  isNetworkSourceError,
  readErrorUrl,
} from "@nemu/core/sources";

/**
 * Mobile error-copy contract
 * --------------------------
 * A raw exception message is almost always untranslated English produced by a
 * source package, the runtime, or a platform API. It must never be the first
 * thing a zh/ja user reads. Every catch site in the app therefore follows one
 * pattern:
 *
 *   1. the localized string is the primary copy, and
 *   2. the raw message is appended by `describeMobileErrorDetail` as a
 *      secondary line, only where the surface has room for a detail line
 *      (`MobileSourceErrorNotice` / `MobileInlineErrorBanner` both do).
 *
 * Use `describeMobileErrorDetail(error, strings.x.somethingFailedDetail)`
 * instead of `error instanceof Error ? error.message : strings.x...`.
 */
export type MobileSourceErrorKind =
  | "cloudflare"
  | "network"
  | "runtime"
  | "unsupported"
  | "source";

/**
 * Stamped onto runtime details that describe a source this build cannot run at
 * all. The presentation layer swaps in localized copy and keeps the technical
 * sentence as the secondary detail line.
 */
export const MOBILE_TACHIYOMI_UNSUPPORTED_MARKER = "[tachiyomi-unsupported]";

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

/**
 * The single join used by the error-copy contract above: localized copy first,
 * raw exception text second. Returns the localized string untouched when there
 * is no extra information to show.
 */
export function describeMobileErrorDetail(
  error: unknown,
  localizedDetail: string,
): string {
  const raw = errorMessage(error)
    .replace(MOBILE_TACHIYOMI_UNSUPPORTED_MARKER, "")
    .trim();
  if (!raw || raw === localizedDetail) return localizedDetail;
  return `${localizedDetail}\n${raw}`;
}

export function isMobileTachiyomiUnsupportedError(error: unknown): boolean {
  return errorMessage(error).includes(MOBILE_TACHIYOMI_UNSUPPORTED_MARKER);
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

  if (isMobileTachiyomiUnsupportedError(error)) {
    return {
      kind: "unsupported",
      title: strings.common.sourceUnsupported,
      detail: describeMobileErrorDetail(
        error,
        strings.common.sourceUnsupportedTachiyomiDescription,
      ),
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
    detail: describeMobileErrorDetail(
      error,
      strings.common.sourceErrorDescription,
    ),
  };
}

export function getMobileSourceErrorSummary(
  error: unknown,
  strings: Pick<MobileStrings, "common">,
): string {
  // Compact rows only have room for one line, so they always get the localized
  // title. The raw text stays reachable through the full presentation detail.
  return getMobileSourceErrorPresentation(error, strings).title;
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
