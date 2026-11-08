import { describe, expect, test } from "bun:test";
import {
  canonicalMobileReaderZoomId,
  getMobileReaderZoomCoverFrame,
  peekMobileReaderZoomCover,
  peekMobileReaderZoomTapAt,
  mobileReaderZoomIdForDetail,
  noteMobileReaderZoomSourceCover,
  primeMobileReaderZoomCover,
  recallMobileReaderZoomSourceCover,
  resolveMobileReaderZoomHandoffCover,
} from "./mobileReaderZoomHandoff";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("mobileReaderZoomHandoff", () => {
  test("the cover goes to the zoom it was primed for, more than once, and expires", () => {
    const cover = { uri: "https://example.test/c.jpg", headers: { Referer: "https://example.test/" } };
    primeMobileReaderZoomCover("continue:a", cover, 1000);
    expect(peekMobileReaderZoomCover("continue:b", 1010)).toBeNull();
    expect(peekMobileReaderZoomCover("continue:a", 1010)).toEqual(cover);
    expect(peekMobileReaderZoomCover("continue:a", 1020)).toEqual(cover);
    expect(peekMobileReaderZoomCover(null, 1020)).toBeNull();
    // Past the handoff: the cover that zoom source last painted.
    expect(peekMobileReaderZoomCover("continue:a", 1000 + 3000 + 1)).toEqual(cover);
    expect(peekMobileReaderZoomCover("continue:never", 1010)).toBeNull();
  });

  test("a push without a cover of its own lands on the one its source last painted", () => {
    const painted = { uri: "https://example.test/painted.jpg" };
    primeMobileReaderZoomCover("detail:a", painted, 1000);
    expect(primeMobileReaderZoomCover("detail:a", null, 1005)).toEqual(painted);
    expect(peekMobileReaderZoomCover("detail:a", 1010)).toEqual(painted);
    // Nothing known: none (the route lands on a plate).
    expect(primeMobileReaderZoomCover("detail:unknown", null, 1020)).toBeNull();
    expect(peekMobileReaderZoomCover("detail:unknown", 1021)).toBeNull();
  });

  test("the Library tile's cover stands in for the title page's hero (SPY: Library tile → title page → Continue)", () => {
    const tile = { uri: "https://example.test/tile.jpg", headers: { Referer: "https://example.test/" } };
    const zoomId = mobileReaderZoomIdForDetail("lib-spy");
    expect(zoomId).toBe("detail:lib-spy");
    noteMobileReaderZoomSourceCover(zoomId, tile);
    expect(recallMobileReaderZoomSourceCover(zoomId)).toEqual(tile);
    // The hero's own request still unresolved at the tap.
    expect(primeMobileReaderZoomCover(zoomId, null, 5000)).toEqual(tile);
    expect(peekMobileReaderZoomTapAt(zoomId, 5300)).toBe(5000);
    noteMobileReaderZoomSourceCover(zoomId, null);
    expect(recallMobileReaderZoomSourceCover(zoomId)).toEqual(tile);
  });

  test("an id with a `/` is one zoom whether it is spelled encoded or decoded (r16 SPY Library tile)", () => {
    const encoded = "detail:source:aidoku-community:ja.shonenjumpplus:%2Fepisode%2F10834108156648240735";
    const decoded = "detail:source:aidoku-community:ja.shonenjumpplus:/episode/10834108156648240735";
    expect(canonicalMobileReaderZoomId(encoded)).toBe(decoded);
    expect(canonicalMobileReaderZoomId(decoded)).toBe(decoded);
    // Twice encoded (the href encodes the id again) and a stray `%` survive.
    expect(canonicalMobileReaderZoomId(encodeURIComponent(encoded))).toBe(decoded);
    expect(canonicalMobileReaderZoomId("detail:100%")).toBe("detail:100%");
    expect(canonicalMobileReaderZoomId(null)).toBeNull();
    // The title page (encoded item id) primes; the route (decoded param) reads.
    const cover = { uri: "https://example.test/spy.jpg" };
    const zoomId = mobileReaderZoomIdForDetail("source:aidoku-community:ja.shonenjumpplus:%2Fepisode%2F108");
    expect(zoomId).toBe("detail:source:aidoku-community:ja.shonenjumpplus:/episode/108");
    primeMobileReaderZoomCover("detail:source:aidoku-community:ja.shonenjumpplus:%2Fepisode%2F108", cover, 5000);
    expect(peekMobileReaderZoomCover(zoomId, 5100)).toEqual(cover);
    expect(peekMobileReaderZoomTapAt(zoomId, 5100)).toBe(5000);
    // The tile noted the decoded spelling; the encoded one recalls it.
    const tile = { uri: "https://example.test/tile.jpg" };
    noteMobileReaderZoomSourceCover("detail:x:%2Fa%2Fb", tile);
    expect(recallMobileReaderZoomSourceCover("detail:x:/a/b")).toEqual(tile);
    expect(peekMobileReaderZoomCover("detail:x:/a/b", 99_999)).toEqual(tile);
  });

  test("the route and the zoom href use the one spelling", () => {
    const route = readFileSync(
      path.join(import.meta.dir, "../../app/sources/[registryId]/[sourceId]/[mangaId]/[chapterId].tsx"),
      "utf8",
    );
    expect(route).toContain("const zoom = canonicalMobileReaderZoomId(zoomParam ?? null);");
    const explore = readFileSync(path.join(import.meta.dir, "../components/explore/mobileExploreCover.ts"), "utf8");
    expect(explore).toContain("zoomId = canonicalMobileReaderZoomId(zoomId);");
  });

  test("taps are kept per zoom: a later prime for another zoom does not take an earlier one's", () => {
    primeMobileReaderZoomCover("detail:x", null, 7000);
    primeMobileReaderZoomCover("continue:y", null, 7100);
    expect(peekMobileReaderZoomTapAt("detail:x", 7200)).toBe(7000);
    expect(peekMobileReaderZoomTapAt("continue:y", 7200)).toBe(7100);
  });

  test("the tap that started a zoom is kept for it, with or without a cover, and expires", () => {
    primeMobileReaderZoomCover("detail:t", null, 2000);
    expect(peekMobileReaderZoomTapAt("detail:t", 2400)).toBe(2000);
    expect(peekMobileReaderZoomTapAt("detail:u", 2400)).toBeNull();
    expect(peekMobileReaderZoomTapAt(null, 2400)).toBeNull();
    expect(peekMobileReaderZoomTapAt("detail:t", 2000 + 3000 + 1)).toBeNull();
    primeMobileReaderZoomCover("continue:t", { uri: "https://example.test/c.jpg" }, 2100);
    expect(peekMobileReaderZoomTapAt("continue:t", 2200)).toBe(2100);
    expect(peekMobileReaderZoomTapAt("detail:t", 2200)).toBe(2000);
  });

  test("the landing cover is a 2:3 cover fitted and centred in the reading area", () => {
    // Duo outer display, portrait: the rail on the right.
    expect(
      getMobileReaderZoomCoverFrame({ width: 466, height: 678, insets: { top: 0, right: 84, bottom: 20, left: 0 } }),
    ).toEqual({ x: 0, y: 43, width: 382, height: 573 });
    // Landscape: height-bound.
    expect(
      getMobileReaderZoomCoverFrame({ width: 951, height: 669, insets: { top: 0, right: 0, bottom: 0, left: 0 } }),
    ).toEqual({ x: 253, y: 0, width: 446, height: 669 });
  });

  test("the reader zoom starts from the cover the hero paints, its held cover included", () => {
    const own = { uri: "https://example.test/own.jpg", headers: { Referer: "https://example.test/" } };
    const held = { uri: "https://example.test/held.jpg" };
    expect(resolveMobileReaderZoomHandoffCover(own, held)).toBe(own);
    // The page's own cover request unresolved or failed: the hero shows the
    // cover the tapped cell handed over, and so does the zoom.
    expect(resolveMobileReaderZoomHandoffCover(null, held)).toBe(held);
    expect(resolveMobileReaderZoomHandoffCover({ uri: "" }, held)).toBe(held);
    expect(resolveMobileReaderZoomHandoffCover(undefined, null)).toBeNull();
  });

  test("the title page primes the reader zoom with what its hero paints", () => {
    const detail = readFileSync(
      path.resolve(import.meta.dir, "../screens/MangaDetailScreen.tsx"),
      "utf8",
    );
    expect(detail).toContain(
      "resolveMobileReaderZoomHandoffCover(coverImage.source, zoomSeed?.cover),",
    );
    // The hero's own fallback, which the zoom has to match.
    expect(detail).toContain("heldCoverSource={zoomSeed?.cover ?? null}");

    // …and remembers it for the zoom, as the Library tile does for the hero.
    expect(detail).toContain("noteMobileReaderZoomSourceCover(readerZoomSourceId, readerZoomHeroCover);");
    const explore = readFileSync(
      path.resolve(import.meta.dir, "../components/explore/mobileExploreCover.ts"),
      "utf8",
    );
    expect(explore).toContain(
      "noteMobileReaderZoomSourceCover(mobileReaderZoomIdForDetail(entry.item.libraryItemId), cover);",
    );
  });
});
