import { describe, expect, test } from "bun:test";
import type { ReactNativeOptions } from "@sentry/react-native";
import {
  MOBILE_CRASH_REPORTS_TRACES_SAMPLE_RATE,
  createMobileCrashReportingOptions,
  parseMobileCrashReportsChoice,
  serializeMobileCrashReportsChoice,
} from "./mobileCrashReportingOptions";

const DSN = "https://key@o1.ingest.us.sentry.io/2";

type ErrorEvent = Parameters<NonNullable<ReactNativeOptions["beforeSend"]>>[0];

describe("crash reports choice", () => {
  test("is on unless turned off", () => {
    expect(parseMobileCrashReportsChoice(null)).toBe(true);
    expect(parseMobileCrashReportsChoice("")).toBe(true);
    expect(parseMobileCrashReportsChoice("on")).toBe(true);
    expect(parseMobileCrashReportsChoice("off\n")).toBe(false);
    expect(parseMobileCrashReportsChoice(serializeMobileCrashReportsChoice(false))).toBe(false);
    expect(parseMobileCrashReportsChoice(serializeMobileCrashReportsChoice(true))).toBe(true);
  });
});

describe("Sentry options", () => {
  test("collect nothing beyond scrubbed errors and a small trace sample", () => {
    const options = createMobileCrashReportingOptions({
      dsn: DSN,
      development: false,
      isSending: () => true,
    });
    expect(options).toMatchObject({
      dsn: DSN,
      environment: "production",
      sendDefaultPii: false,
      tracesSampleRate: MOBILE_CRASH_REPORTS_TRACES_SAMPLE_RATE,
      tracePropagationTargets: [],
      enableLogs: false,
      attachScreenshot: false,
      attachViewHierarchy: false,
      reportAccessibilityIdentifier: false,
      enableCaptureFailedRequests: false,
      enableNetworkBreadcrumbs: false,
      enableAutoBreadcrumbTracking: false,
      enableAutoSessionTracking: false,
      enableUserInteractionTracing: false,
      enhanceFetchErrorMessages: false,
    });
    expect(MOBILE_CRASH_REPORTS_TRACES_SAMPLE_RATE).toBeLessThanOrEqual(0.05);
    for (const key of [
      "profilesSampleRate",
      "replaysSessionSampleRate",
      "replaysOnErrorSampleRate",
      "release",
      "dist",
    ]) {
      expect(key in options).toBe(false);
    }
    expect(
      createMobileCrashReportingOptions({ dsn: DSN, development: true, isSending: () => true })
        .environment,
    ).toBe("development");
  });

  test("scrub events and drop them once the user opts out", () => {
    let sending = true;
    const options = createMobileCrashReportingOptions({
      dsn: DSN,
      development: false,
      isSending: () => sending,
    });
    const event = (): ErrorEvent => ({
      type: undefined,
      message: "GET http://192.168.1.4:4567/api/v1/manga/3?token=x failed",
      user: { id: "u" },
    });
    const sent = options.beforeSend!(event(), {}) as ErrorEvent;
    expect(sent.message).toBe("GET http://[redacted] failed");
    expect(sent.user).toBeUndefined();
    sending = false;
    expect(options.beforeSend!(event(), {})).toBeNull();
    expect(
      options.beforeBreadcrumb!({ category: "console", level: "log", message: "x" }, {}),
    ).toBeNull();
  });
});
