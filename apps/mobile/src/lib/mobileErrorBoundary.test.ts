import { describe, expect, test } from "bun:test";
import {
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

  test("resolves provider-free error boundary language from device locales", () => {
    expect(resolveMobileErrorBoundaryLanguage("zh-Hans-CN")).toBe("zh");
    expect(resolveMobileErrorBoundaryLanguage("ja_JP")).toBe("ja");
    expect(resolveMobileErrorBoundaryLanguage("fr-FR")).toBe("en");
    expect(resolveMobileErrorBoundaryLanguage(null)).toBe("en");
  });
});
