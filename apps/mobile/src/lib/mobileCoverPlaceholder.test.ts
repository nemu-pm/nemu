import { describe, expect, test } from "bun:test";
import {
  getMobileRegistrableDomain,
  isMobileHotlinkGuardedImageUrl,
  isMobileKnownPlaceholderImageResponse,
  isMobilePlaceholderCoverUrl,
  isMobileUsableCoverUrl,
  sanitizeMobileHotlinkImageHeaders,
} from "./mobileCoverPlaceholder";

const MANGADEX_COVER =
  "https://uploads.mangadex.org/covers/a4b39b6e-a448-4644-a540-64ceff1d8305/2c300b23-9ca4-4dd3-8722-7fe1d7bc8548.jpg.512.jpg";

describe("registrable domains", () => {
  test("collapses subdomains and keeps multi-label suffixes apart", () => {
    expect(getMobileRegistrableDomain(MANGADEX_COVER)).toBe("mangadex.org");
    expect(getMobileRegistrableDomain("https://cf.hamreus.com/cpic/b/1.jpg")).toBe(
      "hamreus.com",
    );
    expect(getMobileRegistrableDomain("https://a.b.example.co.jp/x")).toBe(
      "example.co.jp",
    );
    expect(getMobileRegistrableDomain("https://user@Host.Example.com:8443/")).toBe(
      "example.com",
    );
    expect(getMobileRegistrableDomain("file:///covers/a.png")).toBeNull();
    expect(getMobileRegistrableDomain("")).toBeNull();
  });
});

describe("hotlink header guard", () => {
  test("drops a foreign Referer/Origin on MangaDex covers", () => {
    // Manhuagui's modifyImageRequest Referer made MangaDex answer with its
    // "You can read this at mangadex.org" placeholder.
    expect(
      sanitizeMobileHotlinkImageHeaders(MANGADEX_COVER, {
        Referer: "https://www.manhuagui.com/",
        "User-Agent": "UA",
      }),
    ).toEqual({ "User-Agent": "UA" });
    expect(
      sanitizeMobileHotlinkImageHeaders(MANGADEX_COVER, {
        origin: "https://www.manhuagui.com",
      }),
    ).toBeUndefined();
  });

  test("keeps MangaDex's own Referer and leaves other hosts untouched", () => {
    const own = { Referer: "https://mangadex.org/title/x" };
    expect(sanitizeMobileHotlinkImageHeaders(MANGADEX_COVER, own)).toBe(own);
    const manhuagui = { Referer: "https://www.manhuagui.com/" };
    expect(
      sanitizeMobileHotlinkImageHeaders(
        "https://cf.hamreus.com/cpic/b/28985.jpg",
        manhuagui,
      ),
    ).toBe(manhuagui);
    expect(sanitizeMobileHotlinkImageHeaders(MANGADEX_COVER, undefined)).toBe(
      undefined,
    );
  });

  test("recognises guarded hosts", () => {
    expect(isMobileHotlinkGuardedImageUrl(MANGADEX_COVER)).toBe(true);
    expect(
      isMobileHotlinkGuardedImageUrl("https://abc.xyz.mangadex.network/data/1.png"),
    ).toBe(true);
    expect(isMobileHotlinkGuardedImageUrl("https://cf.hamreus.com/a.jpg")).toBe(
      false,
    );
  });
});

describe("placeholder detection", () => {
  test("fingerprints the MangaDex hotlink placeholder body", () => {
    expect(
      isMobileKnownPlaceholderImageResponse({
        url: MANGADEX_COVER,
        byteLength: 59_480,
      }),
    ).toBe(true);
    expect(
      isMobileKnownPlaceholderImageResponse({
        url: MANGADEX_COVER,
        byteLength: 155_433,
      }),
    ).toBe(false);
    // Same size elsewhere is just an image.
    expect(
      isMobileKnownPlaceholderImageResponse({
        url: "https://cf.hamreus.com/cpic/b/1.jpg",
        byteLength: 59_480,
      }),
    ).toBe(false);
    expect(
      isMobileKnownPlaceholderImageResponse({ url: MANGADEX_COVER, byteLength: null }),
    ).toBe(false);
  });

  test("treats static placeholder URLs as unusable covers", () => {
    for (const url of [
      "https://mangadex.org/img/cover-placeholder.jpg",
      "https://cdn.example.com/static/placeholder.png",
      "https://cdn.example.com/images/no-cover.jpg",
    ]) {
      expect(isMobilePlaceholderCoverUrl(url)).toBe(true);
      expect(isMobileUsableCoverUrl(url)).toBe(false);
    }
    for (const url of [MANGADEX_COVER, "https://cf.hamreus.com/cpic/b/28985.jpg"]) {
      expect(isMobilePlaceholderCoverUrl(url)).toBe(false);
      expect(isMobileUsableCoverUrl(url)).toBe(true);
    }
    expect(isMobileUsableCoverUrl("   ")).toBe(false);
    expect(isMobileUsableCoverUrl(undefined)).toBe(false);
  });
});
