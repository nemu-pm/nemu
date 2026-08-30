import { describe, expect, test } from "bun:test";
import {
  AIDOKU_REGISTRIES,
  extractCfUrlFromMessage,
  isCloudflareErrorMessage,
  isNetworkSourceError,
  lcsLength,
  mergeAuthors,
  readErrorUrl,
} from "./index";
import { normalizeOAuthProvider } from "../auth";

describe("mergeAuthors", () => {
  test("merges and dedupes authors + artists", () => {
    expect(mergeAuthors(["A", "B"], ["B", "C"])).toEqual(["A", "B", "C"]);
  });

  test("returns undefined for empty inputs", () => {
    expect(mergeAuthors(undefined, undefined)).toBeUndefined();
    expect(mergeAuthors([], [])).toBeUndefined();
  });

  test("handles only authors or only artists", () => {
    expect(mergeAuthors(["A"])).toEqual(["A"]);
    expect(mergeAuthors(undefined, ["B"])).toEqual(["B"]);
  });
});

describe("lcsLength", () => {
  test("basic LCS", () => {
    expect(lcsLength("abcde", "ace")).toBe(3);
    expect(lcsLength("abc", "abc")).toBe(3);
    expect(lcsLength("abc", "def")).toBe(0);
  });

  test("empty strings", () => {
    expect(lcsLength("", "abc")).toBe(0);
    expect(lcsLength("", "")).toBe(0);
  });

  test("CJK strings", () => {
    expect(lcsLength("漫画", "漫书")).toBe(1);
    expect(lcsLength("漫画", "漫画")).toBe(2);
  });
});

describe("isCloudflareErrorMessage", () => {
  test("detects cloudflare message patterns (case-insensitive)", () => {
    expect(isCloudflareErrorMessage("Cloudflare blocked: x")).toBe(true);
    expect(isCloudflareErrorMessage("cloudflare challenge detected")).toBe(
      true,
    );
    expect(isCloudflareErrorMessage("under cloudflare protection")).toBe(true);
  });

  test("detects image 403 fetch errors", () => {
    expect(isCloudflareErrorMessage("fetch image failed: 403")).toBe(true);
    expect(isCloudflareErrorMessage("fetch image ok: 200")).toBe(false);
  });

  test("rejects non-cloudflare messages", () => {
    expect(isCloudflareErrorMessage("network request failed")).toBe(false);
    expect(isCloudflareErrorMessage("")).toBe(false);
  });

  test("does NOT include the CloudflareBlockedError name check", () => {
    // A bare name string is not a message pattern; each app gates the name
    // check separately in its instanceof-aware wrapper.
    expect(isCloudflareErrorMessage("CloudflareBlockedError")).toBe(false);
  });
});

describe("readErrorUrl", () => {
  test("reads .url string from error-like object", () => {
    expect(readErrorUrl({ url: "https://x.test" })).toBe("https://x.test");
  });

  test("returns undefined when url is missing or non-string", () => {
    expect(readErrorUrl({})).toBeUndefined();
    expect(readErrorUrl({ url: 42 })).toBeUndefined();
    expect(readErrorUrl(null)).toBeUndefined();
    expect(readErrorUrl("string")).toBeUndefined();
  });
});

describe("extractCfUrlFromMessage", () => {
  test("extracts 'for <url>' form", () => {
    expect(
      extractCfUrlFromMessage(
        "Cloudflare challenge detected for https://x.test/list (status 403)",
      ),
    ).toBe("https://x.test/list");
  });

  test("extracts 'blocked: <url>' / 'blocked <url>' form", () => {
    expect(extractCfUrlFromMessage("Cloudflare blocked: https://x.test")).toBe(
      "https://x.test",
    );
    expect(extractCfUrlFromMessage("blocked https://x.test")).toBe(
      "https://x.test",
    );
  });

  test("returns undefined when no url present", () => {
    expect(
      extractCfUrlFromMessage("cloudflare challenge detected"),
    ).toBeUndefined();
  });
});

describe("isNetworkSourceError", () => {
  test("detects network failure messages", () => {
    expect(isNetworkSourceError(new Error("fetch failed"))).toBe(true);
    expect(isNetworkSourceError(new Error("Network request failed"))).toBe(
      true,
    );
    expect(isNetworkSourceError(new Error("NetworkError: boom"))).toBe(true);
    expect(isNetworkSourceError(new Error("request timed out"))).toBe(true);
    expect(isNetworkSourceError(new Error("timeout"))).toBe(true);
    expect(
      isNetworkSourceError(
        new Error("Unacceptable certificate: CN=Example Root"),
      ),
    ).toBe(true);
    expect(
      isNetworkSourceError(
        new Error("SSLHandshakeException: Trust anchor not found"),
      ),
    ).toBe(true);
    expect(
      isNetworkSourceError(
        new Error("ERR_CERT_DATE_INVALID: certificate is not yet valid"),
      ),
    ).toBe(true);
  });

  test("accepts non-Error values (lenient stringification)", () => {
    expect(isNetworkSourceError("fetch broke")).toBe(true);
  });

  test("rejects non-network messages", () => {
    expect(isNetworkSourceError(new Error("cloudflare blocked"))).toBe(false);
    expect(isNetworkSourceError(new Error("some source error"))).toBe(false);
  });
});

describe("AIDOKU_REGISTRIES", () => {
  test("exposes the two default registries with stable ids/urls", () => {
    expect(AIDOKU_REGISTRIES.map((r) => r.id)).toEqual([
      "aidoku-community",
      "aidoku-zh",
    ]);
    expect(AIDOKU_REGISTRIES).toHaveLength(2);
    for (const r of AIDOKU_REGISTRIES) {
      expect(typeof r.id).toBe("string");
      expect(typeof r.name).toBe("string");
      expect(r.indexUrl).toMatch(/^https?:\/\//);
    }
  });

  test("community + zh registry URLs are pinned (drift guard)", () => {
    const byId = Object.fromEntries(AIDOKU_REGISTRIES.map((r) => [r.id, r]));
    expect(byId["aidoku-community"].indexUrl).toBe(
      "https://aidoku-community.github.io/sources/index.min.json",
    );
    expect(byId["aidoku-zh"].indexUrl).toBe(
      "https://raw.githubusercontent.com/suiyuran/aidoku-zh-sources/main/public/index.min.json",
    );
  });
});

describe("normalizeOAuthProvider", () => {
  test("accepts google and apple", () => {
    expect(normalizeOAuthProvider("google")).toBe("google");
    expect(normalizeOAuthProvider("apple")).toBe("apple");
  });

  test("rejects unknown / nullish", () => {
    expect(normalizeOAuthProvider("github")).toBeNull();
    expect(normalizeOAuthProvider(null)).toBeNull();
    expect(normalizeOAuthProvider(undefined)).toBeNull();
    expect(normalizeOAuthProvider("")).toBeNull();
  });
});
