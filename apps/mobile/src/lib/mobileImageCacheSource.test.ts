import { describe, expect, test } from "bun:test";
import {
  normalizeMobileImageCacheSource,
  upgradeMobileImageUriScheme,
} from "./mobileImageCacheSource";

describe("mobile image cache source normalisation", () => {
  test("upgrades plain http image urls to https", () => {
    expect(
      upgradeMobileImageUriScheme(
        "http://oss.mkzcdn.com/comic/cover/20230106/63b78ffa50572-750x999.jpg",
      ),
    ).toBe(
      "https://oss.mkzcdn.com/comic/cover/20230106/63b78ffa50572-750x999.jpg",
    );
    expect(upgradeMobileImageUriScheme("HTTP://Example.test/a.png")).toBe(
      "https://Example.test/a.png",
    );
  });

  test("leaves https, local and malformed values untouched", () => {
    for (const uri of [
      "https://example.test/a.png",
      "file:///covers/a.png",
      "data:image/png;base64,AAAA",
      "httpx://example.test/a.png",
      "http:/example.test/a.png",
      "",
    ]) {
      expect(upgradeMobileImageUriScheme(uri)).toBe(uri);
    }
  });

  test("returns the same source object when nothing changes", () => {
    const source = { uri: "https://example.test/a.png", headers: { a: "b" } };
    expect(normalizeMobileImageCacheSource(source)).toBe(source);
    expect(normalizeMobileImageCacheSource(null)).toBeNull();
    expect(normalizeMobileImageCacheSource(undefined)).toBeUndefined();
  });

  test("rewrites the uri and keeps headers on an http source", () => {
    const source = { uri: "http://example.test/a.png", headers: { Referer: "x" } };
    expect(normalizeMobileImageCacheSource(source)).toEqual({
      uri: "https://example.test/a.png",
      headers: { Referer: "x" },
    });
  });
});
