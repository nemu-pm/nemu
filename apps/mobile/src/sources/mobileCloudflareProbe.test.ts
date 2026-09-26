import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Behaviour test for the Android Cloudflare solver's page probe
 * (`NEMU_CLOUDFLARE_PROBE_SCRIPT` in `runtime/kotlin/NemuCloudflareSolver.kt`),
 * run with the exact text Kotlin embeds.
 *
 * `evaluateJavascript` runs in the challenge page's own main world, where
 * Cloudflare's scripts can wrap any DOM API. Polling
 * `document.querySelector('input[name="cf-turnstile-response"]')` from there
 * made Turnstile hand out a clearance its edge refused (an endless checkbox
 * loop on a real Android WebView), so the probe must not touch `document` at
 * all — only the plain `_cf_chl_opt` global.
 */

const probeSource = (() => {
  const source = readFileSync(
    path.join(
      fileURLToPath(new URL("../../modules/nemu-aidoku/", import.meta.url)),
      "runtime/kotlin/NemuCloudflareSolver.kt",
    ),
    "utf8",
  );
  const match = source.match(/NEMU_CLOUDFLARE_PROBE_SCRIPT = """\n([\s\S]*?)\n"""\.trimIndent\(\)/);
  if (!match) throw new Error("probe literal not found");
  return match[1];
})();

function run(window: Record<string, unknown>) {
  const touched: string[] = [];
  // Any read of `document` (querySelector, scripts, title, …) is recorded.
  const document = new Proxy(
    {},
    {
      get(_target, key) {
        touched.push(String(key));
        return () => null;
      },
    },
  );
  const result = new Function("window", "document", `return ${probeSource}`)(window, document);
  return { result, touched };
}

describe("Android Cloudflare solver probe", () => {
  test("reports the interstitial's bootstrap global", () => {
    expect(run({ _cf_chl_opt: { cType: "managed" } }).result).toEqual({ interstitial: true });
    expect(run({}).result).toEqual({ interstitial: false });
  });

  test("never reaches into the page's DOM", () => {
    expect(run({ _cf_chl_opt: {} }).touched).toEqual([]);
    expect(run({}).touched).toEqual([]);
    expect(probeSource).not.toContain("cf-turnstile-response");
    expect(probeSource).not.toContain("document");
  });

  test("a throwing global getter reads as no marker, not an exception", () => {
    const window = {};
    Object.defineProperty(window, "_cf_chl_opt", {
      get() {
        throw new Error("hostile getter");
      },
    });
    expect(run(window).result).toEqual({ interstitial: false });
  });
});
