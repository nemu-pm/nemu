import { describe, expect, test } from "bun:test";
import {
  extractMobileSourceDirectoryUrl,
  parseMobileSourceDirectoryLink,
} from "./mobileSourceDirectoryLink";

const add = (url: string) => ({ kind: "add-directory" as const, url });

describe("parseMobileSourceDirectoryLink", () => {
  test("reads an encoded url for both schemes", () => {
    const encoded = encodeURIComponent("https://nemu-pm.github.io/source-registry/index.min.json");
    expect(parseMobileSourceDirectoryLink(`nemu://addSourceList?url=${encoded}`)).toEqual(
      add("https://nemu-pm.github.io/source-registry/index.min.json"),
    );
    expect(parseMobileSourceDirectoryLink(`aidoku://addSourceList?url=${encoded}`)).toEqual(
      add("https://nemu-pm.github.io/source-registry/index.min.json"),
    );
  });

  test("reads an unencoded url, including its own query", () => {
    expect(parseMobileSourceDirectoryLink("nemu://addSourceList?url=https://example.com/list")).toEqual(
      add("https://example.com/list"),
    );
    expect(parseMobileSourceDirectoryLink("aidoku://addSourceList?url=https://example.com/l.json?a=1&b=2")).toEqual(
      add("https://example.com/l.json?a=1&b=2"),
    );
  });

  test("is case-insensitive and tolerates slashes and extra params", () => {
    expect(parseMobileSourceDirectoryLink("AIDOKU://ADDSOURCELIST?x=1&url=https%3A%2F%2Fe.com%2Fa")).toEqual(
      add("https://e.com/a"),
    );
    expect(parseMobileSourceDirectoryLink("nemu:///addSourceList/?url=https%3A%2F%2Fe.com")).toEqual(
      add("https://e.com"),
    );
  });

  test("other aidoku:// links are ignored, not errors", () => {
    expect(parseMobileSourceDirectoryLink("aidoku://en.mangadex/abc-123")).toEqual({ kind: "ignored" as const });
    expect(parseMobileSourceDirectoryLink("aidoku://")).toEqual({ kind: "ignored" as const });
    expect(parseMobileSourceDirectoryLink("aidoku://addSourceList")).toEqual({ kind: "ignored" as const });
    expect(parseMobileSourceDirectoryLink("aidoku://addSourceList?url=")).toEqual({ kind: "ignored" as const });
    expect(parseMobileSourceDirectoryLink("aidoku://addSourceList?url=%E0%A4%A")).toEqual({ kind: "ignored" as const });
  });

  test("nemu:// links to tabs and screens stay with the router", () => {
    for (const input of ["nemu://library", "nemu:///settings", "nemu://"]) {
      expect(parseMobileSourceDirectoryLink(input)).toBeNull();
    }
  });

  test("anything else is not ours", () => {
    for (const input of ["", "garbage", "https://example.com/addSourceList?url=x", "other://addSourceList?url=https://x.y", "/library"]) {
      expect(parseMobileSourceDirectoryLink(input)).toBeNull();
    }
  });
});

describe("extractMobileSourceDirectoryUrl", () => {
  test("unwraps pasted links and leaves everything else alone", () => {
    expect(extractMobileSourceDirectoryUrl(" aidoku://addSourceList?url=https%3A%2F%2Fe.com%2Fi.json ")).toBe("https://e.com/i.json");
    expect(extractMobileSourceDirectoryUrl("https://e.com/i.json")).toBe("https://e.com/i.json");
    expect(extractMobileSourceDirectoryUrl("aidoku://en.x/y")).toBe("aidoku://en.x/y");
    expect(extractMobileSourceDirectoryUrl("")).toBe("");
  });
});
