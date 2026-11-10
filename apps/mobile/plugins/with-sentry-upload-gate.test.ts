import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "bun:test";

const require = createRequire(import.meta.url);
const plugin = require(path.join(import.meta.dir, "with-sentry-upload-gate.cjs")) as {
  applyXcodeEnvGate: (contents: string) => string;
  applyGradleGate: (contents: string) => string;
};

describe("Sentry upload gate", () => {
  test("no token disables the upload; a token or an explicit opt-out is kept", () => {
    // Both Sentry build phases source ios/.xcode.env before deciding to upload.
    const contents = plugin.applyXcodeEnvGate("export NODE_BINARY=$(command -v node)\n");
    expect(contents.startsWith("export NODE_BINARY=$(command -v node)\n")).toBe(true);
    expect(contents).toContain(
      'if [ -z "$SENTRY_AUTH_TOKEN" ]; then export SENTRY_DISABLE_AUTO_UPLOAD=true; fi',
    );
    const gradle = plugin.applyGradleGate("android {\n}\n");
    expect(gradle).toContain(
      'return System.getenv("SENTRY_AUTH_TOKEN") && System.getenv("SENTRY_DISABLE_AUTO_UPLOAD") != "true"',
    );
  });

  test("is applied once however often prebuild runs", () => {
    const once = plugin.applyXcodeEnvGate("export NODE_BINARY=node\n");
    expect(plugin.applyXcodeEnvGate(once)).toBe(once);
    const gradle = plugin.applyGradleGate("android {\n}\n");
    expect(plugin.applyGradleGate(gradle)).toBe(gradle);
    expect(gradle).toContain("project.ext.shouldSentryAutoUploadGeneral");
    expect(gradle.indexOf("shouldSentryAutoUploadGeneral")).toBeGreaterThan(gradle.indexOf("android {"));
  });

  test("the app config applies Sentry's plugin, then the gate", () => {
    const appJson = JSON.parse(readFileSync(path.join(import.meta.dir, "../app.json"), "utf8")) as {
      expo: { plugins: Array<string | [string, Record<string, unknown>]> };
    };
    const names = appJson.expo.plugins.map((entry) => (Array.isArray(entry) ? entry[0] : entry));
    const sentry = names.indexOf("@sentry/react-native/expo");
    expect(sentry).toBeGreaterThanOrEqual(0);
    expect(names.indexOf("./plugins/with-sentry-upload-gate")).toBeGreaterThan(sentry);
    const options = (appJson.expo.plugins[sentry] as [string, Record<string, unknown>])[1];
    expect(options).toEqual({
      url: "https://sentry.io/",
      organization: "nemu-pm",
      project: "nemu-mobile",
    });
    // The token must never be in the config: it would be baked into the app.
    expect(JSON.stringify(appJson)).not.toContain("authToken");
  });
});
