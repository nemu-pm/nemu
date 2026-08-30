import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, test } from "bun:test";

const require = createRequire(import.meta.url);

type AndroidManifest = {
  manifest: {
    application?: Array<{ $?: Record<string, string> }>;
  };
};

const plugin = require(
  path.join(import.meta.dir, "../../plugins/with-third-party-jsc.cjs"),
) as {
  ensureAndroidPublicSourceCleartextTraffic: (
    manifest: AndroidManifest,
  ) => AndroidManifest;
};

describe("Android release source network policy", () => {
  test("opts the main application into public legacy HTTP source traffic", () => {
    const manifest: AndroidManifest = {
      manifest: {
        application: [
          {
            $: {
              "android:name": ".MainApplication",
              "android:allowBackup": "false",
            },
          },
        ],
      },
    };

    const configured =
      plugin.ensureAndroidPublicSourceCleartextTraffic(manifest);
    plugin.ensureAndroidPublicSourceCleartextTraffic(configured);

    expect(configured).toBe(manifest);
    expect(configured.manifest.application?.[0]?.$).toEqual({
      "android:name": ".MainApplication",
      "android:allowBackup": "false",
      "android:usesCleartextTraffic": "true",
    });
  });

  test("fails prebuild instead of silently emitting an unprotected release manifest", () => {
    expect(() =>
      plugin.ensureAndroidPublicSourceCleartextTraffic({ manifest: {} }),
    ).toThrow("Android manifest is missing its application element.");
  });
});
