import { describe, expect, test } from "bun:test";
import { getMobileStrings } from "./mobileI18n";
import {
  MOBILE_TACHIYOMI_UNSUPPORTED_MARKER,
  describeMobileErrorDetail,
  extractMobileCloudflareDisplayUrl,
  extractMobileCloudflareUrl,
  getMobileRuntimeUnavailableDetail,
  getMobileSourceErrorRecoveryAction,
  getMobileSourceErrorPresentation,
  getMobileSourceErrorSummary,
  isMobileCloudflareError,
  isMobileNetworkSourceError,
  isMobileRuntimeUnavailableError,
  isMobileTachiyomiUnsupportedError,
  redactMobileCloudflareUrlForDisplay,
  sanitizeMobileErrorDiagnostic,
} from "./mobileSourceErrors";

describe("mobile source error presentation", () => {
  test("classifies Cloudflare challenges with the secure fail-closed compatibility message", () => {
    const error = new Error(
      "Cloudflare challenge detected for https://example.com/read (status 403)",
    );
    const presentation = getMobileSourceErrorPresentation(
      error,
      getMobileStrings("en"),
    );

    expect(isMobileCloudflareError(error)).toBe(true);
    expect(presentation.kind).toBe("cloudflare");
    expect(presentation.title).toBe("Cloudflare protection detected");
    expect(presentation.detail).toBe(
      "This source requires Cloudflare verification, which is not securely available in this mobile build.",
    );
    expect(presentation.detail).not.toContain("verification window");
    expect(presentation.displayUrl).toBe("https://example.com/read");
    expect(
      getMobileSourceErrorRecoveryAction(presentation, getMobileStrings("en")),
    ).toEqual({
      type: "open-settings",
      label: "Open Settings",
    });
    expect(extractMobileCloudflareUrl(error)).toBe("https://example.com/read");
  });

  test("treats image 403 fetch failures as Cloudflare or hotlink protection", () => {
    const error = new Error("Failed to fetch image with status 403");

    expect(isMobileCloudflareError(error)).toBe(true);
    expect(
      getMobileSourceErrorPresentation(error, getMobileStrings("en")).kind,
    ).toBe("cloudflare");
  });

  test("presents TLS certificate failures as localized network errors", () => {
    const error = new Error("Unacceptable certificate: CN=Example Root");
    const presentation = getMobileSourceErrorPresentation(
      error,
      getMobileStrings("zh"),
    );

    expect(isMobileNetworkSourceError(error)).toBe(true);
    expect(presentation.kind).toBe("network");
    expect(presentation.title).toBe("网络错误");
    expect(presentation.detail).not.toContain("Unacceptable certificate");
  });

  test("preserves challenge parameters operationally but redacts display URLs", () => {
    const error = new Error(
      "Cloudflare blocked https://example.test/read?ray=abc&return=%2Ftitle#challenge",
    );

    expect(extractMobileCloudflareUrl(error)).toBe(
      "https://example.test/read?ray=abc&return=%2Ftitle#challenge",
    );
    expect(extractMobileCloudflareDisplayUrl(error)).toBe(
      "https://example.test/read",
    );
    expect(
      getMobileSourceErrorPresentation(error, getMobileStrings("en"))
        .displayUrl,
    ).toBe("https://example.test/read");
  });

  test("rejects unsafe operational challenge URLs before native verification", () => {
    const credentialed = new Error(
      "Cloudflare blocked https://user:pass@example.test/read?ray=abc#challenge",
    );
    const insecure = Object.assign(new Error("Cloudflare blocked"), {
      url: "http://example.test/read?ray=abc",
    });
    const untrusted = Object.assign(new Error("Cloudflare blocked"), {
      url: "javascript:alert(1)",
    });

    expect(extractMobileCloudflareUrl(credentialed)).toBeUndefined();
    expect(extractMobileCloudflareDisplayUrl(credentialed)).toBe(
      "https://example.test/read",
    );
    expect(extractMobileCloudflareUrl(insecure)).toBeUndefined();
    expect(extractMobileCloudflareUrl(untrusted)).toBeUndefined();
    expect(
      redactMobileCloudflareUrlForDisplay("http://example.test/read?secret=x"),
    ).toBeUndefined();
  });

  test("classifies network failures without leaking raw fetch exceptions", () => {
    const error = new Error("Network request failed");
    const presentation = getMobileSourceErrorPresentation(
      error,
      getMobileStrings("en"),
    );

    expect(isMobileNetworkSourceError(error)).toBe(true);
    expect(presentation.kind).toBe("network");
    expect(presentation.title).toBe("Network error");
    expect(presentation.detail).toBe(
      "Nemu could not reach this source. Check your connection and try again.",
    );
    expect(
      getMobileSourceErrorRecoveryAction(presentation, getMobileStrings("en")),
    ).toBeNull();
  });

  test("classifies React Native WebAssembly runtime blockers without leaking engine text", () => {
    const error = new Error(
      "The current React Native JavaScript engine does not expose WebAssembly.",
    );
    const presentation = getMobileSourceErrorPresentation(
      error,
      getMobileStrings("en"),
    );

    expect(isMobileRuntimeUnavailableError(error)).toBe(true);
    expect(presentation.kind).toBe("runtime");
    expect(presentation.title).toBe("Source runtime unavailable");
    expect(presentation.detail).toContain("WebAssembly");
    expect(presentation.detail).not.toContain("Hermes");
    expect(presentation.detail).not.toContain("does not expose");
    expect(
      getMobileSourceErrorRecoveryAction(presentation, getMobileStrings("en")),
    ).toBeNull();
  });

  test("classifies a stale installed native bridge as a runtime blocker", () => {
    const error = new Error(
      "The installed React Native source bridge is out of date. Rebuild or reinstall Nemu.",
    );
    const presentation = getMobileSourceErrorPresentation(
      error,
      getMobileStrings("en"),
    );

    expect(isMobileRuntimeUnavailableError(error)).toBe(true);
    expect(presentation.kind).toBe("runtime");
    expect(presentation.detail).not.toContain("out of date");
  });

  test("finds runtime blockers across independently loading source sections", () => {
    const runtimeDetail =
      "The current React Native JavaScript engine does not expose WebAssembly.";

    expect(
      getMobileRuntimeUnavailableDetail([
        undefined,
        "Cloudflare blocked this source",
        runtimeDetail,
        "A later source error",
      ]),
    ).toBe(runtimeDetail);
    expect(
      getMobileRuntimeUnavailableDetail([
        null,
        "Network request failed",
        "Unsupported source response",
      ]),
    ).toBeNull();
  });

  test("classifies serialized source runtime errors", () => {
    const strings = getMobileStrings("en");

    expect(
      getMobileSourceErrorPresentation(
        "Cloudflare blocked: https://example.com/manga",
        strings,
      ),
    ).toMatchObject({
      kind: "cloudflare",
      title: "Cloudflare protection detected",
      displayUrl: "https://example.com/manga",
    });

    expect(
      getMobileSourceErrorPresentation(
        "fetch timed out while loading source",
        strings,
      ),
    ).toMatchObject({
      kind: "network",
      title: "Network error",
    });
  });

  test("summarizes source errors for compact rows", () => {
    const strings = getMobileStrings("en");

    expect(
      getMobileSourceErrorSummary(
        "Cloudflare blocked: https://example.com/manga",
        strings,
      ),
    ).toBe("Cloudflare protection detected");
    expect(getMobileSourceErrorSummary("Network request failed", strings)).toBe(
      "Network error",
    );
    // The summary line is always localized; the raw text stays reachable via
    // the full presentation detail.
    expect(
      getMobileSourceErrorSummary("Unsupported source response", strings),
    ).toBe("Source error");
  });

  test("leads unknown source errors with localized copy and a safe diagnostic", () => {
    const presentation = getMobileSourceErrorPresentation(
      new Error("Unsupported source response"),
      getMobileStrings("ja"),
    );

    expect(presentation.kind).toBe("source");
    expect(presentation.title).toBe("ソースエラー");
    // Localized copy first, raw exception text demoted to a second line.
    expect(presentation.detail.split("\n")[0]).toBe(
      "このソースはリクエストを完了できませんでした。しばらくしてからもう一度お試しください。",
    );
    expect(presentation.detail).toContain("Unsupported source response");
  });

  test("localizes the unsupported Tachiyomi runtime blocker", () => {
    // Mirrors `MOBILE_TACHIYOMI_UNSUPPORTED_DETAIL` without importing the
    // sources barrel (it pulls native-only modules into this unit test).
    const error = new Error(
      `${MOBILE_TACHIYOMI_UNSUPPORTED_MARKER} Tachiyomi extensions need a native Tachiyomi bridge on mobile.`,
    );

    expect(isMobileTachiyomiUnsupportedError(error)).toBe(true);
    const presentation = getMobileSourceErrorPresentation(
      error,
      getMobileStrings("zh"),
    );
    expect(presentation.kind).toBe("unsupported");
    expect(presentation.title).toBe("移动端暂不支持此源");
    expect(presentation.detail.split("\n")[0]).toBe(
      "移动端暂不支持 Tachiyomi 源，请改用 Aidoku 源。",
    );
    expect(presentation.detail).toContain("native Tachiyomi bridge");
    expect(presentation.detail).not.toContain(
      MOBILE_TACHIYOMI_UNSUPPORTED_MARKER,
    );
  });

  test("describeMobileErrorDetail keeps localized copy first", () => {
    expect(describeMobileErrorDetail(new Error("boom"), "Localized")).toBe(
      "Localized\nboom",
    );
    expect(describeMobileErrorDetail(new Error("   "), "Localized")).toBe(
      "Localized",
    );
    expect(describeMobileErrorDetail(new Error("Localized"), "Localized")).toBe(
      "Localized",
    );
  });

  test("sanitizes optional user-visible diagnostics", () => {
    const detail = sanitizeMobileErrorDiagnostic(
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

  test("bounds optional user-visible diagnostics", () => {
    const detail = sanitizeMobileErrorDiagnostic(new Error("x".repeat(800)));
    expect(detail?.length).toBe(500);
    expect(detail?.endsWith("…")).toBe(true);
  });

  test("ignores malformed thrown values that cannot be stringified", () => {
    expect(
      sanitizeMobileErrorDiagnostic({
        toString() {
          throw new Error("stringification failed");
        },
      }),
    ).toBeNull();
  });
});
