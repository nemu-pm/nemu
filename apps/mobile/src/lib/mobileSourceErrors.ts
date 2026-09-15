import type { MobileStrings } from "@/lib/mobileI18n";
import {
  extractCfUrlFromMessage,
  isCloudflareErrorMessage,
  isNetworkSourceError,
  readErrorUrl,
  sanitizeSourceErrorDiagnostic,
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
  | "disabled"
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

/**
 * Stamped onto the runtime detail for a source the user switched off. Same
 * contract as the unsupported marker: it is the machine-readable classifier,
 * so the English sentence behind it is a log line and never the copy a zh/ja
 * user reads.
 */
export const MOBILE_SOURCE_DISABLED_MARKER = "[source-disabled]";

export type MobileSourceErrorPresentation = {
  kind: MobileSourceErrorKind;
  title: string;
  detail: string;
  displayUrl?: string;
};

export type MobileSourceErrorRecoveryAction = {
  type: "open-settings";
  label: string;
  /** Which settings surface actually fixes this failure. */
  focus: "agent" | "sources";
};

function errorMessage(error: unknown): string {
  try {
    return error instanceof Error ? error.message : String(error);
  } catch {
    return "";
  }
}

/**
 * Produces a bounded secondary diagnostic suitable for a user-visible error
 * banner. Stable localized copy must still be supplied separately.
 *
 * The rules themselves are platform-neutral and live in
 * `@nemu/core/sources`; mobile only contributes the marker it stamps onto
 * unsupported-source details.
 */
export function sanitizeMobileErrorDiagnostic(error: unknown): string | null {
  return sanitizeSourceErrorDiagnostic(error, {
    stripMarkers: [
      MOBILE_TACHIYOMI_UNSUPPORTED_MARKER,
      MOBILE_SOURCE_DISABLED_MARKER,
    ],
  });
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

/**
 * Splits a banner `detail` produced by `describeMobileErrorDetail` into the
 * localized description (first line) and the trailing raw diagnostic, so
 * compact surfaces can collapse the diagnostic behind a "technical details"
 * disclosure instead of always rendering it as a third line.
 */
export function splitMobileInlineErrorDetail(detail: string): {
  description: string;
  diagnostic: string | null;
} {
  const separatorIndex = detail.indexOf("\n");
  if (separatorIndex === -1) {
    return { description: detail.trim(), diagnostic: null };
  }
  const description = detail.slice(0, separatorIndex).trim();
  const diagnostic = detail.slice(separatorIndex + 1).trim();
  if (!description) return { description: diagnostic, diagnostic: null };
  return { description, diagnostic: diagnostic || null };
}

export function isMobileTachiyomiUnsupportedError(error: unknown): boolean {
  return errorMessage(error).includes(MOBILE_TACHIYOMI_UNSUPPORTED_MARKER);
}

export function isMobileSourceDisabledError(error: unknown): boolean {
  return errorMessage(error).includes(MOBILE_SOURCE_DISABLED_MARKER);
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

/**
 * Every URL a Cloudflare-classified error can be said to be about, operational
 * or not: the structured field first, then whatever the message text spells
 * out. Display-only — see `extractMobileCloudflareSolveUrl` for why the
 * message form must never reach the solver.
 */
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
 * The operational challenge URL for native verification, or `undefined`.
 *
 * Only a *structured* url is operational: `CloudflareBlockedError.url`, or a
 * sandbox envelope's `errorUrl` that survived
 * `consistentSandboxErrorOrigin`'s url/host agreement check. A URL scraped out
 * of the message text is attacker-controlled prose — a source that simply
 * throws `new Error("Cloudflare blocked: https://attacker.example/x")` would
 * otherwise get a WebView solve started against that host, scoped to its own
 * cookie jar, with no user interaction at all.
 *
 * Query and fragment data are preserved because challenge flows can require
 * them, while non-HTTPS URLs and embedded credentials are rejected before
 * native code sees them. Native networking still performs its own DNS/peer
 * SSRF checks.
 */
export function extractMobileCloudflareSolveUrl(
  error: unknown,
): string | undefined {
  const candidate = readErrorUrl(error);
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

/**
 * The challenge URL to *show*. Unlike the solve url this may come from the
 * message text, because naming a host in a banner starts nothing; the value is
 * redacted (credentials, query and fragment stripped) before it is rendered.
 */
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

  if (isMobileSourceDisabledError(error)) {
    // No secondary diagnostic here: unlike a thrown exception, this is a known
    // app state whose localized copy already says everything there is to say,
    // so the English marker sentence would only be noise.
    return {
      kind: "disabled",
      title: strings.common.sourceDisabled,
      detail: strings.common.sourceDisabledDescription,
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
  if (presentation.kind === "disabled") {
    return {
      type: "open-settings",
      label: strings.common.sourceDisabledAction,
      focus: "sources",
    };
  }
  if (presentation.kind !== "cloudflare") return null;
  return {
    type: "open-settings",
    label: strings.common.openSettings,
    focus: "agent",
  };
}

/**
 * Route for a recovery action's settings surface. Lives next to the action so
 * every notice that renders one sends the user to the control that fixes the
 * failure, rather than to the Nemu Agent card by default.
 */
export function getMobileSourceErrorRecoveryHref(
  action: MobileSourceErrorRecoveryAction,
): "/settings/sources" | "/settings?focus=agent" {
  return action.focus === "sources"
    ? "/settings/sources"
    : "/settings?focus=agent";
}
