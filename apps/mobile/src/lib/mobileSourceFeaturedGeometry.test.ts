import { describe, expect, test } from "bun:test";
import { getMobileSourceFeaturedGeometry } from "./mobileSourceFeaturedGeometry";

describe("source featured carousel alignment", () => {
  test.each([
    [420, 912, true],
    [390, 660, true],
    [466, 430, false],
    [874, 420, false],
    [600, 900, false],
    [669, 920, false],
    [1180, 820, false],
    [820, 1180, false],
  ])("%i × %i keeps its alignment through the final snap", (width, height, centred) => {
    const left = 20;
    const right = 28;
    const g = getMobileSourceFeaturedGeometry({ frameWidth: width, windowWidth: width, windowHeight: height, gutterLeft: left, gutterRight: right });
    expect(g.centred).toBe(centred);
    if (centred) expect(g.paddingLeft + g.cardWidth / 2).toBe(left + (width - left - right) / 2);
    else expect(g.paddingLeft).toBe(left);
    for (const count of [1, 2, 5]) {
      const contentWidth = g.paddingLeft + count * g.cardWidth + (count - 1) * (g.interval - g.cardWidth) + g.paddingRight;
      expect(contentWidth - width).toBeCloseTo((count - 1) * g.interval);
    }
  });
});
