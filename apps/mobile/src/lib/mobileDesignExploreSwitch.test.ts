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
  test("off by default; a stored choice decides; Android and web never get it", () => {
    expect(resolveMobileDesignExplore({ platform: "ios", stored: null })).toBe(false);
    expect(resolveMobileDesignExplore({ platform: "ios", stored: true })).toBe(true);
    expect(resolveMobileDesignExplore({ platform: "ios", stored: false })).toBe(false);
    for (const platform of ["android", "web", undefined]) {
      expect(resolveMobileDesignExplore({ platform, stored: true })).toBe(false);
      expect(isMobileDesignExploreSwitchAvailable(platform)).toBe(false);
    }
  });

  test("the stored file round-trips; anything unreadable is no choice; the run keeps its boot value", () => {
    expect(parseMobileDesignExploreStored(serializeMobileDesignExploreStored(true))).toBe(true);
    expect(parseMobileDesignExploreStored("{\"designPreview\":\"yes\"}")).toBeNull();
    expect(parseMobileDesignExploreStored("{not json")).toBeNull();
    // Left at the default for the rest of this test process.
    expect(bootMobileDesignExplore(false)).toBe(false);
    expect(bootMobileDesignExplore(true)).toBe(false);
    expect(getMobileDesignExploreActive()).toBe(false);
  });

  test("the page and its rows are translated", () => {
    const read = (name: string) => readFileSync(path.join(import.meta.dir, name), "utf8");
    expect(read("mobileI18n.en.ts")).toContain('experimentalDesign: "Experimental Design"');
    expect(read("mobileI18n.zh.ts")).toContain('experimentalDesign: "实验性设计"');
    expect(read("mobileI18n.ja.ts")).toContain('experimentalDesign: "実験的デザイン"');
  });
});
