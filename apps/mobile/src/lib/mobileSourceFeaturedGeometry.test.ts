import { describe, expect, test } from "bun:test";
import { getMobileSourceFeaturedCover, getMobileSourceFeaturedGeometry } from "./mobileSourceFeaturedGeometry";

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

describe("source featured cards on the Duo inner display", () => {
  // The rail's frame on the inner landscape display: the page box (867pt,
  // left of the 84pt bar column) with 16pt gutters; the 40pt fold band at
  // 455.5…495.5 in the frame's coordinates (book and fully open alike).
  const base = { frameWidth: 867, gutterLeft: 16, gutterRight: 16, windowWidth: 951, windowHeight: 669, foldRegion: true };
  const fold = { start: 455.5, end: 495.5 };
  const panes = [
    { start: 16, end: 455.5 },
    { start: 495.5, end: 851 },
  ];
  const centreOf = (pane: { start: number; end: number }) => (pane.start + pane.end) / 2;

  test("one card a pane, each centred in its pane, never on the fold, at most 380pt", () => {
    const g = getMobileSourceFeaturedGeometry({ ...base, fold, count: 6 });
    expect(g.foldAligned).toBe(true);
    expect(g.compact).toBe(true);
    expect(g.cardWidth).toBeLessThanOrEqual(380);
    expect(g.cardWidth).toBe(355);
    for (let offsetIndex = 0; offsetIndex < 5; offsetIndex += 1) {
      // At every rest (one pane a step) card k is in the leading pane, k+1 in the trailing one.
      const scroll = offsetIndex * g.interval;
      const left = g.paddingLeft + offsetIndex * g.interval - scroll;
      const right = g.paddingLeft + (offsetIndex + 1) * g.interval - scroll;
      expect(Math.abs(left + g.cardWidth / 2 - centreOf(panes[0]))).toBeLessThanOrEqual(1);
      expect(Math.abs(right + g.cardWidth / 2 - centreOf(panes[1]))).toBeLessThanOrEqual(1);
      expect(left + g.cardWidth).toBeLessThanOrEqual(fold.start);
      expect(right).toBeGreaterThanOrEqual(fold.end);
    }
    expect(g.gap).toBeCloseTo(g.interval - g.cardWidth);
  });

  test("the rail's last rest shows the last two cards, one a pane", () => {
    const count = 5;
    const g = getMobileSourceFeaturedGeometry({ ...base, fold, count });
    const contentWidth = g.paddingLeft + count * g.cardWidth + (count - 1) * g.gap + g.paddingRight;
    expect(contentWidth - base.frameWidth).toBeCloseTo((count - 2) * g.interval);
  });

  test("wide panes cap the card at 380pt", () => {
    const g = getMobileSourceFeaturedGeometry({ ...base, frameWidth: 1100, fold: { start: 530, end: 570 }, count: 3 });
    expect(g.cardWidth).toBe(380);
  });

  test("cover 112×168 on the pane card, 150×225 on the wide card", () => {
    expect(getMobileSourceFeaturedCover(355, true)).toEqual({ coverWidth: 112, coverHeight: 168 });
    expect(getMobileSourceFeaturedCover(420, false)).toEqual({ coverWidth: 150, coverHeight: 225 });
  });

  test("inner portrait (no vertical fold): one 380pt card centred, the next peeking", () => {
    const g = getMobileSourceFeaturedGeometry({ frameWidth: 669, gutterLeft: 20, gutterRight: 20, windowWidth: 669, windowHeight: 951, foldRegion: true });
    expect(g.cardWidth).toBe(380);
    expect(g.paddingLeft + g.cardWidth / 2).toBe(669 / 2);
    expect(g.compact).toBe(true);
    expect(g.paddingLeft + g.interval).toBeLessThan(669);
  });

  test("phones and the outer display (no fold region) are unchanged", () => {
    const g = getMobileSourceFeaturedGeometry({ frameWidth: 466, gutterLeft: 16, gutterRight: 16, windowWidth: 466, windowHeight: 678 });
    expect(g.compact).toBe(false);
    expect(g.foldAligned).toBe(false);
  });
});
