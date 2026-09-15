/**
 * Platform-neutral sanitizer for source-controlled error text.
 *
 * An exception message from a source package, a source runtime, or a platform
 * API is untrusted, unbounded, untranslated text. Showing it verbatim lets a
 * source paint an arbitrarily long wall of text into an error surface, smuggle
 * control characters into a rendered line, and echo back whatever credentials
 * happened to be in the failing request.
 *
 * Every surface therefore keeps a stable localized string as its primary copy
 * and passes the raw text through here for the optional secondary diagnostic.
 * The rules (originally mobile's `sanitizeMobileErrorDiagnostic`) are:
 *
 * - a hard length cap, with an ellipsis marking the truncation,
 * - control characters replaced with spaces (tab/CR/LF survive),
 * - URLs stripped of credentials, query and fragment,
 * - cookie / authorization headers, `Bearer`/`Basic` values and common
 *   secret-shaped `key=value` pairs redacted.
 */

/** Default hard cap on a user-visible diagnostic, including the ellipsis. */
export const SOURCE_ERROR_DIAGNOSTIC_MAX_LENGTH = 500;

export type SanitizeSourceErrorDiagnosticOptions = {
  /** Hard cap on the returned string, including the ellipsis. */
  maxLength?: number;
  /**
   * Literal platform markers removed before sanitizing. Marker constants stay
   * with the platform that stamps them; only the removal happens here.
   */
  stripMarkers?: readonly string[];
};

function errorMessage(error: unknown): string {
  try {
    return error instanceof Error ? error.message : String(error);
  } catch {
    return "";
  }
}

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
 * surface, or `null` when there is nothing worth showing. Stable localized
 * copy must still be supplied separately as the primary line.
 */
export function sanitizeSourceErrorDiagnostic(
  error: unknown,
  options: SanitizeSourceErrorDiagnosticOptions = {},
): string | null {
  const maxLength = options.maxLength ?? SOURCE_ERROR_DIAGNOSTIC_MAX_LENGTH;
  let detail = errorMessage(error);
  for (const marker of options.stripMarkers ?? []) {
    if (marker) detail = detail.replace(marker, "");
  }
  detail = detail.trim();
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
  return detail.length > maxLength
    ? `${detail.slice(0, maxLength - 1).trimEnd()}…`
    : detail;
}
