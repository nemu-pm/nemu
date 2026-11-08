import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dir, "../../../..");
const mobilePackage = JSON.parse(
  readFileSync(path.join(repositoryRoot, "apps/mobile/package.json"), "utf8"),
) as { dependencies?: Record<string, string> };
const skiaRoot = path.join(repositoryRoot, "node_modules/@shopify/react-native-skia");
const requireFromSkia = createRequire(path.join(skiaRoot, "package.json"));
const installedSkia = JSON.parse(readFileSync(path.join(skiaRoot, "package.json"), "utf8")) as {
  version: string;
  dependencies: Record<string, string>;
};

function binaryPackageRoot(packageName: string): string {
  const manifestPath = requireFromSkia.resolve(`${packageName}/package.json`);
  const installed = JSON.parse(readFileSync(manifestPath, "utf8")) as { version: string };
  expect(installed.version).toBe(installedSkia.dependencies[packageName]);
  return path.dirname(manifestPath);
}

describe("mobile Skia install policy", () => {
  test("pins Skia and installs matching prebuilt binaries for both platforms", () => {
    expect(mobilePackage.dependencies?.["@shopify/react-native-skia"])
      .toBe(installedSkia.version);
    expect(installedSkia.version).toMatch(/^\d+\.\d+\.\d+$/);

    // Skia 2.11 uses npm binary packages, not a postinstall download. Android
    // consumes these directly; CocoaPods copies Apple frameworks during install.
    const androidRoot = binaryPackageRoot("react-native-skia-android");
    for (const abi of ["arm64-v8a", "armeabi-v7a", "x86", "x86_64"]) {
      expect(existsSync(path.join(androidRoot, "libs", abi, "libskia.a"))).toBe(true);
    }
    for (const platform of ["ios", "macos", "tvos"]) {
      const appleRoot = binaryPackageRoot(`react-native-skia-apple-${platform}`);
      expect(existsSync(path.join(appleRoot, "libs/libskia.xcframework/Info.plist"))).toBe(true);
    }
  });
});
