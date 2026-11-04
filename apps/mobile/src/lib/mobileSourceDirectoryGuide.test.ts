import { describe, expect, test } from "bun:test";
import {
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
  test("the directory page is the web app's /directories route on nemu.pm", () => {
    const url = new URL(NEMU_SOURCE_DIRECTORIES_PAGE_URL);
    expect(url.origin).toBe("https://nemu.pm");
    expect(url.pathname).toBe("/directories");
  });

  test("origin defaults to Settings", () => {
    expect(parseMobileAddSourceDirectoryOrigin("browse")).toBe("browse");
    expect(parseMobileAddSourceDirectoryOrigin("settings")).toBe("settings");
    expect(parseMobileAddSourceDirectoryOrigin(undefined)).toBe("settings");
    expect(parseMobileAddSourceDirectoryOrigin(["browse"])).toBe("settings");
  });
});
