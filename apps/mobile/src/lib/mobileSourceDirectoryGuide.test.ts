import { describe, expect, test } from "bun:test";
import {
  NEMU_SOURCE_DIRECTORIES_HELP_URL,
  hasMobileUserSourceDirectory,
  mobileAddSourceDirectoryBlocksDismiss,
  mobileSourceDirectoryAddressFromClipboard,
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
  test("the app links to no nemu page for source directories", () => {
    expect(NEMU_SOURCE_DIRECTORIES_HELP_URL).toBeNull();
  });

  test("a swipe-down is blocked by typed text or a check in flight", () => {
    expect(mobileAddSourceDirectoryBlocksDismiss({ address: "", checking: false })).toBe(false);
    expect(mobileAddSourceDirectoryBlocksDismiss({ address: "h", checking: false })).toBe(true);
    expect(mobileAddSourceDirectoryBlocksDismiss({ address: "", checking: true })).toBe(true);
  });
});
