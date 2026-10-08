import { describe, expect, test } from "bun:test";
import {
  MOBILE_COVER_FINGERPRINT_HEIGHT,
  MOBILE_COVER_FINGERPRINT_WIDTH,
  MOBILE_COVER_PREFERENCE_STORE_LIMIT,
  compareMobileCoverFingerprints,
  getMobileCoverSizeVariants,
  isMobileCoverSizeVariantOf,
  isMobileSameCoverArt,
  isMobileCoverBelowSharp,
  parseMobileCoverPreferenceStore,
  pickMobileSharperCover,
  rememberMobileCoverPreference,
  serializeMobileCoverPreferenceStore,
} from "./mobileCoverPreference";

const own = (width: number | null) => ({ url: "https://a.example/thumb.jpg", width });
const same = (url: string, width: number | null) => ({ url, width, sameArt: true });

/** A synthetic cover on the fingerprint grid: `paint(x, y)` → [r, g, b]. */
function raster(paint: (x: number, y: number) => [number, number, number]): Uint8Array {
  const pixels = new Uint8Array(MOBILE_COVER_FINGERPRINT_WIDTH * MOBILE_COVER_FINGERPRINT_HEIGHT * 4);
  for (let y = 0; y < MOBILE_COVER_FINGERPRINT_HEIGHT; y += 1) {
    for (let x = 0; x < MOBILE_COVER_FINGERPRINT_WIDTH; x += 1) {
      const offset = (y * MOBILE_COVER_FINGERPRINT_WIDTH + x) * 4;
      const [r, g, b] = paint(x, y);
      pixels.set([r, g, b, 255], offset);
    }
  }
  return pixels;
}

