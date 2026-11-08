import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { bootMobileDesignExplore, getMobileDesignExploreActive } from "./mobileDesignExploreSwitch";

describe("the design", () => {
  test("the run keeps its boot value", () => {
    // Left at the default for the rest of this test process.
    expect(bootMobileDesignExplore(false)).toBe(false);
    expect(bootMobileDesignExplore(true)).toBe(false);
    expect(getMobileDesignExploreActive()).toBe(false);
  });

  test("iOS always boots the design; there is no switch or stored choice any more", () => {
    const read = (name: string) => readFileSync(path.join(import.meta.dir, name), "utf8");
    expect(read("mobileDesignExploreBoot.native.ts")).toContain('bootMobileDesignExplore(Platform.OS === "ios")');
    for (const name of ["mobileDesignExploreBoot.native.ts", "mobileI18n.en.ts", "../screens/SettingsScreen.tsx"]) {
      expect(read(name)).not.toContain("designPreview");
      expect(read(name)).not.toContain("experimentalDesign");
    }
  });
});
