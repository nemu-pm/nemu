import * as Sentry from "@sentry/react"
import {
  scrubCrashReportBreadcrumb,
  scrubCrashReportEvent,
  scrubCrashReportSpan,
  type CrashReportScrubOptions,
} from "@nemu/core/crash-reporting"

/**
 * Crash and error reporting (Sentry) for the web app.
 *
 * Off unless a DSN is configured (`VITE_SENTRY_DSN`, set for production builds
 * in `.env.production`; dev servers, tests and forks without it send nothing),
 * the build is a production build, and the user has not turned "Share crash
 * reports" off in Settings. Every event, breadcrumb and span goes through the
 * shared privacy scrubber (`@nemu/core/crash-reporting`): no user, no IP, no
 * cookies, and no URL that names a source, server or title.
 */

const STORAGE_KEY = "nemu:crash-reports"

const DSN = import.meta.env.VITE_SENTRY_DSN?.trim() || undefined

/** Whether this build can report at all (DSN present, production build). */
export const crashReportingAvailable = Boolean(DSN) && import.meta.env.PROD

let started = false
let sending = false
let router: unknown = null

function scrubOptions(): CrashReportScrubOptions {
  return typeof window === "undefined" ? {} : { pageHosts: [window.location.host] }
}

/** The stored choice; on unless the user turned it off. */
export function readCrashReportsEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off"
  } catch {
    return true
  }
}

function routerTracing(tracedRouter: unknown) {
  // Route templates (`/sources/$registryId/…`) name pages, never content.
  return Sentry.tanstackRouterBrowserTracingIntegration(tracedRouter, {
    // Images and scripts mostly come from sources: their timing is not worth
    // sending even with the URL redacted, and requests get no spans at all.
    ignoreResourceSpans: ["resource.img", "resource.other", "resource.script"],
    shouldCreateSpanForRequest: () => false,
  })
}

function start(): void {
  if (started) return
  started = true
  Sentry.init({
    dsn: DSN,
    release: import.meta.env.VITE_SENTRY_RELEASE || undefined,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || "production",
    // SDK v11 replaced `sendDefaultPii` with per-category switches whose
    // defaults collect a lot: no user info (this also stops Sentry inferring
    // the IP address), cookies, headers, query strings, bodies or local
    // variables.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
    },
    // Fetch errors keep their message ("Failed to fetch"); the default appends
    // the host, which can name a source or server.
    enhanceFetchErrorMessages: false,
    // No Session Replay, profiling, logs or user feedback: only errors and a
    // small sample of performance traces.
    tracesSampleRate: 0.05,
    // Never add trace headers to requests (sources and servers are third
    // parties; nemu's own backends don't read them).
    tracePropagationTargets: [],
    // Whole transactions, not streamed spans, so the consent check and the
    // scrubber see every trace in one place (beforeSendTransaction), as on
    // mobile.
    traceLifecycle: "static",
    integrations: router ? [routerTracing(router)] : [],
    beforeSend(event) {
      if (!sending) return null
      return scrubCrashReportEvent(event, scrubOptions())
    },
    beforeSendTransaction(event) {
      if (!sending) return null
      return scrubCrashReportEvent(event, scrubOptions())
    },
    beforeSendSpan: Sentry.withStaticSpan((span) => scrubCrashReportSpan(span, scrubOptions())),
    beforeBreadcrumb(breadcrumb) {
      return scrubCrashReportBreadcrumb(breadcrumb, scrubOptions())
    },
  })
}

/**
 * Starts reporting when available and allowed. Call once, before rendering,
 * with the app's TanStack Router so traces carry route templates.
 */
export function initCrashReporting(appRouter: unknown): void {
  router = appRouter
  if (!crashReportingAvailable || !readCrashReportsEnabled()) return
  sending = true
  start()
}

/**
 * The Settings switch. Turning it off stops sending at once (queued events
 * are dropped) and closes the client, sessions included; turning it on starts
 * reporting again in this session.
 */
export function setCrashReportsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off")
  } catch {
    // Ignore localStorage errors
  }
  sending = enabled && crashReportingAvailable
  if (sending) {
    start()
  } else if (started) {
    started = false
    void Sentry.close()
  }
}
