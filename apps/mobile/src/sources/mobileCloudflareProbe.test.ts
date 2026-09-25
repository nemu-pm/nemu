import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Behaviour test for the Android Cloudflare solver's DOM probe
 * (`NEMU_CLOUDFLARE_PROBE_FUNCTION` in `runtime/kotlin/NemuCloudflareSolver.kt`),
 * run against a fake main-world realm with the exact text Kotlin embeds and
 * the same `(probe)(known);` assembly as `nemuCloudflareProbeScript`.
 */

const probeSource = (() => {
  const source = readFileSync(
    path.join(
      fileURLToPath(new URL("../../modules/nemu-aidoku/", import.meta.url)),
      "runtime/kotlin/NemuCloudflareSolver.kt",
    ),
    "utf8",
  );
  const match = source.match(
    /NEMU_CLOUDFLARE_PROBE_FUNCTION = """\n([\s\S]*?)\n"""\.trimIndent\(\)/,
  );
  if (!match) throw new Error("probe literal not found");
  return match[1];
})();

type ProbeResult = {
  challenge: boolean;
  needsInteraction: boolean;
  interstitial: boolean;
  scanFinal: boolean;
};

function makePage(options: {
  global?: boolean;
  scripts?: string[];
  readyState?: string;
  title?: string;
}) {
  let scriptReads = 0;
  const scripts = (options.scripts ?? []).map((text) => ({
    get textContent() {
      scriptReads += 1;
      return text;
    },
  }));
  const window: Record<string, unknown> = {};
  if (options.global) window._cf_chl_opt = { cType: "managed" };
  const document = {
    scripts,
    readyState: options.readyState ?? "complete",
    title: options.title ?? "",
    querySelector: () => null,
  };
  return {
    run(known: boolean | null): ProbeResult {
      return new Function("window", "document", `return ${probeSource}(${String(known)});`)(
        window,
        document,
      ) as ProbeResult;
    },
    scriptReads: () => scriptReads,
  };
}

describe("Android Cloudflare solver probe", () => {
  test("reads the page global first and never scans when it is there", () => {
    const page = makePage({ global: true, scripts: ["window._cf_chl_opt = {}"] });
    expect(page.run(null)).toEqual({
      challenge: true,
      needsInteraction: false,
      interstitial: true,
      scanFinal: false,
    });
    expect(page.scriptReads()).toBe(0);
  });

  test("falls back to the script text, and only while the document is unknown", () => {
    const page = makePage({ scripts: ["var x = 1;", "(function(){ _cf_chl_opt = {}; })()"] });
    expect(page.run(null)).toMatchObject({ challenge: true, interstitial: true });
    expect(page.scriptReads()).toBe(2);

    // Known positive: no scan, still a challenge.
    expect(page.run(true)).toMatchObject({ challenge: true, interstitial: true });
    expect(page.scriptReads()).toBe(2);
  });

  test("a parsed document without the marker is a final negative, then never rescanned", () => {
    const page = makePage({ scripts: ["console.log('origin page')"] });
    expect(page.run(null)).toEqual({
      challenge: false,
      needsInteraction: false,
      interstitial: false,
      scanFinal: true,
    });
    expect(page.scriptReads()).toBe(1);
    expect(page.run(false)).toMatchObject({ challenge: false, scanFinal: false });
    expect(page.scriptReads()).toBe(1);

    // A scan that ran mid-parse is not final.
    const loading = makePage({ scripts: [], readyState: "loading" });
    expect(loading.run(null)).toMatchObject({ interstitial: false, scanFinal: false });
  });

  test("the English title stays a fallback signal", () => {
    expect(makePage({ title: "Just a moment..." }).run(false).challenge).toBe(true);
  });
});
