import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  createMobileLanguageDisplayNameResolver,
  intlLanguageDisplayName,
} from "./mobileLanguageDisplayNames";

const noIntl = () => undefined;

describe("mobile language display names", () => {
  test("prefers Intl.DisplayNames when the engine has it", () => {
    let nativeCalls = 0;
    const resolve = createMobileLanguageDisplayNameResolver(() => {
      nativeCalls += 1;
      return { ab: "native" };
    });

    // Bun, like iOS's JavaScriptCore, ships Intl.DisplayNames.
    expect(resolve("ab", "en")).toBe("Abkhazian");
    expect(intlLanguageDisplayName("af", "en")).toBe("Afrikaans");
    expect(nativeCalls).toBe(0);
  });

  test("falls back to the native lookup without Intl, localized per app language", () => {
    const requests: string[] = [];
    const resolve = createMobileLanguageDisplayNameResolver(
      (codes, displayLanguage) => {
        requests.push(`${displayLanguage}:${codes.join(",")}`);
        const names: Record<string, Record<string, string>> = {
          en: { ab: "Abkhazian", af: "Afrikaans" },
          zh: { ab: "阿布哈西亚语" },
          ja: { ab: "アブハズ語" },
        };
        return names[displayLanguage];
      },
      noIntl,
    );

    expect(resolve("ab", "en")).toBe("Abkhazian");
    expect(resolve("af", "en")).toBe("Afrikaans");
    expect(resolve("ab", "zh")).toBe("阿布哈西亚语");
    expect(resolve("ab", "ja")).toBe("アブハズ語");
    expect(requests).toEqual(["en:ab", "en:af", "zh:ab", "ja:ab"]);
  });

  test("caches answers, including misses, so re-renders stay off the bridge", () => {
    let calls = 0;
    const resolve = createMobileLanguageDisplayNameResolver(() => {
      calls += 1;
      return {};
    }, noIntl);

    expect(resolve("zz", "en")).toBeUndefined();
    expect(resolve("zz", "en")).toBeUndefined();
    expect(calls).toBe(1);
    expect(resolve("zz", "ja")).toBeUndefined();
    expect(calls).toBe(2);
  });

  test("a missing or throwing native lookup degrades to no name", () => {
    expect(createMobileLanguageDisplayNameResolver(null, noIntl)("ab", "en")).toBeUndefined();
    expect(
      createMobileLanguageDisplayNameResolver(() => undefined, noIntl)("ab", "en"),
    ).toBeUndefined();
    expect(
      createMobileLanguageDisplayNameResolver(() => {
        throw new Error("older native build");
      }, noIntl)("ab", "en"),
    ).toBeUndefined();
    expect(
      createMobileLanguageDisplayNameResolver(() => ({ ab: "  " }), noIntl)("ab", "en"),
    ).toBeUndefined();
  });

  test("Android resolves through the native module, iOS through Intl", () => {
    const read = (file: string) =>
      readFileSync(path.join(import.meta.dir, file), "utf8");
    const android = read("mobileLanguageDisplayNameResolver.android.ts");
    const fallback = read("mobileLanguageDisplayNameResolver.ts");

    expect(android).toContain("NemuAidokuModule.getLanguageDisplayNames?.(");
    expect(fallback).toContain("createMobileLanguageDisplayNameResolver(null)");

    const kotlinModule = readFileSync(
      path.join(
        import.meta.dir,
        "../../modules/nemu-aidoku/android/src/main/java/pm/nemu/mobile/aidoku/NemuAidokuModule.kt",
      ),
      "utf8",
    );
    expect(kotlinModule).toContain('Function("getLanguageDisplayNames")');
    expect(kotlinModule).toContain("NemuLanguageDisplayNames.displayNames(codes, displayLanguage)");
  });
});
