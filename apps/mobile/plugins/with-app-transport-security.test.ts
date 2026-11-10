import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "bun:test";

const require = createRequire(import.meta.url);
const plugin = require(path.join(import.meta.dir, "with-app-transport-security.cjs")) as {
  applyAppTransportSecurity: (plist: Record<string, unknown>) => Record<string, unknown>;
};

// On iOS 10+ any of these makes iOS ignore NSAllowsArbitraryLoads.
const NARROWER_GLOBAL_EXCEPTIONS = [
  "NSAllowsArbitraryLoadsForMedia",
  "NSAllowsArbitraryLoadsInWebContent",
  "NSAllowsLocalNetworking",
];

describe("App Transport Security", () => {
  test("plain http to any host, first-party hosts stay HTTPS-only", () => {
    const plist = plugin.applyAppTransportSecurity({});
    expect(plist.NSAppTransportSecurity).toEqual({
      NSAllowsArbitraryLoads: true,
      NSExceptionDomains: {
        "nemu.pm": { NSIncludesSubdomains: true, NSExceptionAllowsInsecureHTTPLoads: false },
        "convex.cloud": { NSIncludesSubdomains: true, NSExceptionAllowsInsecureHTTPLoads: false },
        "convex.site": { NSIncludesSubdomains: true, NSExceptionAllowsInsecureHTTPLoads: false },
      },
    });
  });

  test("drops every key that would switch arbitrary loads off", () => {
    const plist = plugin.applyAppTransportSecurity({
      NSAppTransportSecurity: Object.fromEntries(NARROWER_GLOBAL_EXCEPTIONS.map((key) => [key, true])),
    });
    const ats = plist.NSAppTransportSecurity as Record<string, unknown>;
    for (const key of NARROWER_GLOBAL_EXCEPTIONS) expect(ats[key]).toBeUndefined();
    expect(ats.NSAllowsArbitraryLoads).toBe(true);
  });

  test("the app config applies it last and sets no ATS of its own", () => {
    const app = JSON.parse(readFileSync(path.join(import.meta.dir, "..", "app.json"), "utf8")) as {
      expo: { plugins: unknown[]; ios: { infoPlist: Record<string, unknown> } };
    };
    expect(app.expo.plugins.at(-1)).toBe("./plugins/with-app-transport-security");
    expect(app.expo.ios.infoPlist.NSAppTransportSecurity).toBeUndefined();
  });
});
