import { describe, expect, test } from "bun:test";
import { getMobileStrings } from "./mobileI18n";
import {
  extractMobileCloudflareUrl,
  getMobileRuntimeUnavailableDetail,
  getMobileSourceErrorRecoveryAction,
  getMobileSourceErrorPresentation,
  getMobileSourceErrorSummary,
  isMobileCloudflareError,
  isMobileNetworkSourceError,
  isMobileRuntimeUnavailableError,
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
    expect(presentation.url).toBe("https://example.com/read");
    expect(getMobileSourceErrorRecoveryAction(presentation, getMobileStrings("en"))).toEqual({
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
    expect(getMobileSourceErrorRecoveryAction(presentation, getMobileStrings("en"))).toBeNull();
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
    expect(getMobileSourceErrorRecoveryAction(presentation, getMobileStrings("en"))).toBeNull();
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
      url: "https://example.com/manga",
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
    expect(
      getMobileSourceErrorSummary("Network request failed", strings),
    ).toBe("Network error");
    expect(
      getMobileSourceErrorSummary("Unsupported source response", strings),
    ).toBe("Unsupported source response");
  });

  test("keeps unknown source errors visible for debugging", () => {
    const presentation = getMobileSourceErrorPresentation(
      new Error("Unsupported source response"),
      getMobileStrings("en"),
    );

    expect(presentation).toEqual({
      kind: "source",
      title: "Source error",
      detail: "Unsupported source response",
    });
  });
});
