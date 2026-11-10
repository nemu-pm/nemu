import { useSyncExternalStore, type ComponentType } from "react";
import * as Sentry from "@sentry/react-native";
import { createChangeListeners } from "./mobileChangeListeners";
import {
  createMobileCrashReportingOptions,
  parseMobileCrashReportsChoice,
  serializeMobileCrashReportsChoice,
} from "./mobileCrashReportingOptions";
import {
  readMobileCrashReportsChoiceText,
  writeMobileCrashReportsChoiceText,
} from "./mobileCrashReportsStorage";

/**
 * Crash and error reporting (Sentry): JS errors, native crashes and a small
 * sample of performance traces, scrubbed by `@nemu/core/crash-reporting`.
 *
 * Off unless the bundle has a DSN (`EXPO_PUBLIC_SENTRY_DSN`, set for
 * production bundles in the root `.env.production`; dev servers, tests and
 * forks without it send nothing) and the user has not turned "Share crash
 * reports" off. The choice is read when the bundle starts, so an opted-out
 * launch never starts the native SDK either.
 */
const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim() || undefined;

const changes = createChangeListeners();
let enabled: boolean | null = null;
let started = false;
let sending = false;
let startedAtBoot = false;

/** The user's choice (on unless turned off). */
export function getMobileCrashReportsEnabled(): boolean {
  if (enabled === null) enabled = parseMobileCrashReportsChoice(readMobileCrashReportsChoiceText());
  return enabled;
}

function start(): void {
  if (started || !DSN) return;
  started = true;
  Sentry.init({
    ...createMobileCrashReportingOptions({
      dsn: DSN,
      development: __DEV__,
      isSending: () => sending,
    }),
    integrations: [
      // Requests get no spans: their URLs name sources and servers.
      Sentry.reactNativeTracingIntegration({
        traceFetch: false,
        traceXHR: false,
        shouldCreateSpanForRequest: () => false,
      }),
    ],
  });
  // An empty user: without one the native SDK fills in its per-install ID
  // as the user of native crash reports. (JS events drop the user entirely.)
  Sentry.setUser({});
}

/** Starts reporting when available and allowed. Called once by the entry file. */
export function startMobileCrashReporting(): boolean {
  if (!DSN || !getMobileCrashReportsEnabled()) return false;
  sending = true;
  start();
  startedAtBoot = started;
  return started;
}

/**
 * The Settings switch. Off stops delivery at once and closes the SDK (the
 * native crash handler included); on starts it again in this session.
 */
export function setMobileCrashReportsEnabled(next: boolean): void {
  enabled = next;
  writeMobileCrashReportsChoiceText(serializeMobileCrashReportsChoice(next));
  changes.notify();
  sending = next && Boolean(DSN);
  if (sending) {
    start();
  } else if (started) {
    started = false;
    void Sentry.close();
  }
}

export function useMobileCrashReportsEnabled(): boolean {
  return useSyncExternalStore(changes.subscribe, getMobileCrashReportsEnabled, getMobileCrashReportsEnabled);
}

/**
 * The root layout, wrapped for touch breadcrumbs and React error capture when
 * reporting started with this launch; unchanged otherwise (no extra view).
 */
export function wrapMobileRootWithCrashReporting<P extends Record<string, unknown>>(
  Root: ComponentType<P>,
): ComponentType<P> {
  if (!startedAtBoot) return Root;
  return Sentry.wrap(Root, {
    touchEventBoundaryProps: {
      // Labels and text of touched elements can name what is being read.
      extractTextFromChildren: false,
      enableRageTapDetection: false,
    },
  });
}

/** Expo Router's error boundary, reporting the error it shows. */
export const wrapMobileErrorBoundaryWithCrashReporting = Sentry.wrapExpoRouterErrorBoundary;
