import type { MobileToastController } from "@/components/MobileToastContext";
import type { MobileStrings } from "@/lib/mobileI18n";
import { isMobileNetworkSourceError } from "@/lib/mobileSourceErrors";

/** One toast slot: a repeated failure replaces the visible toast. */
export const MOBILE_REFRESH_SOURCES_TOAST_ID = "refresh-sources";

/**
 * A refresh that was superseded or aborted (a foreground stale-check reload
 * aborts the user's run; the scheduler rejects with `AbortError`). Not a
 * failure the user needs to hear about: the superseding run reports itself.
 * Matches by name so DOMException-style aborts count too.
 */
export function isMobileRefreshSourcesCancellation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  return (error as { name?: unknown }).name === "AbortError";
}

/** The toast title for a failed refresh. Never technical detail. */
export function getMobileRefreshSourcesErrorTitle(
  error: unknown,
  strings: Pick<MobileStrings, "feedback">,
): string {
  return isMobileNetworkSourceError(error)
    ? strings.feedback.refreshSourcesFailedNetwork
    : strings.feedback.refreshSourcesFailed;
}

/**
 * Shows the refresh-sources failure toast (danger, Retry, 6s). Returns false
 * without showing anything for a cancellation.
 */
export function showMobileRefreshSourcesErrorToast({
  toast,
  strings,
  error,
  onRetry,
}: {
  toast: Pick<MobileToastController, "show">;
  strings: Pick<MobileStrings, "feedback" | "common">;
  error: unknown;
  onRetry: () => void;
}): boolean {
  if (isMobileRefreshSourcesCancellation(error)) return false;
  toast.show({
    id: MOBILE_REFRESH_SOURCES_TOAST_ID,
    tone: "danger",
    title: getMobileRefreshSourcesErrorTitle(error, strings),
    action: { label: strings.common.retry, onPress: onRetry },
    duration: "long",
  });
  return true;
}
