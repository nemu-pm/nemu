import { describe, expect, test } from "bun:test";
import en from "@/locales/en.json";
import ja from "@/locales/ja.json";
import zh from "@/locales/zh.json";
import { parseMobileSourceDirectoryLink } from "../../apps/mobile/src/lib/mobileSourceDirectoryLink";
import { addSourceListLinkFor, nemuAddSourceListLink } from "./source-directory-links";

describe("add source list links", () => {
  test("carry the address percent-encoded, as the app parses it", () => {
    const url = "https://e.com/a b/index.min.json?x=1&y=2";
    const link = nemuAddSourceListLink(url);
    expect(link.startsWith("nemu://addSourceList?url=")).toBe(true);
    expect(link.slice(link.indexOf("?") + 1)).not.toContain("&");
    expect(parseMobileSourceDirectoryLink(link)).toEqual({ kind: "add-directory", url });
  });

  test("the builder links a valid address as typed, trimmed", () => {
    expect(addSourceListLinkFor("  https://example.com/sources  ")).toEqual({
      ok: true,
      link: "nemu://addSourceList?url=https%3A%2F%2Fexample.com%2Fsources",
    });
  });

  test("the builder refuses what the app refuses", () => {
    expect(addSourceListLinkFor("http://example.com/index.min.json")).toEqual({ ok: false, reason: "not-https" });
    expect(addSourceListLinkFor("https://192.168.1.2/index.min.json")).toEqual({ ok: false, reason: "local-host" });
    expect(addSourceListLinkFor("https://u:p@example.com/")).toEqual({ ok: false, reason: "credentials" });
    expect(addSourceListLinkFor("example.com")).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("source directories help copy", () => {
  test("en and zh have the same keys; ja falls back to English", () => {
    expect(Object.keys(zh.sourceDirectoriesHelp).sort()).toEqual(Object.keys(en.sourceDirectoriesHelp).sort());
    expect("sourceDirectoriesHelp" in ja).toBe(false);
  });

  test("names no third-party directory", () => {
    const copy = JSON.stringify([en.sourceDirectoriesHelp, zh.sourceDirectoriesHelp]);
    for (const name of ["Aidoku Community", "aidoku-community", "github.io", "suiyuran", "0BlueYan0", "jsdelivr"]) {
      expect(copy).not.toContain(name);
    }
  });

  test("keeps the third-party disclaimer", () => {
    expect(en.sourceDirectoriesHelp.disclaimer).toContain("does not host, review or endorse");
    expect(zh.sourceDirectoriesHelp.disclaimer).toContain("不托管、审核或认可");
  });
});
