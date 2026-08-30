import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dir, "../../../..");
const rootPackage = JSON.parse(
  readFileSync(path.join(repositoryRoot, "package.json"), "utf8"),
) as { trustedDependencies?: string[] };
const mobilePackage = JSON.parse(
  readFileSync(path.join(repositoryRoot, "apps/mobile/package.json"), "utf8"),
) as { dependencies?: Record<string, string> };

describe("mobile Skia install policy", () => {
  test("trusts the pinned lifecycle script and hydrates every native platform", () => {
    expect(rootPackage.trustedDependencies).toContain(
      "@shopify/react-native-skia",
    );
    expect(
      mobilePackage.dependencies?.["@shopify/react-native-skia"],
    ).toBe("2.6.2");

    const skiaRoot = path.join(
      repositoryRoot,
      "node_modules/@shopify/react-native-skia/libs",
    );
    expect(existsSync(path.join(skiaRoot, "android"))).toBe(true);
    expect(existsSync(path.join(skiaRoot, "ios/libskia.xcframework"))).toBe(
      true,
    );
  });
});
