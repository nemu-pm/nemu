import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "bun:test";

const require = createRequire(import.meta.url);
const plugin = require(path.join(import.meta.dir, "with-phone-portrait-launch.cjs")) as {
  applyPhonePortraitLaunch: (plist: Record<string, unknown>) => Record<string, unknown>;
};

const ALL = [
  "UIInterfaceOrientationPortrait",
  "UIInterfaceOrientationPortraitUpsideDown",
  "UIInterfaceOrientationLandscapeLeft",
  "UIInterfaceOrientationLandscapeRight",
];

describe("phone portrait launch", () => {
  test("iPhone allows every iPhone orientation (the gate narrows an ordinary one), iPad keeps every orientation", () => {
    const plist = plugin.applyPhonePortraitLaunch({
      UISupportedInterfaceOrientations: [...ALL],
      "UISupportedInterfaceOrientations~ipad": [...ALL],
    });
    expect(plist.UISupportedInterfaceOrientations).toEqual([
      "UIInterfaceOrientationPortrait",
      "UIInterfaceOrientationLandscapeLeft",
      "UIInterfaceOrientationLandscapeRight",
    ]);
    expect(plist["UISupportedInterfaceOrientations~ipad"]).toEqual(ALL);
  });

  test("expo-screen-orientation's iPhone default stays wide so the foldable gate decides", () => {
    const plist = plugin.applyPhonePortraitLaunch({ EXDefaultScreenOrientationMask: "UIInterfaceOrientationMaskPortrait" });
    // Expo refuses an upside-down mask on a Face ID iPhone and falls back to the plist list.
    expect(plist["EXDefaultScreenOrientationMask~iphone"]).toBe("UIInterfaceOrientationMaskAllButUpsideDown");
    // iPad reads UISupportedInterfaceOrientations~ipad.
    expect(plist.EXDefaultScreenOrientationMask).toBeUndefined();
  });

  test("the app config applies it, the gate subscribes to the app delegate, the launch screen is a plain colour", () => {
    const app = JSON.parse(readFileSync(path.join(import.meta.dir, "..", "app.json"), "utf8")) as {
      expo: { plugins: unknown[] };
    };
    expect(app.expo.plugins).toContain("./plugins/with-phone-portrait-launch");
    expect(app.expo.plugins).toContain("./plugins/with-launch-screen-background");
    const moduleConfig = JSON.parse(
      readFileSync(path.join(import.meta.dir, "..", "modules", "nemu-window-layout", "expo-module.config.json"), "utf8"),
    ) as { apple: { appDelegateSubscribers?: string[] } };
    expect(moduleConfig.apple.appDelegateSubscribers).toContain("NemuOrientationGateAppDelegate");
  });
});
