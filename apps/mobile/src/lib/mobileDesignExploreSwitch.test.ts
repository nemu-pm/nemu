import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  bootMobileDesignExplore,
  getMobileDesignExploreActive,
  isMobileDesignExploreSwitchAvailable,
  parseMobileDesignExploreStored,
  resolveMobileDesignExplore,
  serializeMobileDesignExploreStored,
} from "./mobileDesignExploreSwitch";

describe("new design (preview) switch", () => {
  test("off by default, and a stored choice decides both ways", () => {
    expect(resolveMobileDesignExplore({ platform: "ios", stored: null })).toBe(false);
    expect(resolveMobileDesignExplore({ platform: "ios", stored: true })).toBe(true);
    expect(resolveMobileDesignExplore({ platform: "ios", stored: false })).toBe(false);
  });

  test("Android (and web) never get it, and have no switch", () => {
    for (const platform of ["android", "web", undefined]) {
      expect(resolveMobileDesignExplore({ platform, stored: true })).toBe(false);
      expect(isMobileDesignExploreSwitchAvailable(platform)).toBe(false);
    }
    expect(isMobileDesignExploreSwitchAvailable("ios")).toBe(true);
  });

  test("the stored file round-trips; anything unreadable is no choice", () => {
    expect(parseMobileDesignExploreStored(serializeMobileDesignExploreStored(true))).toBe(true);
    expect(parseMobileDesignExploreStored(serializeMobileDesignExploreStored(false))).toBe(false);
    for (const text of [null, "", "{", "null", "{\"designPreview\":\"yes\"}", "[]"]) {
      expect(parseMobileDesignExploreStored(text)).toBeNull();
    }
  });

  test("the value a run starts with holds for the run (switching applies next launch)", () => {
    // Left at the default for the rest of this test process.
    expect(bootMobileDesignExplore(false)).toBe(false);
    expect(bootMobileDesignExplore(true)).toBe(false);
    expect(getMobileDesignExploreActive()).toBe(false);
  });

  test("the page and its rows are translated", () => {
    const root = path.join(import.meta.dir, "../..");
    const read = (name: string) => readFileSync(path.join(root, "src/lib", name), "utf8");
    expect(read("mobileI18n.en.ts")).toContain('experimentalDesign: "Experimental Design"');
    expect(read("mobileI18n.zh.ts")).toContain('experimentalDesign: "实验性设计"');
    expect(read("mobileI18n.ja.ts")).toContain('experimentalDesign: "実験的デザイン"');
    for (const name of ["mobileI18n.en.ts", "mobileI18n.zh.ts", "mobileI18n.ja.ts"]) {
      expect(read(name)).toContain("designPreviewFooter:");
    }
  });
});
