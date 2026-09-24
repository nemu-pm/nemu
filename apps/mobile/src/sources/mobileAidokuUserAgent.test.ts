import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  hasMobileUserAgentHeader,
  MOBILE_AIDOKU_DEFAULT_USER_AGENT,
  readMobileCloudflareUserAgent,
  withMobileAidokuUserAgent,
} from "./mobileAidokuUserAgent";

const moduleRoot = fileURLToPath(
  new URL("../../modules/nemu-aidoku/", import.meta.url),
);

function read(relativePath: string): string {
  return readFileSync(path.join(moduleRoot, relativePath), "utf8");
}

/**
 * Strips Swift/Kotlin string concatenation and line breaks so a multi-line
 * literal can be compared to the single JS string.
 */
function collapseNativeLiteral(source: string, marker: string): string {
  const start = source.indexOf(marker);
  expect(start).toBeGreaterThan(-1);
  const tail = source.slice(start, start + 500);
  return tail
    .split("\n")
    .slice(0, 4)
    .join(" ")
    .replace(/\s*\+\s*/g, "")
    .replace(/"/g, "");
}

describe("mobile Aidoku default user agent", () => {
  test("matches the literal both native Cloudflare solvers pin", () => {
    // A clearance cookie is bound to the User-Agent that solved the challenge.
    // If JS, Swift, and Kotlin drift apart, a solve silently stops helping.
    const swift = collapseNativeLiteral(
      read("ios/NemuAidokuCloudflareSolver.swift"),
      "let nemuAidokuDefaultUserAgent =",
    );
    const kotlin = collapseNativeLiteral(
      read("runtime/kotlin/NemuCloudflareSolver.kt"),
      "internal const val NEMU_AIDOKU_DEFAULT_USER_AGENT =",
    );

    expect(swift).toContain(MOBILE_AIDOKU_DEFAULT_USER_AGENT);
    expect(kotlin).toContain(MOBILE_AIDOKU_DEFAULT_USER_AGENT);
  });

  test("is the User-Agent the Aidoku runtime actually sends", () => {
    // The clearance cookie has to match the requests the source will make
    // after the solve, which the runtime stamps with its own default.
    const runtime = readFileSync(
      fileURLToPath(
        new URL(
          "../../../../node_modules/@nemu.pm/aidoku-runtime/dist/runtime.js",
          import.meta.url,
        ),
      ),
      "utf8",
    );
    expect(runtime).toContain(MOBILE_AIDOKU_DEFAULT_USER_AGENT);
  });

  test("reads a runtime-supplied user agent without asserting a shape", () => {
    const withUserAgent = Object.assign(new Error("Cloudflare"), {
      userAgent: "  Mozilla/5.0 (custom)  ",
    });
    expect(readMobileCloudflareUserAgent(withUserAgent)).toBe(
      "Mozilla/5.0 (custom)",
    );

    // Today's `CloudflareBlockedError` carries only `url` and `status`.
    const plain = Object.assign(new Error("Cloudflare"), {
      url: "https://example.test/read",
      status: 403,
    });
    expect(readMobileCloudflareUserAgent(plain)).toBeUndefined();

    expect(readMobileCloudflareUserAgent(undefined)).toBeUndefined();
    expect(readMobileCloudflareUserAgent("Cloudflare")).toBeUndefined();
    expect(
      readMobileCloudflareUserAgent(
        Object.assign(new Error("x"), { userAgent: "   " }),
      ),
    ).toBeUndefined();
    expect(
      readMobileCloudflareUserAgent(
        Object.assign(new Error("x"), { userAgent: 42 }),
      ),
    ).toBeUndefined();
    expect(
      readMobileCloudflareUserAgent(
        Object.assign(new Error("x"), { userAgent: "a".repeat(513) }),
      ),
    ).toBeUndefined();
  });

  test("source-owned requests keep the source's UA or get the runtime default", () => {
    // A clearance cookie native attaches to a source image request is bound
    // to the UA that solved it; the image loader's platform UA must never
    // stand in for it.
    expect(withMobileAidokuUserAgent({})).toEqual({
      "User-Agent": MOBILE_AIDOKU_DEFAULT_USER_AGENT,
    });
    expect(withMobileAidokuUserAgent(undefined)).toEqual({
      "User-Agent": MOBILE_AIDOKU_DEFAULT_USER_AGENT,
    });
    expect(
      withMobileAidokuUserAgent({
        Referer: "https://example.test/",
        Cookie: "cf_clearance=abc",
      }),
    ).toEqual({
      Referer: "https://example.test/",
      Cookie: "cf_clearance=abc",
      "User-Agent": MOBILE_AIDOKU_DEFAULT_USER_AGENT,
    });

    const custom = { "user-agent": "Custom/1", Referer: "https://example.test/" };
    const kept = withMobileAidokuUserAgent(custom);
    expect(kept).toEqual(custom);
    expect(kept).not.toBe(custom);

    expect(hasMobileUserAgentHeader({ "USER-AGENT": "x" })).toBe(true);
    expect(hasMobileUserAgentHeader({ Referer: "x" })).toBe(false);
    expect(hasMobileUserAgentHeader(null)).toBe(false);
  });

  test("every source image-request path goes through the UA normalizer", () => {
    const mobileRoot = fileURLToPath(new URL("../../", import.meta.url));
    const bridge = readFileSync(
      path.join(mobileRoot, "src/sources/mobileAidokuSandboxExecutorBridge.native.ts"),
      "utf8",
    );
    const modify = bridge.slice(
      bridge.indexOf("modifyImageRequest(url) {"),
      bridge.indexOf("async hasImageProcessor()"),
    );
    // The no-hook short-circuit mirrors the runtime's own default headers,
    // and a hook's result keeps the source's UA or gains the default.
    expect(modify).toContain("headers: withMobileAidokuUserAgent({})");
    expect(modify).toContain("headers: withMobileAidokuUserAgent(request.headers)");
    expect(modify).not.toContain("headers: {}");

    const pages = readFileSync(
      path.join(mobileRoot, "src/sources/mobileSourcePages.ts"),
      "utf8",
    );
    expect(pages).toContain("headers: withMobileAidokuUserAgent(page.headers)");

    // Native adds the same default wherever it attaches a source's jar to an
    // image request, and falls back to it for source-scoped requests.
    const iosModule = read("ios/NemuAidokuModule.swift");
    expect(iosModule).toMatch(
      /ensuringUserAgent\(\s*output,\s*nemuAidokuDefaultUserAgent\s*\)/,
    );
    expect(iosModule).toContain("sourceDefault: nemuAidokuDefaultUserAgent");
    const androidModule = read(
      "android/src/main/java/pm/nemu/mobile/aidoku/NemuAidokuModule.kt",
    );
    expect(androidModule).toMatch(
      /ensuringUserAgent\(\s*merged,\s*NEMU_AIDOKU_DEFAULT_USER_AGENT\s*\)/,
    );
    expect(
      androidModule.match(/sourceDefault = NEMU_AIDOKU_DEFAULT_USER_AGENT/g),
    ).toHaveLength(2);
  });
});
