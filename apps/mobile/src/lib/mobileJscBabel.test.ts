import { describe, expect, test } from "bun:test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const requireFromTest = createRequire(import.meta.url);
const expoPresetRoot = path.dirname(
  requireFromTest.resolve("babel-preset-expo/package.json"),
);
const babelCorePath = requireFromTest.resolve("@babel/core", {
  paths: [expoPresetRoot],
});
// Resolve Babel from Expo's own dependency tree so this exercises the exact
// transformer Metro uses without adding another independently versioned copy.
const { transformSync } = requireFromTest(babelCorePath) as {
  transformSync: (
    source: string,
    options: Record<string, unknown>,
  ) => { code?: string | null } | null;
};

describe("mobile JSC Babel compatibility", () => {
  test("uses a stable content hash for generated Bundle Mode worklets", async () => {
    const repositoryRoot = path.join(import.meta.dir, "../../../..");
    const packageManifest = JSON.parse(
      readFileSync(path.join(repositoryRoot, "package.json"), "utf8"),
    ) as { patchedDependencies?: Record<string, string> };
    const patchPath = packageManifest.patchedDependencies?.["metro@0.84.4"];

    expect(patchPath).toBe("patches/metro@0.84.4.patch");
    const dependencyGraphModule = requireFromTest(
      path.join(
        repositoryRoot,
        "node_modules/metro/src/node-haste/DependencyGraph.js",
      ),
    ) as {
      default: {
        prototype: {
          getOrComputeSha1: (filePath: string) => Promise<{ sha1: string }>;
        };
      };
    };
    const tempRoot = await mkdtemp(
      path.join(os.tmpdir(), "nemu-worklet-hash-"),
    );
    const workletsDir = path.join(
      tempRoot,
      "react-native-worklets",
      ".worklets",
    );
    const workletPath = path.join(workletsDir, "generated.js");
    try {
      await mkdir(workletsDir, { recursive: true });
      await writeFile(workletPath, "first");
      const getSha1 =
        dependencyGraphModule.default.prototype.getOrComputeSha1;
      const first = await getSha1.call({}, workletPath);
      const unchanged = await getSha1.call({}, workletPath);
      await writeFile(workletPath, "second");
      const changed = await getSha1.call({}, workletPath);

      expect(first.sha1).toBe(unchanged.sha1);
      expect(changed.sha1).not.toBe(first.sha1);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  test("keeps Expo exports on JSC without adding deprecated config fields", () => {
    const appConfig = JSON.parse(
      readFileSync(path.join(import.meta.dir, "../../app.json"), "utf8"),
    ) as {
      expo: {
        extra?: { nemuJsEngine?: string };
        jsEngine?: string;
        ios?: { jsEngine?: string };
        android?: { jsEngine?: string };
      };
    };
    const expoCliRoot = path.dirname(
      requireFromTest.resolve("@expo/cli/package.json"),
    );
    const { isEnableHermesManaged } = requireFromTest(
      path.join(expoCliRoot, "build/src/export/exportHermes.js"),
    ) as {
      isEnableHermesManaged: (
        config: Record<string, unknown>,
        platform: string,
      ) => boolean;
    };

    expect(appConfig.expo.extra?.nemuJsEngine).toBe("jsc");
    expect(appConfig.expo.jsEngine).toBeUndefined();
    expect(appConfig.expo.ios?.jsEngine).toBeUndefined();
    expect(appConfig.expo.android?.jsEngine).toBeUndefined();
    expect(isEnableHermesManaged(appConfig.expo, "ios")).toBe(false);
    expect(isEnableHermesManaged(appConfig.expo, "android")).toBe(false);
  });

  test("registers the app and current Aidoku OAuth callback schemes", () => {
    const appConfig = JSON.parse(
      readFileSync(path.join(import.meta.dir, "../../app.json"), "utf8"),
    ) as {
      expo: {
        scheme?: string | string[];
        plugins?: Array<string | [string, ...unknown[]]>;
        ios?: {
          infoPlist?: {
            CFBundleURLTypes?: Array<{ CFBundleURLSchemes?: string[] }>;
          };
        };
        android?: { scheme?: string | string[] };
      };
    };

    expect(appConfig.expo.scheme).toBe("nemu");
    expect(
      appConfig.expo.ios?.infoPlist?.CFBundleURLTypes?.flatMap(
        (entry) => entry.CFBundleURLSchemes ?? [],
      ),
    ).toEqual(["nemu", "neko"]);
    expect(appConfig.expo.android?.scheme).toBeUndefined();
    expect(
      appConfig.expo.plugins?.map((plugin) =>
        Array.isArray(plugin) ? plugin[0] : plugin,
      ),
    ).toContain("./plugins/with-mobile-deep-link-schemes");

    const deepLinkPlugin = requireFromTest(
      path.join(
        import.meta.dir,
        "../../plugins/with-mobile-deep-link-schemes.cjs",
      ),
    ) as {
      ensureAndroidDeepLinkScheme: (
        manifest: Record<string, unknown>,
        scheme: string,
      ) => Record<string, unknown>;
    };
    const manifest = {
      manifest: {
        application: [
          {
            activity: [
              {
                $: { "android:name": ".MainActivity" },
                "intent-filter": [
                  {
                    action: [{ $: { "android:name": "android.intent.action.VIEW" } }],
                    category: [
                      { $: { "android:name": "android.intent.category.BROWSABLE" } },
                    ],
                    data: [{ $: { "android:scheme": "nemu" } }],
                  },
                ],
              },
            ],
          },
        ],
      },
    };

    expect(
      deepLinkPlugin.ensureAndroidDeepLinkScheme(manifest, "neko"),
    ).toEqual({
      manifest: {
        application: [
          {
            activity: [
              {
                $: { "android:name": ".MainActivity" },
                "intent-filter": [
                  {
                    action: [{ $: { "android:name": "android.intent.action.VIEW" } }],
                    category: [
                      { $: { "android:name": "android.intent.category.BROWSABLE" } },
                    ],
                    data: [
                      { $: { "android:scheme": "nemu" } },
                      { $: { "android:scheme": "neko" } },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    });
  });

  test("links EAS from CI without hard-coding account metadata", () => {
    const appConfig = JSON.parse(
      readFileSync(path.join(import.meta.dir, "../../app.json"), "utf8"),
    ) as { expo: Record<string, unknown> };
    const configure = requireFromTest(
      path.join(import.meta.dir, "../../app.config.cjs"),
    ) as (input: { config: Record<string, unknown> }) => {
      extra?: { nemuJsEngine?: string; eas?: { projectId?: string } };
    };
    const previousProjectId = process.env.EAS_PROJECT_ID;

    try {
      process.env.EAS_PROJECT_ID = "00000000-0000-4000-8000-000000000000";
      const resolved = configure({ config: appConfig.expo });
      expect(resolved.extra?.nemuJsEngine).toBe("jsc");
      expect(resolved.extra?.eas?.projectId).toBe(
        "00000000-0000-4000-8000-000000000000",
      );
    } finally {
      if (previousProjectId === undefined) {
        delete process.env.EAS_PROJECT_ID;
      } else {
        process.env.EAS_PROJECT_ID = previousProjectId;
      }
    }
  });

  test("classifies full and abbreviated combined Android clean builds", () => {
    const plugin = requireFromTest(
      path.join(import.meta.dir, "../../plugins/with-third-party-jsc.cjs"),
    ) as {
      isCombinedAndroidCleanBuildRequest: (taskNames: string[]) => boolean;
    };
    const cases: Array<[string[], boolean]> = [
      [[":app:clean", ":app:installRelease"], true],
      [[":app:cl", ":app:aR"], true],
      [["cl", "assRel"], true],
      [["clean"], false],
      [[":app:cl"], false],
      [["clean", ":lib:clean"], false],
    ];

    for (const [taskNames, expected] of cases) {
      expect(plugin.isCombinedAndroidCleanBuildRequest(taskNames)).toBe(
        expected,
      );
    }
  });

  test("moves the API 33 splash behavior into a complete versioned style", () => {
    const plugin = requireFromTest(
      path.join(import.meta.dir, "../../plugins/with-third-party-jsc.cjs"),
    ) as {
      migrateAndroidSplashStyleContents: (
        baseStyles: string,
        versionedStyles?: string,
      ) => { baseStyles: string; versionedStyles?: string };
    };

    const baseStyles = `<resources>
  <style name="AppTheme" parent="Theme.AppCompat.DayNight.NoActionBar" />
  <style name="Theme.App.SplashScreen" parent="Theme.SplashScreen">
    <item name="windowSplashScreenBackground">@color/splashscreen_background</item>
    <item name="windowSplashScreenAnimatedIcon">@drawable/splashscreen_logo</item>
    <item name="postSplashScreenTheme">@style/AppTheme</item>
    <item name="android:windowSplashScreenBehavior">icon_preferred</item>
  </style>
</resources>
`;
    const versionedStyles = `<resources>
  <style name="ExistingApi33Style" />
</resources>
`;

    const migrated = plugin.migrateAndroidSplashStyleContents(
      baseStyles,
      versionedStyles,
    );

    expect(migrated.baseStyles).not.toContain("windowSplashScreenBehavior");
    expect(migrated.baseStyles).toContain('name="AppTheme"');
    expect(migrated.versionedStyles).toContain('name="ExistingApi33Style"');
    expect(migrated.versionedStyles).toContain(
      'name="android:windowSplashScreenBehavior"',
    );
    expect(migrated.versionedStyles).toContain(
      'name="windowSplashScreenAnimatedIcon"',
    );
    expect(migrated.versionedStyles).toContain('name="postSplashScreenTheme"');
  });

  test("keeps dual-reader 64-bit hashes independent of the Android BigInt shim", () => {
    const coreFiles = ["hash.ts", "hash-serialization.ts"].map((fileName) =>
      path.join(
        import.meta.dir,
        `../../../../packages/core/src/dual-reader/${fileName}`,
      ),
    );
    const shim = readFileSync(
      path.join(import.meta.dir, "../polyfills/bigInt.ts"),
      "utf8",
    );

    // The pinned Android JSC lacks native BigInt and this compatibility shim
    // deliberately returns Number. Hash correctness therefore cannot depend
    // on either bigint syntax or the global constructor after Metro/Babel.
    expect(shim).toContain("__NEMU_BIGINT_SHIMMED__");
    expect(shim).toContain("toNumberInteger(value)");
    for (const fileName of coreFiles) {
      const transformed = transformSync(readFileSync(fileName, "utf8"), {
        babelrc: false,
        caller: {
          name: "metro",
          engine: "hermes",
          isDev: false,
          platform: "android",
        },
        comments: false,
        configFile: path.join(import.meta.dir, "../../babel.config.js"),
        filename: fileName,
      });
      expect(transformed?.code).toBeTruthy();
      expect(transformed?.code).not.toMatch(/\bBigInt\s*\(/);
      expect(transformed?.code).not.toMatch(/\b\d+n\b/);
    }
  });

  test("lowers Hermes-only class syntax after Flow declarations are stripped", () => {
    const source = `
      // @flow
      class EventLike {
        NONE: number;
        #value = 7;

        read() {
          return this.#value + this.NONE;
        }
      }

      Object.defineProperty(EventLike.prototype, "NONE", {
        configurable: false,
        enumerable: true,
        value: 0,
      });

      globalThis.__nemuJscBabelResult = new EventLike().read();
    `;

    const result = transformSync(source, {
      babelrc: false,
      caller: {
        name: "metro",
        engine: "hermes",
        isDev: true,
        platform: "android",
      },
      configFile: path.join(import.meta.dir, "../../babel.config.js"),
      filename: path.join(
        import.meta.dir,
        "../../node_modules/react-native/EventLike.js",
      ),
    });

    expect(result?.code).toBeTruthy();
    expect(result?.code).not.toContain("#value");
    expect(result?.code).not.toMatch(/this\.NONE\s*=/);
    expect(result?.code).not.toMatch(
      /(?:Object\.)?defineProperty\(this,["']NONE["']/,
    );
    expect(result?.code).toContain("EventLike.prototype");
  });
});
