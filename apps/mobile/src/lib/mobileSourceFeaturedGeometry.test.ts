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

  test.each([
    ["outer display, bar on the right", 466, 678, 20, 84],
    ["outer display, bar on the left", 466, 678, 84, 20],
    ["inner rail", 1003, 669, 20, 84],
  ])("%s: the card keeps its size, the row reaches the window's edge and the last card its snap", (_, width, height, left, right) => {
    const windowSize = { windowWidth: width, windowHeight: height, gutterLeft: left, gutterRight: right };
    const barInset = Math.max(left, right);
    const beside = getMobileSourceFeaturedGeometry({ ...windowSize, frameWidth: width - barInset });
    const under = getMobileSourceFeaturedGeometry({ ...windowSize, frameWidth: width, barInset });
    expect(under.cardWidth).toBe(beside.cardWidth);
    expect(under.interval).toBe(beside.interval);
    expect(under.paddingLeft).toBe(left);
    const contentWidth = under.paddingLeft + 3 * under.cardWidth + 2 * (under.interval - under.cardWidth) + under.paddingRight;
    expect(contentWidth - width).toBeCloseTo(2 * under.interval);
  });
});
