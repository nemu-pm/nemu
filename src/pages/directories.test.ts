import { describe, expect, test } from "bun:test";
import en from "@/locales/en.json";
import ja from "@/locales/ja.json";
import zh from "@/locales/zh.json";
import { LISTED_SOURCE_DIRECTORIES, nemuAddDirectoryLink } from "./directories-list";

describe("listed source directories", () => {
  test("each has a unique id, an HTTPS index address and en + zh descriptions", () => {
    const ids = LISTED_SOURCE_DIRECTORIES.map((directory) => directory.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const directory of LISTED_SOURCE_DIRECTORIES) {
      expect(new URL(directory.indexUrl).protocol).toBe("https:");
      expect(new URL(directory.publisherUrl).protocol).toBe("https:");
      expect(directory.indexUrl.endsWith("index.min.json")).toBe(true);
      expect(directory.description.en.length).toBeGreaterThan(0);
      expect(directory.description.zh.length).toBeGreaterThan(0);
      expect(directory.languages.length).toBeGreaterThan(0);
    }
  });

  test("only nemu's own directory is marked built in", () => {
    expect(
      LISTED_SOURCE_DIRECTORIES.filter((directory) => directory.builtIn).map((directory) => directory.id),
    ).toEqual(["nemu-recommended"]);
  });

  test("add links carry the address percent-encoded in the format the app parses", () => {
    const url = "https://e.com/a b/index.min.json?x=1&y=2";
    const link = nemuAddDirectoryLink(url);
    expect(link.startsWith("nemu://addSourceList?url=")).toBe(true);
    const query = link.slice(link.indexOf("?") + 1);
    expect(query).not.toContain("&");
    expect(new URLSearchParams(query).get("url")).toBe(url);
  });
});

describe("directory page copy", () => {
  test("en and zh have the same keys; ja falls back to English", () => {
    expect(Object.keys(zh.directoriesPage).sort()).toEqual(Object.keys(en.directoriesPage).sort());
    expect("directoriesPage" in ja).toBe(false);
  });

  test("the disclaimer says nemu does not host, review or endorse listed directories", () => {
    expect(en.directoriesPage.disclaimer).toContain("does not host, review or endorse");
    expect(zh.directoriesPage.disclaimer).toContain("不托管、审核或认可");
  });
});
