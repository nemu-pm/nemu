import { describe, expect, mock, test } from "bun:test";

const submitted: string[] = [];
mock.module("expo-router", () => ({ router: {} }));
mock.module("@/lib/mobileSourceDirectoryLinkInbox", () => ({
  submitMobileSourceDirectoryLink: (url: string) => void submitted.push(url),
}));

const { redirectSystemPath } = await import("../../app/+native-intent");
const link = "https://example.com/i.json";

describe("addSourceList links", () => {
  test("cold launch: both schemes confirm, then open the library", () => {
    submitted.length = 0;
    for (const scheme of ["nemu", "aidoku"]) {
      expect(redirectSystemPath({ path: `${scheme}://addSourceList?url=${encodeURIComponent(link)}`, initial: true })).toBe("/");
    }
    expect(submitted).toEqual([link, link]);
  });

  test("warm app: both schemes confirm and keep the current screen", () => {
    submitted.length = 0;
    for (const scheme of ["nemu", "aidoku"]) {
      expect(redirectSystemPath({ path: `${scheme}://addSourceList?url=${link}`, initial: false })).toBeNull();
    }
    expect(submitted).toEqual([link, link]);
  });

  test("other aidoku:// links are ignored without routing or a prompt", () => {
    submitted.length = 0;
    expect(redirectSystemPath({ path: "aidoku://en.mangadex/abc", initial: true })).toBe("/");
    expect(redirectSystemPath({ path: "aidoku://en.mangadex/abc", initial: false })).toBeNull();
    expect(submitted).toEqual([]);
  });

  test("an unrelated path is passed through on launch", () => {
    expect(redirectSystemPath({ path: "/settings", initial: true })).toBe("/settings");
  });
});
