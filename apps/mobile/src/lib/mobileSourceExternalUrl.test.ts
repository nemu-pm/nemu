import { describe, expect, test } from "bun:test";
import { normalizeMobileSourceExternalUrl } from "./mobileSourceExternalUrl";

describe("normalizeMobileSourceExternalUrl", () => {
  test("accepts and canonicalizes source-authored http(s) links", () => {
    expect(
      normalizeMobileSourceExternalUrl("  HTTPS://Example.COM/path?q=1#chapter  "),
    ).toBe("https://example.com/path?q=1#chapter");
    expect(normalizeMobileSourceExternalUrl("http://example.com"))
      .toBe("http://example.com/");
  });

  test.each([
    "intent://open/#Intent;scheme=nemu;end",
    "FiLe:///private/data",
    "content://pm.nemu.mobile/private",
    "tel:+1234567890",
    "javascript:alert(1)",
    "nemu://settings",
    "data:text/html,hello",
  ])("rejects privileged or custom scheme %s", (url) => {
    expect(normalizeMobileSourceExternalUrl(url)).toBeNull();
  });

  test("rejects malformed, relative, credentialed, empty, and oversized URLs", () => {
    expect(normalizeMobileSourceExternalUrl("/relative")).toBeNull();
    expect(normalizeMobileSourceExternalUrl("https://user:secret@example.com"))
      .toBeNull();
    expect(normalizeMobileSourceExternalUrl(" ")).toBeNull();
    expect(normalizeMobileSourceExternalUrl(`https://example.com/${"x".repeat(8192)}`))
      .toBeNull();
  });
});
