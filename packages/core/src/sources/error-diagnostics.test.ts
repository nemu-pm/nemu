import { describe, expect, test } from "bun:test";
import {
  SOURCE_ERROR_DIAGNOSTIC_MAX_LENGTH,
  sanitizeSourceErrorDiagnostic,
} from "./error-diagnostics";

describe("sanitizeSourceErrorDiagnostic", () => {
  test("sanitizes optional user-visible diagnostics", () => {
    const detail = sanitizeSourceErrorDiagnostic(
      new Error(
        "Request https://user:pass@example.test/path?access_token=secret#fragment failed; Authorization: Bearer abc.def\npassword=hunter2 token=plain-token api_key=plain-key",
      ),
    );

    expect(detail).toContain("https://example.test/path");
    expect(detail).toContain("Authorization: [redacted]");
    expect(detail).toContain("password=[redacted]");
    expect(detail).not.toContain("user:pass");
    expect(detail).not.toContain("access_token=secret");
    expect(detail).not.toContain("abc.def");
    expect(detail).not.toContain("hunter2");
    expect(detail).not.toContain("plain-token");
    expect(detail).not.toContain("plain-key");
  });

  test("redacts cookie headers and unparsable URLs", () => {
    const detail = sanitizeSourceErrorDiagnostic(
      "Cookie: cf_clearance=abc\nhttp://[bad url/path?token=1 refused",
    );

    expect(detail).toContain("Cookie: [redacted]");
    expect(detail).not.toContain("cf_clearance=abc");
    expect(detail).not.toContain("token=1");
  });

  test("bounds optional user-visible diagnostics", () => {
    const detail = sanitizeSourceErrorDiagnostic(new Error("x".repeat(800)));

    expect(detail?.length).toBe(SOURCE_ERROR_DIAGNOSTIC_MAX_LENGTH);
    expect(detail?.endsWith("…")).toBe(true);
  });

  test("honours a caller-supplied length cap", () => {
    const detail = sanitizeSourceErrorDiagnostic(new Error("y".repeat(80)), {
      maxLength: 20,
    });

    expect(detail?.length).toBe(20);
    expect(detail?.endsWith("…")).toBe(true);
  });

  test("scrubs control characters but keeps tabs and newlines", () => {
    const detail = sanitizeSourceErrorDiagnostic(
      "line\u0001one\tkept\nline\u0007two",
    );

    expect(detail).toBe("line one\tkept\nline two");
  });

  test("collapses runs of blank lines", () => {
    expect(sanitizeSourceErrorDiagnostic("a\n\n\n\n\nb")).toBe("a\n\nb");
  });

  test("strips caller-supplied platform markers", () => {
    expect(
      sanitizeSourceErrorDiagnostic("[unsupported] Runtime missing.", {
        stripMarkers: ["[unsupported]"],
      }),
    ).toBe("Runtime missing.");
    expect(
      sanitizeSourceErrorDiagnostic("[unsupported]", {
        stripMarkers: ["[unsupported]"],
      }),
    ).toBeNull();
  });

  test("ignores empty and uninformative values", () => {
    expect(sanitizeSourceErrorDiagnostic(new Error("   "))).toBeNull();
    expect(sanitizeSourceErrorDiagnostic({})).toBeNull();
  });

  test("ignores malformed thrown values that cannot be stringified", () => {
    expect(
      sanitizeSourceErrorDiagnostic({
        toString() {
          throw new Error("stringification failed");
        },
      }),
    ).toBeNull();
  });
});
