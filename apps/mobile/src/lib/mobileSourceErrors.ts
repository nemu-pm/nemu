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
 * An exception message is almost always untranslated English produced by a
 * source package, the runtime, or a platform API. It must never be the first
 * thing a zh/ja user reads. Every catch site in the app therefore follows one
 * pattern:
 *
 *   1. the localized string is the primary copy, and
 *   2. a bounded, sanitized diagnostic is appended by
 *      `describeMobileErrorDetail` as a secondary line, only where the surface
 *      has room for it (`MobileSourceErrorNotice` / `MobileInlineErrorBanner`
 *      both do).
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
  displayUrl?: string;
};

export type MobileSourceErrorRecoveryAction = {
  type: "open-settings";
  label: string;
};

function errorMessage(error: unknown): string {
  try {
    return error instanceof Error ? error.message : String(error);
  } catch {
    return "";
  }
}

const MOBILE_ERROR_DIAGNOSTIC_MAX_LENGTH = 500;

function sanitizeDiagnosticUrl(match: string): string {
  const trailing = match.match(/[),.;!?]+$/)?.[0] ?? "";
  const rawUrl = trailing ? match.slice(0, -trailing.length) : match;
  try {
    const url = new URL(rawUrl);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return `${url.toString()}${trailing}`;
  } catch {
    return `${rawUrl.replace(/[?#].*$/, "")}${trailing}`;
  }
}

function replaceUnsafeControlCharacters(value: string): string {
  return Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    const unsafe =
      (code <= 0x1f && code !== 0x09 && code !== 0x0a && code !== 0x0d) ||
      code === 0x7f;
    return unsafe ? " " : character;
  }).join("");
}

/**
 * Produces a bounded secondary diagnostic suitable for a user-visible error
 * banner. Stable localized copy must still be supplied separately.
 */
export function sanitizeMobileErrorDiagnostic(error: unknown): string | null {
  let detail = errorMessage(error)
    .replace(MOBILE_TACHIYOMI_UNSUPPORTED_MARKER, "")
    .trim();
  if (!detail || detail === "[object Object]") return null;

  detail = replaceUnsafeControlCharacters(
    detail
      .replace(/\bhttps?:\/\/[^\s<>"']+/gi, sanitizeDiagnosticUrl)
      .replace(
        /\b(cookie|set-cookie|authorization|proxy-authorization)\b\s*:\s*[^\r\n]+/gi,
        "$1: [redacted]",
      )
      .replace(/\b(bearer|basic)\s+[A-Za-z0-9._~+/-]+=*/gi, "$1 [redacted]")
      .replace(
        /\b(password|passwd|access[_-]?token|refresh[_-]?token|id[_-]?token|csrf[_-]?token|token|api[_-]?key|client[_-]?secret|secret|code[_-]?verifier|session)\b(\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
        "$1$2[redacted]",
      ),
  )
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!detail) return null;
  return detail.length > MOBILE_ERROR_DIAGNOSTIC_MAX_LENGTH
    ? `${detail.slice(0, MOBILE_ERROR_DIAGNOSTIC_MAX_LENGTH - 1).trimEnd()}…`
    : detail;
}

/**
 * The single join used by the error-copy contract above: localized copy first,
 * sanitized diagnostic second. Returns the localized string untouched when
 * there is no extra information to show.
 */
export function describeMobileErrorDetail(
  error: unknown,
  localizedDetail: string,
): string {
  const diagnostic = sanitizeMobileErrorDiagnostic(error);
  if (!diagnostic || diagnostic === localizedDetail) return localizedDetail;
  return `${localizedDetail}\n${diagnostic}`;
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

function mobileCloudflareUrlCandidate(error: unknown): string | undefined {
  return readErrorUrl(error) ?? extractCfUrlFromMessage(errorMessage(error));
}

function parseMobileCloudflareHttpsUrl(
  value: string,
): { candidate: string; url: URL } | null {
  const candidate = value.trim();
  const hasUnsafeCharacter = Array.from(candidate).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x20 || code === 0x7f || character === "\\";
  });
  if (!candidate || hasUnsafeCharacter) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" && Boolean(url.hostname)
      ? { candidate, url }
      : null;
  } catch {
    return null;
  }
}

export function validateMobileCloudflareOperationalUrl(
  value: string,
): string | undefined {
  const parsed = parseMobileCloudflareHttpsUrl(value);
  if (!parsed || parsed.url.username || parsed.url.password) return undefined;
  return parsed.candidate;
}

/**
 * Returns the operational challenge URL for native verification. Query and
 * fragment data are preserved because challenge flows can require them, while
 * non-HTTPS URLs and embedded credentials are rejected before native code sees
 * them. Native networking still performs its own DNS/peer SSRF checks.
 */
export function extractMobileCloudflareUrl(error: unknown): string | undefined {
  const candidate = mobileCloudflareUrlCandidate(error);
  return candidate
    ? validateMobileCloudflareOperationalUrl(candidate)
    : undefined;
}

/** Redacts an already-extracted challenge URL for user-visible copy. */
export function redactMobileCloudflareUrlForDisplay(
  value: string,
): string | undefined {
  const parsed = parseMobileCloudflareHttpsUrl(value);
  if (!parsed) return undefined;
  const { url } = parsed;
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  return url.href;
}

export function extractMobileCloudflareDisplayUrl(
  error: unknown,
): string | undefined {
  const candidate = mobileCloudflareUrlCandidate(error);
  return candidate
    ? redactMobileCloudflareUrlForDisplay(candidate)
    : undefined;
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
      displayUrl: extractMobileCloudflareDisplayUrl(error),
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
  // title. A sanitized diagnostic stays reachable through the full detail.
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
