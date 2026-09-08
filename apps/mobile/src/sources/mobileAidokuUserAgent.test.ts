import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  MOBILE_AIDOKU_DEFAULT_USER_AGENT,
  readMobileCloudflareUserAgent,
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
});
