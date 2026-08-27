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
  path.join(import.meta.dir, "with-third-party-jsc.cjs"),
) as {
  replaceOnceOrThrow: (
    source: string,
    find: string | RegExp,
    replace: string,
    label: string,
  ) => string;
  replaceOptional: (
    source: string,
    find: string | RegExp,
    replace: string,
    label: string,
  ) => string;
  patchSwiftAppDelegate: (contents: string) => string;
  patchPodfile: (contents: string) => string;
  patchKotlinMainApplication: (contents: string) => string;
  patchAndroidSettingsGradle: (contents: string) => string;
  patchAndroidAppBuildGradle: (contents: string) => string;
  ensureAndroidFirstPartyNetworkSecurityConfig: (
    manifest: AndroidManifest,
  ) => AndroidManifest;
  androidNetworkSecurityConfigXml: string;
};

const PODFILE = [
  "platform :ios, min_ios_version_supported",
  "prepare_react_native_project!",
  "",
  "target 'Nemu' do",
  `  pod 'hermes-engine', :podspec => "#{config[:reactNativePath]}/sdks/hermes-engine/hermes-engine.podspec"`,
  "  post_install do |installer|",
  "    react_native_post_install(",
  "      installer,",
  "      config[:reactNativePath],",
  "    )",
  "  end",
  "end",
  "",
].join("\n");

const MAIN_APPLICATION = [
  "package pm.nemu.mobile",
  "",
  "import expo.modules.ExpoReactHostFactory",
  "",
  "class MainApplication : Application(), ReactApplication {",
  "  override val reactHost: ReactHost",
  "    get() = ExpoReactHostFactory.getDefaultReactHost(",
  "      applicationContext,",
  "      packageList =",
  "        PackageList(this).packages.apply {",
  "          // add(MyReactNativePackage())",
  "        }",
  "    )",
  "}",
  "",
].join("\n");

const APP_DELEGATE = [
  "import Expo",
  "import React",
  "import ReactAppDependencyProvider",
  "",
  "class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {",
  "  override func bundleURL() -> URL? { nil }",
  "}",
  "",
].join("\n");

describe("prebuild patch discipline", () => {
  test("a substitution that stops matching fails the prebuild", () => {
    expect(plugin.replaceOnceOrThrow("a b c", "b", "B", "swap b")).toBe("a B c");
    expect(() => plugin.replaceOnceOrThrow("a c", "b", "B", "swap b")).toThrow(
      /"swap b" found no match/,
    );
    expect(() => plugin.replaceOnceOrThrow("b b", "b", "B", "swap b")).toThrow(
      /matched 2 times/,
    );
    expect(() =>
      plugin.replaceOnceOrThrow("b1 b2", /b\d/, "B", "swap b"),
    ).toThrow(/matched 2 times/);
  });

  test("optional substitutions tolerate nothing to do but not ambiguity", () => {
    expect(plugin.replaceOptional("a c", "b", "B", "swap b")).toBe("a c");
    expect(plugin.replaceOptional("b b", /b/g, "B", "swap b")).toBe("B B");
    expect(() => plugin.replaceOptional("b b", /b/, "B", "swap b")).toThrow(
      /expected at most one/,
    );
  });
});

describe("native build flags", () => {
  test("come from the installed dependency versions", () => {
    const dependencies = (
      require(path.join(import.meta.dir, "../package.json")) as {
        dependencies: Record<string, string>;
      }
    ).dependencies;
    const reactNativeMinor = dependencies["react-native"].split(".")[1];
    const podfile = plugin.patchPodfile(PODFILE);

    expect(podfile).toContain(
      `-DREACT_NATIVE_MINOR_VERSION=${reactNativeMinor}`,
    );
    expect(podfile).toContain(
      `-DWORKLETS_VERSION=${dependencies["react-native-worklets"]}`,
    );
    expect(podfile).toContain(
      `-DREANIMATED_VERSION=${dependencies["react-native-reanimated"]}`,
    );
  });

  test("dedupe per flag so a partial prior prebuild cannot accumulate them", () => {
    const podfile = plugin.patchPodfile(PODFILE);
    expect(podfile).toContain("added_flags = flags.split");
    expect(podfile).not.toContain("next if compiler_flags.include?(flags)");
  });
});

describe("generated native project patches", () => {
  test("are idempotent across repeated prebuilds", () => {
    for (const [patch, input] of [
      [plugin.patchPodfile, PODFILE],
      [plugin.patchKotlinMainApplication, MAIN_APPLICATION],
      [plugin.patchSwiftAppDelegate, APP_DELEGATE],
      [
        plugin.patchAndroidSettingsGradle,
        "rootProject.name = 'Nemu'\ninclude ':app'\n",
      ],
      [
        plugin.patchAndroidAppBuildGradle,
        'dependencies {\n    implementation("com.facebook.react:react-android")\n}\n',
      ],
    ] as Array<[(contents: string) => string, string]>) {
      const once = patch(input);
      expect(patch(once)).toBe(once);
    }
  });

  test("wire the third-party JSC runtime into both platforms", () => {
    expect(plugin.patchKotlinMainApplication(MAIN_APPLICATION)).toContain(
      "jsRuntimeFactory = JSCRuntimeFactory()",
    );
    expect(plugin.patchSwiftAppDelegate(APP_DELEGATE)).toContain(
      "jsrt_create_jsc_factory()",
    );
    expect(
      plugin.patchAndroidAppBuildGradle(
        'dependencies {\n    implementation("com.facebook.react:react-android")\n}\n',
      ),
    ).toContain("implementation project(':react-native-community_javascriptcore')");
  });

  test("fail loudly instead of shipping an unpatched project", () => {
    expect(() =>
      plugin.patchKotlinMainApplication(
        MAIN_APPLICATION.replace("packageList =", "packages ="),
      ),
    ).toThrow(/pass JSCRuntimeFactory to the Expo React host/);
    expect(() =>
      plugin.patchSwiftAppDelegate(
        APP_DELEGATE.replace("ReactNativeDelegate", "RNDelegate"),
      ),
    ).toThrow(/install the JSC runtime factory override/);
    expect(() =>
      plugin.patchAndroidSettingsGradle("rootProject.name = 'Nemu'\n"),
    ).toThrow(/include the JavaScriptCore Gradle project/);
    expect(() => plugin.patchAndroidAppBuildGradle("dependencies {\n}\n")).toThrow(
      /add the JavaScriptCore project dependency/,
    );
  });
});

describe("Android network security policy", () => {
  test("points the manifest at the generated config", () => {
    const manifest: AndroidManifest = {
      manifest: { application: [{ $: { "android:name": ".MainApplication" } }] },
    };

    plugin.ensureAndroidFirstPartyNetworkSecurityConfig(manifest);

    expect(
      manifest.manifest.application?.[0]?.$?.["android:networkSecurityConfig"],
    ).toBe("@xml/nemu_network_security_config");
    expect(() =>
      plugin.ensureAndroidFirstPartyNetworkSecurityConfig({ manifest: {} }),
    ).toThrow("Android manifest is missing its application element.");
  });

  test("permits legacy source cleartext but never first-party cleartext", () => {
    const xml = plugin.androidNetworkSecurityConfigXml;
    expect(xml).toContain('<base-config cleartextTrafficPermitted="true">');
    expect(xml).toContain('<domain-config cleartextTrafficPermitted="false">');
    for (const domain of ["nemu.pm", "convex.cloud", "convex.site"]) {
      expect(xml).toContain(`<domain includeSubdomains="true">${domain}</domain>`);
    }
  });
});
