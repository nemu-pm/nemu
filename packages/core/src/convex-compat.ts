/**
 * A Convex call the deployed backend does not know yet: the function is
 * missing ("Could not find public function"), or its validator rejects an
 * argument this client added (an extra field, a new argument). Clients newer
 * than the backend treat this as "feature not available yet", never as a
 * failure to report or retry.
 */
export function isConvexFeatureUnavailableError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  return (
    message.includes("Could not find public function") ||
    message.includes("ArgumentValidationError") ||
    message.includes("Object contains extra field")
  );
}
