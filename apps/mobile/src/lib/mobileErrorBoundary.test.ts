import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  firstMobileSystemLocale,
  formatMobileErrorLog,
  formatMobileErrorSummary,
  resolveMobileErrorBoundaryLanguage,
} from "./mobileErrorBoundary";

describe("mobile error boundary helpers", () => {
  test("summarizes route errors with name and message", () => {
    expect(formatMobileErrorSummary(new TypeError("Native bridge crashed"))).toBe(
      "TypeError: Native bridge crashed",
    );
  });

  test("summarizes errors without blank messages", () => {
    expect(formatMobileErrorSummary(new Error(""))).toBe("Error");
  });

  test("formats a copyable mobile error report", () => {
    const error = new Error("WASM trap");
    error.stack = "Error: WASM trap\n    at SourceRuntime";

    expect(
      formatMobileErrorLog({
        error,
        routePath: "/sources/a/b/c",
        timestamp: "2026-06-07T12:00:00.000Z",
        componentStack: "in ReaderScreen",
      }),
    ).toBe(
      [
        "Timestamp: 2026-06-07T12:00:00.000Z",
        "Route: /sources/a/b/c",
        "",
        "Error: Error",
        "Message: WASM trap",
        "",
        "Stack Trace:",
        "Error: WASM trap\n    at SourceRuntime",
        "",
        "Component Stack:",
        "in ReaderScreen",
      ].join("\n"),
    );
  });

  test("redacts secrets from displayed and copied crash diagnostics", () => {
    const error = new Error(
      "Request https://example.test/path?token=secret failed; password=hunter2",
    );
    error.name = "AuthError password=name-secret";
    error.stack = `Error: ${error.message}\n    at ReaderScreen`;
    const report = formatMobileErrorLog({
      error,
      routePath: "/sources/item?session=private",
      timestamp: "2026-06-07T12:00:00.000Z",
    });

    expect(formatMobileErrorSummary(error)).not.toContain("secret");
    expect(report).not.toContain("secret");
    expect(report).not.toContain("hunter2");
    expect(report).not.toContain("name-secret");
    expect(report).not.toContain("private");
    expect(report).toContain("[redacted]");
  });

  test("resolves provider-free error boundary language from device locales", () => {
    expect(resolveMobileErrorBoundaryLanguage("zh-Hans-CN")).toBe("zh");
    expect(resolveMobileErrorBoundaryLanguage("ja_JP")).toBe("ja");
    expect(resolveMobileErrorBoundaryLanguage("fr-FR")).toBe("en");
    expect(resolveMobileErrorBoundaryLanguage(null)).toBe("en");
  });

  test("system locale falls back past a missing Intl to the platform locale", () => {
    const noIntl = () => {
      // Android's ICU-less JavaScriptCore: `Intl` is not defined at all.
      throw new ReferenceError("Can't find variable: Intl");
    };

    expect(firstMobileSystemLocale([noIntl, () => "ja-JP"])).toBe("ja-JP");
    expect(firstMobileSystemLocale([() => "zh-Hans-CN", () => "ja-JP"])).toBe(
      "zh-Hans-CN",
    );
    expect(firstMobileSystemLocale([() => " ", () => undefined, () => "en-US"])).toBe(
      "en-US",
    );
    expect(firstMobileSystemLocale([noIntl, () => null])).toBeUndefined();
    expect(
      resolveMobileErrorBoundaryLanguage(firstMobileSystemLocale([noIntl, () => "ja-JP"])),
    ).toBe("ja");
  });

  test("pre-context screens read the platform locale when Intl is missing", () => {
    const read = (file: string) =>
      readFileSync(path.join(import.meta.dir, file), "utf8");
    const helper = read("mobileSystemLocale.ts");

    expect(helper).toContain("() => Intl.DateTimeFormat().resolvedOptions().locale,");
    expect(helper).toContain("() => getLocales()[0]?.languageTag,");
    for (const screen of [
      "../components/MobileErrorBoundaryScreen.tsx",
      "../components/MobilePendingDataCleanupScreen.tsx",
    ]) {
      const source = read(screen);
      expect(source).toContain("resolveMobileErrorBoundaryLanguage(mobileSystemLocale())");
      expect(source).not.toContain("Intl.");
    }
  });
});
