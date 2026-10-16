import { describe, expect, test } from "bun:test";
import {
  getMobileReaderZoomCoverFrame,
  peekMobileReaderZoomCover,
  primeMobileReaderZoomCover,
} from "./mobileReaderZoomHandoff";

describe("mobileReaderZoomHandoff", () => {
  test("the cover goes to the zoom it was primed for, more than once, and expires", () => {
    const cover = { uri: "https://example.test/c.jpg", headers: { Referer: "https://example.test/" } };
    primeMobileReaderZoomCover("continue:a", cover, 1000);
    expect(peekMobileReaderZoomCover("continue:b", 1010)).toBeNull();
    expect(peekMobileReaderZoomCover("continue:a", 1010)).toEqual(cover);
    expect(peekMobileReaderZoomCover("continue:a", 1020)).toEqual(cover);
    expect(peekMobileReaderZoomCover(null, 1020)).toBeNull();
    expect(peekMobileReaderZoomCover("continue:a", 1000 + 3000 + 1)).toBeNull();
  });

  test("a push without a cover clears an earlier one", () => {
    primeMobileReaderZoomCover("detail:a", { uri: "https://example.test/c.jpg" }, 1000);
    primeMobileReaderZoomCover("detail:a", null, 1005);
    expect(peekMobileReaderZoomCover("detail:a", 1010)).toBeNull();
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
});
