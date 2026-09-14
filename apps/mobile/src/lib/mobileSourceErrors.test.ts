import { describe, expect, test } from "bun:test";
import { getMobileStrings } from "./mobileI18n";
import { MOBILE_SOURCE_DISABLED_DETAIL } from "@/sources/mobileSourceRuntime";
import {
  MOBILE_SOURCE_DISABLED_MARKER,
  MOBILE_TACHIYOMI_UNSUPPORTED_MARKER,
  describeMobileErrorDetail,
  extractMobileCloudflareDisplayUrl,
  extractMobileCloudflareSolveUrl,
  getMobileRuntimeUnavailableDetail,
  getMobileSourceErrorRecoveryAction,
  getMobileSourceErrorRecoveryHref,
  getMobileSourceErrorPresentation,
  getMobileSourceErrorSummary,
  isMobileCloudflareError,
  isMobileSourceDisabledError,
  isMobileNetworkSourceError,
  isMobileRuntimeUnavailableError,
  isMobileTachiyomiUnsupportedError,
  redactMobileCloudflareUrlForDisplay,
  sanitizeMobileErrorDiagnostic,
  splitMobileInlineErrorDetail,
} from "./mobileSourceErrors";

describe("mobile source error presentation", () => {
  test("classifies Cloudflare challenges with capability-neutral copy", () => {
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
    // The banner copy must not claim verification is unavailable: iOS and
    // Android now implement the on-demand solver, and the "unavailable on this
    // platform" wording belongs only to the capability-false sheet state.
    expect(presentation.detail).toBe(
      "This source requires Cloudflare verification. Nemu Agent can complete the check so you can try again.",
    );
    expect(presentation.detail).not.toContain("verification window");
    expect(presentation.detail).not.toContain("not securely available");
    expect(presentation.displayUrl).toBe("https://example.com/read");
    expect(
      getMobileSourceErrorRecoveryAction(presentation, getMobileStrings("en")),
    ).toEqual({
      type: "open-settings",
      label: "Open Settings",
      focus: "agent",
    });
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
    const error = Object.assign(
      new Error(
        "Cloudflare blocked https://example.test/read?ray=abc&return=%2Ftitle#challenge",
      ),
      { url: "https://example.test/read?ray=abc&return=%2Ftitle#challenge" },
    );

    expect(extractMobileCloudflareSolveUrl(error)).toBe(
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

  test("never derives a solvable challenge URL from the error message", () => {
    // A source package controls its own exception text. If a message-derived
    // host could start a solve, `new Error("Cloudflare blocked: <attacker>")`
    // would open a WebView against that host, bound to this source's cookie
    // jar, with no user interaction at all.
    const hostile = new Error(
      "Cloudflare blocked: https://attacker.example/steal?x=1",
    );

    expect(isMobileCloudflareError(hostile)).toBe(true);
    expect(extractMobileCloudflareSolveUrl(hostile)).toBeUndefined();
    // Naming the host in a banner starts nothing, so display still resolves.
    expect(extractMobileCloudflareDisplayUrl(hostile)).toBe(
      "https://attacker.example/steal",
    );
  });

  test("takes the solve URL only from the structured field, not the text", () => {
    // The envelope's consistency check is what puts `url` on a reconstructed
    // error; when the two disagree the structured field wins outright.
    const mismatched = Object.assign(
      new Error("Cloudflare blocked https://attacker.example/x"),
      { url: "https://real.test/read" },
    );

    expect(extractMobileCloudflareSolveUrl(mismatched)).toBe(
      "https://real.test/read",
    );
  });

  test("rejects unsafe operational challenge URLs before native verification", () => {
    const credentialed = Object.assign(
      new Error(
        "Cloudflare blocked https://user:pass@example.test/read?ray=abc#challenge",
      ),
      { url: "https://user:pass@example.test/read?ray=abc#challenge" },
    );
    const insecure = Object.assign(new Error("Cloudflare blocked"), {
      url: "http://example.test/read?ray=abc",
    });
    const untrusted = Object.assign(new Error("Cloudflare blocked"), {
      url: "javascript:alert(1)",
    });

    expect(extractMobileCloudflareSolveUrl(credentialed)).toBeUndefined();
    expect(extractMobileCloudflareDisplayUrl(credentialed)).toBe(
      "https://example.test/read",
    );
    expect(extractMobileCloudflareSolveUrl(insecure)).toBeUndefined();
    expect(extractMobileCloudflareSolveUrl(untrusted)).toBeUndefined();
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

  test("localizes the disabled-source blocker in every catalog", () => {
    // The executor's blocked detail is an English log sentence; what the user
    // reads must come from their own catalog.
    for (const language of ["ja", "zh", "en"] as const) {
      const strings = getMobileStrings(language);
      const presentation = getMobileSourceErrorPresentation(
        MOBILE_SOURCE_DISABLED_DETAIL,
        strings,
      );

      expect(isMobileSourceDisabledError(MOBILE_SOURCE_DISABLED_DETAIL)).toBe(
        true,
      );
      expect(presentation.kind, language).toBe("disabled");
      expect(presentation.title, language).toBe(strings.common.sourceDisabled);
      expect(presentation.detail, language).toBe(
        strings.common.sourceDisabledDescription,
      );
      // Neither the marker nor the untranslated sentence may survive into copy.
      expect(presentation.detail, language).not.toContain(
        MOBILE_SOURCE_DISABLED_MARKER,
      );
      if (language !== "en") {
        expect(presentation.detail, language).not.toContain("This source is");
      }
      // The fix is a per-source toggle, so the CTA goes to Sources, not to the
      // Nemu Agent card the Cloudflare recovery uses.
      const action = getMobileSourceErrorRecoveryAction(presentation, strings);
      expect(action, language).toEqual({
        type: "open-settings",
        label: strings.common.sourceDisabledAction,
        focus: "sources",
      });
      expect(action && getMobileSourceErrorRecoveryHref(action)).toBe(
        "/settings/sources",
      );
    }
  });

  test("keeps the disabled marker out of every user-visible string", () => {
    expect(MOBILE_SOURCE_DISABLED_DETAIL).toContain(
      MOBILE_SOURCE_DISABLED_MARKER,
    );
    // Anywhere the raw detail is joined as a diagnostic, the marker is stripped.
    expect(sanitizeMobileErrorDiagnostic(MOBILE_SOURCE_DISABLED_DETAIL)).not.toContain(
      MOBILE_SOURCE_DISABLED_MARKER,
    );
    expect(
      getMobileSourceErrorSummary(
        MOBILE_SOURCE_DISABLED_DETAIL,
        getMobileStrings("ja"),
      ),
    ).toBe(getMobileStrings("ja").common.sourceDisabled);
  });

  test("keeps a plain source error out of the disabled branch", () => {
    // Classification is on the marker, never on the word "disabled", so a
    // source whose own message mentions it is still an ordinary failure.
    const presentation = getMobileSourceErrorPresentation(
      new Error("This source is disabled by the publisher."),
      getMobileStrings("en"),
    );

    expect(presentation.kind).toBe("source");
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

describe("splitMobileInlineErrorDetail", () => {
  test("splits the describeMobileErrorDetail join into description and diagnostic", () => {
    const detail = describeMobileErrorDetail(
      new Error("Request timed out."),
      "The source could not be reached.",
    );

    expect(splitMobileInlineErrorDetail(detail)).toEqual({
      description: "The source could not be reached.",
      diagnostic: "Request timed out.",
    });
  });

  test("keeps single-line details intact without a diagnostic", () => {
    expect(splitMobileInlineErrorDetail("Something failed.")).toEqual({
      description: "Something failed.",
      diagnostic: null,
    });
  });

  test("trims whitespace around both halves", () => {
    expect(
      splitMobileInlineErrorDetail("  Localized copy  \n\n  raw diagnostic  "),
    ).toEqual({
      description: "Localized copy",
      diagnostic: "raw diagnostic",
    });
  });

  test("collapses a leading separator instead of rendering an empty description", () => {
    expect(splitMobileInlineErrorDetail("\nraw diagnostic")).toEqual({
      description: "raw diagnostic",
      diagnostic: null,
    });
  });
});
