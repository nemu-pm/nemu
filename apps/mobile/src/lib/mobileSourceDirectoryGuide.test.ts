import { describe, expect, test } from "bun:test";
import {
  AIDOKU_SOURCE_LISTS_GUIDE_URL,
  NEMU_SOURCE_DIRECTORIES_PAGE_URL,
  hasMobileUserSourceDirectory,
  mobileSourceDirectoryAddressFromClipboard,
  parseMobileAddSourceDirectoryOrigin,
} from "./mobileSourceDirectoryGuide";

describe("hasMobileUserSourceDirectory", () => {
  test("only the built-in demo directory is not a user directory", () => {
    expect(hasMobileUserSourceDirectory([])).toBe(false);
    expect(hasMobileUserSourceDirectory([{ builtIn: true, enabled: true }])).toBe(false);
  });

  test("a switched-off user directory does not count", () => {
    expect(
      hasMobileUserSourceDirectory([
        { builtIn: true, enabled: true },
        { builtIn: false, enabled: false },
      ]),
    ).toBe(false);
    expect(
      hasMobileUserSourceDirectory([
        { builtIn: true, enabled: true },
        { builtIn: false, enabled: true },
      ]),
    ).toBe(true);
  });
});

describe("mobileSourceDirectoryAddressFromClipboard", () => {
  test("keeps a plain address", () => {
    expect(mobileSourceDirectoryAddressFromClipboard(" https://e.com/sources \n")).toBe("https://e.com/sources");
  });

  test("unwraps nemu, aidoku and aidoku.app links to the address inside", () => {
    expect(mobileSourceDirectoryAddressFromClipboard("nemu://addSourceList?url=https%3A%2F%2Fe.com%2Fi.json")).toBe("https://e.com/i.json");
    expect(mobileSourceDirectoryAddressFromClipboard("aidoku://addSourceList?url=https://e.com/i.json")).toBe("https://e.com/i.json");
    expect(mobileSourceDirectoryAddressFromClipboard("https://aidoku.app/add-source-list/?url=https://e.com/i.json")).toBe("https://e.com/i.json");
  });

  test("ignores text that is not an address", () => {
    expect(mobileSourceDirectoryAddressFromClipboard(null)).toBeNull();
    expect(mobileSourceDirectoryAddressFromClipboard("")).toBeNull();
    expect(mobileSourceDirectoryAddressFromClipboard("hello world")).toBeNull();
    expect(mobileSourceDirectoryAddressFromClipboard("see https://e.com")).toBeNull();
    expect(mobileSourceDirectoryAddressFromClipboard("aidoku://en.x/y")).toBeNull();
  });
});

describe("guide links", () => {
  test("the Aidoku guide is Aidoku's own site, over HTTPS", () => {
    expect(new URL(AIDOKU_SOURCE_LISTS_GUIDE_URL).origin).toBe("https://aidoku.app");
  });

  test("the nemu directory page stays hidden until it is published", () => {
    expect(NEMU_SOURCE_DIRECTORIES_PAGE_URL).toBeNull();
  });

  test("origin defaults to Settings", () => {
    expect(parseMobileAddSourceDirectoryOrigin("browse")).toBe("browse");
    expect(parseMobileAddSourceDirectoryOrigin("settings")).toBe("settings");
    expect(parseMobileAddSourceDirectoryOrigin(undefined)).toBe("settings");
    expect(parseMobileAddSourceDirectoryOrigin(["browse"])).toBe("settings");
  });
});
