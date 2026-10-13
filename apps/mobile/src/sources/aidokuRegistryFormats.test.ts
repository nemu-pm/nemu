import { describe, expect, test } from "bun:test";
import {
  compareAidokuAppVersions,
  MOBILE_AIDOKU_COMPATIBLE_APP_VERSION,
  parseAidokuRegistryIndex,
} from "./aidokuRegistry";

const dir = { id: "d", name: "D", indexUrl: "https://x.example.com/lists/index.min.json" };

describe("Aidoku source list formats", () => {
  test("accepts the object form with a name", () => {
    const index = parseAidokuRegistryIndex(dir, {
      name: "My list",
      feedbackURL: "https://x.example.com/feedback",
      sources: [{ id: "en.a", name: "A", version: 2, downloadURL: "sources/a.aix", iconURL: "icons/a.png" }],
    });
    expect(index.name).toBe("My list");
    expect(index.sources[0]).toMatchObject({
      id: "en.a",
      version: 2,
      downloadUrl: "https://x.example.com/lists/sources/a.aix",
      icon: "https://x.example.com/lists/icons/a.png",
    });
  });

  test("accepts the legacy bare array, with no list name", () => {
    const index = parseAidokuRegistryIndex(dir, [{ id: "en.a", name: "A", version: 1, file: "a.aix" }]);
    expect(index.name).toBeUndefined();
    expect(index.sources).toHaveLength(1);
  });

  test("reads the deprecated file / icon / lang / nsfw fields", () => {
    const [source] = parseAidokuRegistryIndex(dir, [
      { id: "en.a", name: "A", version: 1, file: "a-v1.aix", icon: "a.png", lang: "en_US", nsfw: true },
    ]).sources;
    expect(source).toMatchObject({
      downloadUrl: "https://x.example.com/lists/sources/a-v1.aix",
      icon: "https://x.example.com/lists/icons/a.png",
      languages: ["en-us"],
      contentRating: 2,
    });
  });

  test("resolves relative and absolute URLs against the list, and refuses plain-http packages", () => {
    const [source] = parseAidokuRegistryIndex(dir, {
      sources: [
        { id: "a", name: "A", version: 1, downloadURL: "../elsewhere/a.aix", iconURL: "https://cdn.example.com/a.png" },
        { id: "b", name: "B", version: 1, downloadURL: "http://insecure.example.com/b.aix" },
      ],
    }).sources;
    expect(source).toMatchObject({
      downloadUrl: "https://x.example.com/elsewhere/a.aix",
      icon: "https://cdn.example.com/a.png",
    });
    expect(
      parseAidokuRegistryIndex(dir, { sources: [{ id: "b", name: "B", version: 1, downloadURL: "http://insecure.example.com/b.aix" }] }).sources[0]!.downloadUrl,
    ).toBeUndefined();
  });

  test("something that is not a list has no sources", () => {
    expect(parseAidokuRegistryIndex(dir, { hello: "world" }).sources).toEqual([]);
    expect(parseAidokuRegistryIndex(dir, "<html>").sources).toEqual([]);
  });
});

describe("minAppVersion / maxAppVersion", () => {
  const entries = [
    { id: "ok", name: "ok", version: 1 },
    { id: "min090", name: "m", version: 1, minAppVersion: "0.9.0" },
    { id: "min091", name: "m", version: 1, minAppVersion: "0.9.1" },
    { id: "min10", name: "m", version: 1, minAppVersion: "1.0" },
    { id: "max08", name: "m", version: 1, maxAppVersion: "0.8.9" },
    { id: "max09", name: "m", version: 1, maxAppVersion: "0.9.0" },
  ];
  const ids = (appVersion?: string) =>
    parseAidokuRegistryIndex(dir, entries, appVersion ? { appVersion } : {}).sources.map((s) => s.id);

  test("a source needing exactly the supported version still shows", () => {
    expect(MOBILE_AIDOKU_COMPATIBLE_APP_VERSION).toBe("0.9.0");
    expect(ids()).toEqual(["ok", "min090", "max09"]);
  });

  test("filters by the version it is given", () => {
    expect(ids("1.0.0")).toEqual(["ok", "min090", "min091", "min10"]);
    expect(ids("0.7.1")).toEqual(["ok", "max08", "max09"]);
  });

  test("compares numerically, padding missing parts", () => {
    expect(compareAidokuAppVersions("0.9", "0.9.0")).toBe(0);
    expect(compareAidokuAppVersions("0.10.0", "0.9.9")).toBe(1);
    expect(compareAidokuAppVersions("v0.8.4", "0.9.0")).toBe(-1);
  });
});
