import { describe, expect, test } from "bun:test";
import {
  deriveConvexSiteUrl,
  getMobileSyncConfig,
  resolveExpoScheme,
} from "./mobileSyncConfig";

describe("mobile sync config", () => {
  test("reads Expo public values from the default process env path", () => {
    const previousConvexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
    const previousSiteUrl = process.env.EXPO_PUBLIC_CONVEX_SITE_URL;
    const previousScheme = process.env.EXPO_PUBLIC_APP_SCHEME;

    try {
      process.env.EXPO_PUBLIC_CONVEX_URL = "https://default.convex.cloud";
      process.env.EXPO_PUBLIC_CONVEX_SITE_URL = "https://default.convex.site";
      process.env.EXPO_PUBLIC_APP_SCHEME = "nemu-test";

      expect(getMobileSyncConfig()).toMatchObject({
        convexUrl: "https://default.convex.cloud",
        siteUrl: "https://default.convex.site",
        scheme: "nemu-test",
        configured: true,
      });
    } finally {
      if (previousConvexUrl === undefined) {
        delete process.env.EXPO_PUBLIC_CONVEX_URL;
      } else {
        process.env.EXPO_PUBLIC_CONVEX_URL = previousConvexUrl;
      }
      if (previousSiteUrl === undefined) {
        delete process.env.EXPO_PUBLIC_CONVEX_SITE_URL;
      } else {
        process.env.EXPO_PUBLIC_CONVEX_SITE_URL = previousSiteUrl;
      }
      if (previousScheme === undefined) {
        delete process.env.EXPO_PUBLIC_APP_SCHEME;
      } else {
        process.env.EXPO_PUBLIC_APP_SCHEME = previousScheme;
      }
    }
  });

  test("derives the Convex site URL from a cloud URL", () => {
    expect(deriveConvexSiteUrl("https://example.convex.cloud")).toBe(
      "https://example.convex.site"
    );
    expect(deriveConvexSiteUrl("https://example.com")).toBeNull();
  });

  test("resolves the first non-empty Expo scheme", () => {
    expect(resolveExpoScheme(["", "nemu-dev"])).toBe("nemu-dev");
    expect(resolveExpoScheme("nemu")).toBe("nemu");
    expect(resolveExpoScheme(null)).toBe("nemu");
  });

  test("prefers Expo public sync URLs and falls back to Vite names", () => {
    expect(
      getMobileSyncConfig({
        EXPO_PUBLIC_CONVEX_URL: "https://expo.convex.cloud",
        EXPO_PUBLIC_CONVEX_SITE_URL: "https://expo.convex.site",
        VITE_CONVEX_URL: "https://vite.convex.cloud",
      })
    ).toMatchObject({
      convexUrl: "https://expo.convex.cloud",
      siteUrl: "https://expo.convex.site",
      configured: true,
    });

    expect(
      getMobileSyncConfig({
        VITE_CONVEX_URL: "https://vite.convex.cloud",
      })
    ).toMatchObject({
      convexUrl: "https://vite.convex.cloud",
      siteUrl: "https://vite.convex.site",
      configured: true,
    });
  });
});
