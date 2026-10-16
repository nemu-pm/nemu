import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "bun:test";

const require = createRequire(import.meta.url);
const plugin = require(path.join(import.meta.dir, "with-launch-screen-background.cjs")) as {
  applyLaunchScreenBackground: (xml: unknown) => unknown;
};
const { Parser } = require("xml2js") as { Parser: new () => { parseStringPromise: (xml: string) => Promise<unknown> } };

const TEMPLATE = `<document><scenes><scene><objects><viewController><view key="view">
  <color key="backgroundColor" systemColor="systemBackgroundColor"/>
</view></viewController></objects></scene></scenes><resources/></document>`;

type Storyboard = { document: { scenes: [{ scene: [{ objects: [{ viewController: [{ view: [{ color: [{ $: Record<string, string> }] }] }] }] }] }] } };

describe("launch screen background", () => {
  test("the template's system background becomes the page-colour set", async () => {
    const xml = (await new Parser().parseStringPromise(TEMPLATE)) as Storyboard;
    plugin.applyLaunchScreenBackground(xml);
    const view = xml.document.scenes[0].scene[0].objects[0].viewController[0].view[0];
    expect(view.color).toEqual([{ $: { key: "backgroundColor", name: "SplashScreenBackground" } }]);
  });

  test("the splash config gives that set the page colours", () => {
    const app = JSON.parse(readFileSync(path.join(import.meta.dir, "..", "app.json"), "utf8")) as {
      expo: { plugins: Array<string | [string, Record<string, unknown>]> };
    };
    const splash = app.expo.plugins.find((entry) => Array.isArray(entry) && entry[0] === "expo-splash-screen") as
      | [string, { backgroundColor: string; dark: { backgroundColor: string } }]
      | undefined;
    expect(splash?.[1].backgroundColor).toBe("#f8fafe");
    expect(splash?.[1].dark.backgroundColor).toBe("#090a0d");
    expect(app.expo.plugins).toContain("./plugins/with-launch-screen-background");
  });
});
