const SAFE_ERROR_CATEGORIES = new Set([
  "AbortError",
  "AggregateError",
  "DataError",
  "Error",
  "InvalidStateError",
  "NetworkError",
  "NotAllowedError",
  "NotFoundError",
  "QuotaExceededError",
  "RangeError",
  "ReferenceError",
  "SecurityError",
  "SyntaxError",
  "TimeoutError",
  "TypeError",
]);

/**
 * Return a small, non-user-controlled category suitable for operational logs.
 * Error messages are deliberately excluded because browser/storage/source
 * failures can embed profile identifiers, request URLs, or credentials.
 */
export function safeErrorCategory(error: unknown): string {
  try {
    if (!(error instanceof Error)) return "UnknownError";
    const name = error.name;
    return typeof name === "string" && SAFE_ERROR_CATEGORIES.has(name)
      ? name
      : "Error";
  } catch {
    return "UnknownError";
  }
}
