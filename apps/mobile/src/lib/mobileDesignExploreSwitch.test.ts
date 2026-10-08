import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
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
  test("off by default", () => {
    expect(resolveMobileDesignExplore({ platform: "ios", envDefault: false, stored: null })).toBe(false);
  });

  test("the env flag only changes the default", () => {
    expect(resolveMobileDesignExplore({ platform: "ios", envDefault: true, stored: null })).toBe(true);
  });

  test("a stored choice wins over the env default, both ways", () => {
    expect(resolveMobileDesignExplore({ platform: "ios", envDefault: true, stored: false })).toBe(false);
    expect(resolveMobileDesignExplore({ platform: "ios", envDefault: false, stored: true })).toBe(true);
  });

  test("Android (and web) never get it, and have no switch", () => {
    for (const platform of ["android", "web", undefined]) {
      expect(resolveMobileDesignExplore({ platform, envDefault: true, stored: true })).toBe(false);
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

  test("only the boot module reads the env flag; everything else reads the switch", () => {
    const root = path.join(import.meta.dir, "../..");
    const readers: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) {
          if (name !== "node_modules" && name !== "ios" && name !== "android") walk(full);
        } else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".test.ts")) {
          if (/process\.env\.EXPO_PUBLIC_NEMU_DESIGN_EXPLORE\b/.test(readFileSync(full, "utf8"))) {
            readers.push(path.relative(root, full));
          }
        }
      }
    };
    for (const dir of ["src", "app", "modules"]) walk(path.join(root, dir));
    expect(readers).toEqual(["src/lib/mobileDesignExploreBoot.native.ts"]);
  });

  test("the switch lives on its own Experimental Design page, in both designs, not in Appearance", () => {
    const root = path.join(import.meta.dir, "../..");
    const screen = readFileSync(path.join(root, "src/screens/SettingsScreen.tsx"), "utf8");
    // The page, and a root row for it in each design (explore group + original menu row).
    expect(screen).toContain("function ExperimentalDesignSection");
    expect(screen).toContain('activeSection === "experimental"');
    expect(screen.match(/openSection\("experimental"\)/g)?.length).toBe(2);
    expect(screen.match(/icon[:=]\s*\{?"flask-outline"/g)?.length).toBe(2);
    expect(screen.match(/isMobileDesignExploreSwitchAvailable\(Platform\.OS\)/g)?.length).toBeGreaterThanOrEqual(3);
    // Appearance no longer carries the switch.
    const appearance = screen.slice(
      screen.indexOf('activeSection === "appearance" ? ('),
      screen.indexOf('activeSection === "experimental" ? ('),
    );
    expect(appearance).not.toContain("ExperimentalDesignSection");
    expect(appearance).not.toContain("designPreview");
    // The page is one group (no card in a card): a single surface holds the switch and the restart row.
    const page = screen.slice(screen.indexOf("function ExperimentalDesignSection"), screen.indexOf("function MobileFeedbackSettingsCard"));
    expect(page.match(/<SettingsSurface/g)?.length).toBe(1);
    expect(page).toContain("designPreviewFooter");
    expect(page).toContain("reloadAppAsync");
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