describe("a sharper copy of the same cover", () => {
  test("a clearly larger copy of the same artwork replaces a thumbnail", () => {
    // Manhuagui's 132 px thumbnail, its own 240 px size of the same picture.
    expect(pickMobileSharperCover(own(132), [same("https://b.example/240.jpg", 240)])).toBe(
      "https://b.example/240.jpg",
    );
    // The widest copy wins.
    expect(
      pickMobileSharperCover(own(132), [same("https://b.example/300.jpg", 300), same("https://c.example/600.jpg", 600)]),
    ).toBe("https://c.example/600.jpg");
  });

  test("another artwork never replaces the cover, however sharp", () => {
    // Hanako: the pilot cover (132 px) and MangaDex's volume 25 (512 px).
    expect(
      pickMobileSharperCover(own(132), [{ url: "https://b.example/vol25.jpg", width: 512, sameArt: false }]),
    ).toBeNull();
    // Not compared (pixels unreadable) counts as different.
    expect(
      pickMobileSharperCover(own(132), [{ url: "https://b.example/x.jpg", width: 512, sameArt: null }]),
    ).toBeNull();
    expect(pickMobileSharperCover(own(132), [{ url: "https://b.example/x.jpg", width: 512 }])).toBeNull();
    // A different artwork does not block a same-artwork copy.
    expect(
      pickMobileSharperCover(own(132), [
        { url: "https://b.example/vol25.jpg", width: 512, sameArt: false },
        same("https://a.example/g.jpg", 240),
      ]),
    ).toBe("https://a.example/g.jpg");
  });

  test("keeps the title's own cover unless the gain is clear and measured", () => {
    // Only a little wider.
    expect(pickMobileSharperCover(own(300), [same("https://b.example/400.jpg", 400)])).toBeNull();
    // Own cover already sharp enough for every slot.
    expect(pickMobileSharperCover(own(480), [same("https://b.example/1200.jpg", 1200)])).toBeNull();
    // Unmeasured on either side.
    expect(pickMobileSharperCover(own(null), [same("https://b.example/512.jpg", 512)])).toBeNull();
    expect(pickMobileSharperCover(own(132), [same("https://b.example/x.jpg", null)])).toBeNull();
    // The same URL is not an alternative.
    expect(pickMobileSharperCover(own(132), [same(own(0).url, 900)])).toBeNull();
  });

  test("size variants: only the patterns the sources serve", () => {
    expect(getMobileCoverSizeVariants("https://cf.hamreus.com/cpic/b/16891.jpg")).toEqual([
      "https://cf.hamreus.com/cpic/g/16891.jpg",
    ]);
    expect(getMobileCoverSizeVariants("https://cf.hamreus.com/cpic/h/28985.jpg")).toEqual([
      "https://cf.hamreus.com/cpic/g/28985.jpg",
    ]);
    // Already the largest.
    expect(getMobileCoverSizeVariants("https://cf.hamreus.com/cpic/g/16891.jpg")).toEqual([]);
    expect(
      getMobileCoverSizeVariants("https://deliver.cdn.nicomanga.jp/material/2d65e4/15535882qa?1723143012"),
    ).toEqual(["https://deliver.cdn.nicomanga.jp/material/2d65e4/15535882?1723143012"]);
    expect(getMobileCoverSizeVariants("https://deliver.cdn.nicomanga.jp/material/5bec12/5133335qa")).toEqual([
      "https://deliver.cdn.nicomanga.jp/material/5bec12/5133335",
    ]);
    expect(getMobileCoverSizeVariants("https://uploads.mangadex.org/covers/m/c.jpg.256.jpg")).toEqual([
      "https://uploads.mangadex.org/covers/m/c.jpg.512.jpg",
    ]);
    // 512 is enough; unknown hosts and look-alike paths get nothing.
    expect(getMobileCoverSizeVariants("https://uploads.mangadex.org/covers/m/c.jpg.512.jpg")).toEqual([]);
    expect(getMobileCoverSizeVariants("https://example.com/cpic/b/1.jpg")).toEqual([]);
    expect(getMobileCoverSizeVariants("https://mhfm7tel.cdndm5.com/86/85245/x_630x840_205.jpg")).toEqual([]);
    expect(getMobileCoverSizeVariants(null)).toEqual([]);
    expect(
      isMobileCoverSizeVariantOf("https://cf.hamreus.com/cpic/g/16891.jpg", "https://cf.hamreus.com/cpic/b/16891.jpg"),
    ).toBe(true);
    expect(
      isMobileCoverSizeVariantOf("https://cf.hamreus.com/cpic/g/1.jpg", "https://cf.hamreus.com/cpic/b/16891.jpg"),
    ).toBe(false);
  });

  test("same artwork: copies, crops and recompressions match; another picture does not", () => {
    const art = raster((x, y) => [(x * 21 + y * 3) % 256, (y * 14) % 256, ((x + y) * 9) % 256]);
    // A resized copy: a little noise from resampling and compression.
    const copy = raster((x, y) => {
      const [r, g, b] = [(x * 21 + y * 3) % 256, (y * 14) % 256, ((x + y) * 9) % 256];
      const n = ((x * 7 + y * 13) % 5) - 2;
      return [Math.max(0, r + n), Math.max(0, g - n), Math.max(0, b + n)];
    });
    const other = raster((x, y) => [255 - ((y * 14) % 256), (x * 21) % 256, 200 - ((x * y) % 120)]);
    expect(isMobileSameCoverArt(art, copy)).toBe(true);
    expect(isMobileSameCoverArt(art, other)).toBe(false);
    // Same layout, other colours (another volume of the same series design).
    const recoloured = raster((x, y) => [((x + y) * 9) % 256, (x * 21 + y * 3) % 256, (y * 14) % 256]);
    expect(isMobileSameCoverArt(art, recoloured)).toBe(false);
    // Flat covers: only the colour decides.
    const flat = (v: number) => raster(() => [v, v, v]);
    expect(isMobileSameCoverArt(flat(40), flat(44))).toBe(true);
    expect(isMobileSameCoverArt(flat(40), flat(200))).toBe(false);
    // Unreadable pixels are not a match.
    expect(isMobileSameCoverArt(art, null)).toBeNull();
    expect(compareMobileCoverFingerprints(art, new Uint8Array(4))).toBeNull();
  });

  test("a thumbnail is worth looking past; a full cover is not", () => {
    expect(isMobileCoverBelowSharp(132)).toBe(true);
    expect(isMobileCoverBelowSharp(512)).toBe(false);
    expect(isMobileCoverBelowSharp(null)).toBe(false);
  });

  test("the remembered picks survive a round trip, stay bounded and ignore damaged input", () => {
    const store = parseMobileCoverPreferenceStore(null);
    expect(rememberMobileCoverPreference(store, "item-1", "https://b.example/512.jpg")).toBe(true);
    expect(rememberMobileCoverPreference(store, "item-1", "https://b.example/512.jpg")).toBe(false);
    expect(rememberMobileCoverPreference(store, "item-2", "data:image/png;base64,AAAA")).toBe(false);
    const again = parseMobileCoverPreferenceStore(serializeMobileCoverPreferenceStore(store));
    expect([...again]).toEqual([["item-1", "https://b.example/512.jpg"]]);
    expect(rememberMobileCoverPreference(again, "item-1", null)).toBe(true);
    expect(again.size).toBe(0);
    for (let index = 0; index < MOBILE_COVER_PREFERENCE_STORE_LIMIT + 5; index += 1) {
      rememberMobileCoverPreference(again, `item-${index}`, `https://b.example/${index}.jpg`);
    }
    expect(again.size).toBe(MOBILE_COVER_PREFERENCE_STORE_LIMIT);
    expect(again.has("item-0")).toBe(false);
    expect(parseMobileCoverPreferenceStore("{not json").size).toBe(0);
    expect(parseMobileCoverPreferenceStore(JSON.stringify({ version: 9, covers: [] })).size).toBe(0);
  });
});
