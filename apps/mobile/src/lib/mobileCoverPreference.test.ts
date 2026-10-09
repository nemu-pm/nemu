import { describe, expect, test } from "bun:test";
import {
  getMobileCoverSizeVariants,
  isMobileCoverBelowSharp,
  isMobileSameCoverArt,
  parseMobileCoverPreferenceStore,
  pickMobileSharperCover,
  rememberMobileCoverPreference,
  serializeMobileCoverPreferenceStore,
} from "./mobileCoverPreference";

const own = (width: number | null) => ({ url: "https://a.example/thumb.jpg", width });
const same = (url: string, width: number | null) => ({ url, width, sameArt: true });

/** A synthetic cover on the fingerprint grid: `paint(x, y)` → [r, g, b]. */
function raster(paint: (x: number, y: number) => [number, number, number]): Uint8Array {
  const pixels = new Uint8Array(12 * 18 * 4);
  for (let y = 0; y < 18; y += 1)
    for (let x = 0; x < 12; x += 1) pixels.set([...paint(x, y), 255], (y * 12 + x) * 4);
  return pixels;
}

describe("a sharper copy of the same cover", () => {
  test("a clearly wider copy of the same artwork replaces a thumbnail, the widest wins; another artwork, unmeasured pixels or width never do", () => {
    expect(pickMobileSharperCover(own(132), [same("https://b.example/240.jpg", 240)])).toBe("https://b.example/240.jpg");
    expect(pickMobileSharperCover(own(132), [same("https://b.example/300.jpg", 300), same("https://c.example/600.jpg", 600)])).toBe(
      "https://c.example/600.jpg",
    );
    expect(pickMobileSharperCover(own(132), [{ url: "https://b.example/v.jpg", width: 512, sameArt: false }])).toBeNull();
    expect(pickMobileSharperCover(own(132), [{ url: "https://b.example/v.jpg", width: 512, sameArt: null }])).toBeNull();
    expect(pickMobileSharperCover(own(132), [same("https://b.example/x.jpg", null)])).toBeNull();
    expect(pickMobileSharperCover(own(null), [same("https://b.example/512.jpg", 512)])).toBeNull();
  });

  test("the own cover is kept unless the gain is clear, it is a thumbnail, and the copy is another URL; thumbnails are worth looking past", () => {
    expect(pickMobileSharperCover(own(300), [same("https://b.example/400.jpg", 400)])).toBeNull();
    expect(pickMobileSharperCover(own(480), [same("https://b.example/1200.jpg", 1200)])).toBeNull();
    expect(pickMobileSharperCover(own(132), [same(own(0).url, 900)])).toBeNull();
    expect(isMobileCoverBelowSharp(132)).toBe(true);
    expect(isMobileCoverBelowSharp(512)).toBe(false);
  });

  test("size variants: only the patterns the sources serve, nothing already large", () => {
    const cases: Array<[string | null, string[]]> = [
      ["https://cf.hamreus.com/cpic/b/16891.jpg", ["https://cf.hamreus.com/cpic/g/16891.jpg"]],
      ["https://cf.hamreus.com/cpic/g/16891.jpg", []],
      ["https://deliver.cdn.nicomanga.jp/material/2d65e4/15535882qa?1723143012", ["https://deliver.cdn.nicomanga.jp/material/2d65e4/15535882?1723143012"]],
      ["https://uploads.mangadex.org/covers/m/c.jpg.256.jpg", ["https://uploads.mangadex.org/covers/m/c.jpg.512.jpg"]],
      ["https://uploads.mangadex.org/covers/m/c.jpg.512.jpg", []],
      ["https://example.com/cpic/b/1.jpg", []],
      [null, []],
    ];
    for (const [url, variants] of cases) expect(getMobileCoverSizeVariants(url)).toEqual(variants);
  });

  test("same artwork: resized copies match, other pictures, colour schemes and unreadable pixels do not", () => {
    const art = raster((x, y) => [(x * 21 + y * 3) % 256, (y * 14) % 256, ((x + y) * 9) % 256]);
    const copy = raster((x, y) => {
      const n = ((x * 7 + y * 13) % 5) - 2;
      return [Math.max(0, ((x * 21 + y * 3) % 256) + n), Math.max(0, ((y * 14) % 256) - n), Math.max(0, (((x + y) * 9) % 256) + n)];
    });
    expect(isMobileSameCoverArt(art, copy)).toBe(true);
    expect(isMobileSameCoverArt(art, raster((x, y) => [255 - ((y * 14) % 256), (x * 21) % 256, 200 - ((x * y) % 120)]))).toBe(false);
    expect(isMobileSameCoverArt(art, raster((x, y) => [((x + y) * 9) % 256, (x * 21 + y * 3) % 256, (y * 14) % 256]))).toBe(false);
    const flat = (v: number) => raster(() => [v, v, v]);
    expect(isMobileSameCoverArt(flat(40), flat(44))).toBe(true);
    expect(isMobileSameCoverArt(flat(40), flat(200))).toBe(false);
    expect(isMobileSameCoverArt(art, null)).toBeNull();
  });

  test("the remembered picks survive a round trip, stay bounded and ignore damaged input", () => {
    const store = parseMobileCoverPreferenceStore(null);
    expect(rememberMobileCoverPreference(store, "item-1", "https://b.example/512.jpg")).toBe(true);
    expect(rememberMobileCoverPreference(store, "item-1", "https://b.example/512.jpg")).toBe(false);
    expect(rememberMobileCoverPreference(store, "item-2", "data:image/png;base64,AAAA")).toBe(false);
    const again = parseMobileCoverPreferenceStore(serializeMobileCoverPreferenceStore(store));
    expect([...again]).toEqual([["item-1", "https://b.example/512.jpg"]]);
    for (let index = 0; index < 300 + 5; index += 1) {
      rememberMobileCoverPreference(again, `item-${index}`, `https://b.example/${index}.jpg`);
    }
    expect(again.size).toBe(300);
    expect(parseMobileCoverPreferenceStore("{not json").size).toBe(0);
  });
});
