import type { ReactNativeOptions } from "@sentry/react-native";
import {
  scrubCrashReportBreadcrumb,
  scrubCrashReportEvent,
  scrubCrashReportSpan,
} from "@nemu/core/crash-reporting";

/** Share of sessions that send a performance trace (errors are always sent). */
export const MOBILE_CRASH_REPORTS_TRACES_SAMPLE_RATE = 0.05;

/** The stored "Share crash reports" choice: on unless turned off. */
export function parseMobileCrashReportsChoice(text: string | null | undefined): boolean {
  return text?.trim() !== "off";
}

export function serializeMobileCrashReportsChoice(enabled: boolean): string {
  return enabled ? "on" : "off";
}

/**
 * Sentry options for the app, without integrations (those need the SDK
 * itself). Privacy first: no PII, no screenshots, view hierarchy, replay,
 * profiling, logs or sessions, no trace headers on any request, no native
 * network or UI breadcrumbs (they would carry source URLs and titles into
 * native crash reports), and every JS event, breadcrumb and span goes
 * through the shared scrubber. `isSending` turns delivery off at once when the user opts out.
 *
 * `release` and `dist` are left to the native SDK, which reads them from the
 * app bundle: `pm.nemu@<version>+<build>` with dist `<build>` on iOS
 * (`versionName+versionCode` on Android), the same names the Xcode and Gradle
 * upload steps give the source maps and debug files.
 */
export function createMobileCrashReportingOptions({
  dsn,
  development,
  isSending,
}: {
  dsn: string;
  development: boolean;
  isSending: () => boolean;
}): ReactNativeOptions {
  return {
    dsn,
    environment: development ? "development" : "production",
    sendDefaultPii: false,
    tracesSampleRate: MOBILE_CRASH_REPORTS_TRACES_SAMPLE_RATE,
    tracePropagationTargets: [],
    enableLogs: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    reportAccessibilityIdentifier: false,
    enableCaptureFailedRequests: false,
    enableNetworkBreadcrumbs: false,
    // The native iOS SDK's own breadcrumbs include view controller titles
    // (a title on detail and reader screens) and go into native crash reports,
    // which never pass through the JS scrubber.
    enableAutoBreadcrumbTracking: false,
    // Release-health sessions carry the native SDK's per-install ID.
    enableAutoSessionTracking: false,
    enableUserInteractionTracing: false,
    // Keep "Network request failed" as is; the default appends the host,
    // which can name a source or server.
    enhanceFetchErrorMessages: false,
    beforeSend: (event) => (isSending() ? scrubCrashReportEvent(event) : null),
    beforeSendTransaction: (event) => (isSending() ? scrubCrashReportEvent(event) : null),
    beforeSendSpan: (span) => scrubCrashReportSpan(span),
    beforeBreadcrumb: (breadcrumb) => scrubCrashReportBreadcrumb(breadcrumb),
  };
}
