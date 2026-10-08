import { describe, expect, test } from "bun:test";
import {
  getMobileContinueCardGeometry,
  getMobileContinueCardVariant,
} from "./mobileContinueCardGeometry";

/** Resting frames [left, right] of every card with the row scrolled to `index`. */
function cardsAt(
  g: ReturnType<typeof getMobileContinueCardGeometry>,
  count: number,
  index: number,
) {
  return Array.from({ length: count }, (_, card) => {
    const left = g.paddingLeft + card * g.interval - index * g.interval;
    return [left, left + g.cardWidth] as const;
  });
}

/** Furthest scroll offset of the row. */
function maxOffset(g: ReturnType<typeof getMobileContinueCardGeometry>, count: number, frameWidth: number) {
  const content = g.paddingLeft + (count - 1) * g.interval + g.cardWidth + g.paddingRight;
  return Math.max(0, content - frameWidth);
}

describe("getMobileContinueCardGeometry", () => {
  test("phone: the card starts on the gutter, the next one peeks, with the turn", () => {
    const g = getMobileContinueCardGeometry({ frameWidth: 420, gutterLeft: 20, count: 3 });
    expect(g).toEqual({
      cardWidth: 316,
      interval: 328,
      paddingLeft: 52,
      paddingRight: 52,
      columns: 1,
      turns: true,
      foldAligned: false,
    });
    // Every card can rest centred, the first and last included.
    expect(maxOffset(g, 3, 420)).toBe(2 * g.interval);
    expect(g.paddingLeft).toBe(g.paddingRight);
  });

  test("phone: a lone card is centred and does not turn", () => {
    expect(getMobileContinueCardGeometry({ frameWidth: 420, gutterLeft: 20, count: 1 })).toMatchObject({
      cardWidth: 380,
      paddingLeft: 20,
      paddingRight: 20,
      columns: 1,
      turns: false,
    });
  });

  test("an unmeasured frame lays nothing out", () => {
    expect(getMobileContinueCardGeometry({ frameWidth: 0, gutterLeft: 20 }).cardWidth).toBe(0);
  });

  test("Duo outer display: the vertical bar's side keeps its own, narrower gutter", () => {
    // Closed, bar on the left: the row starts at the safe edge (frame 0…360)
    // with an 8 pt lead-in, and bleeds to the screen edge on the right.
    const g = getMobileContinueCardGeometry({ frameWidth: 360, gutterLeft: 8, gutterRight: 16, count: 4 });
    expect(g.columns).toBe(1);
    expect(g.turns).toBe(true);
    // Centred between the gutters (content 336 pt): the card floor, the rest split evenly.
    expect(g.cardWidth).toBe(280);
    expect(g.paddingLeft).toBe(8 + (336 - 280) / 2);
    expect(g.paddingRight).toBe(360 - g.paddingLeft - 280);
    // Each card can rest centred, the last one included.
    expect(maxOffset(g, 4, 360)).toBeCloseTo(3 * g.interval);
    // Mirrored (bar on the right): same card, the gutters swap.
    const mirrored = getMobileContinueCardGeometry({ frameWidth: 360, gutterLeft: 16, gutterRight: 8, count: 4 });
    expect(mirrored.paddingLeft).toBe(16 + (336 - 280) / 2);
    expect(mirrored.cardWidth).toBe(280);
    expect(maxOffset(mirrored, 4, 360)).toBeCloseTo(3 * mirrored.interval);
  });

  test("Duo inner display, open flat: two whole cards, gutter to gutter", () => {
    const two = getMobileContinueCardGeometry({ frameWidth: 951, gutterLeft: 20, count: 2, preferEven: true });
    expect(two).toMatchObject({ columns: 2, turns: false, foldAligned: false, paddingRight: 20 });
    expect(two.cardWidth).toBe((951 - 40 - 12) / 2);
    const [first, second] = cardsAt(two, 2, 0);
    expect(first[0]).toBe(20);
    expect(second[1]).toBeCloseTo(951 - 20);

    // More cards than fit: two whole cards and a peek of the third.
    const many = getMobileContinueCardGeometry({ frameWidth: 951, gutterLeft: 20, count: 5, preferEven: true });
    expect(many.columns).toBe(2);
    const resting = cardsAt(many, 5, 0);
    expect(resting[1][1]).toBeLessThanOrEqual(951);
    expect(951 - resting[2][0]).toBeCloseTo(28);
    // The last two cards rest with the fourth on the gutter.
    expect(maxOffset(many, 5, 951)).toBeCloseTo(3 * many.interval);
  });

  test("Duo inner display, portrait: two cards, never narrower than the minimum", () => {
    const g = getMobileContinueCardGeometry({ frameWidth: 669, gutterLeft: 20, count: 2, preferEven: true });
    expect(g.columns).toBe(2);
    expect(g.cardWidth).toBe((669 - 40 - 12) / 2);
    expect(g.cardWidth).toBeGreaterThanOrEqual(300);
  });

  test("an odd fit becomes even only when the window has a fold region", () => {
    const tablet = getMobileContinueCardGeometry({ frameWidth: 1194, gutterLeft: 20, count: 3 });
    expect(tablet.columns).toBe(3);
    const foldable = getMobileContinueCardGeometry({ frameWidth: 1194, gutterLeft: 20, count: 3, preferEven: true });
    expect(foldable.columns).toBe(2);
    expect(foldable.cardWidth).toBe(460);
  });

  test("Duo book posture: one card per pane, nothing on the fold, at every resting position", () => {
    // Measured inner display in book posture: panes 0–455.5 and 495.5–951.
    const fold = { start: 455.5, end: 495.5 };
    for (const count of [1, 2, 3, 6]) {
      const g = getMobileContinueCardGeometry({ frameWidth: 951, gutterLeft: 20, count, fold, preferEven: true });
      expect(g).toMatchObject({ columns: 2, turns: false, foldAligned: true, cardWidth: 435.5 });
      const last = Math.round(maxOffset(g, count, 951) / g.interval);
      expect(last).toBe(Math.max(0, count - 2));
      for (let index = 0; index <= last; index += 1) {
        for (const [left, right] of cardsAt(g, count, index)) {
          // Off screen, or wholly inside one pane.
          const visible = right > 0 && left < 951;
          if (!visible) continue;
          expect(right <= fold.start + 0.01 || left >= fold.end - 0.01).toBe(true);
        }
        // The leading card rests on the page gutter, the next where the fold ends.
        const cards = cardsAt(g, count, index);
        expect(cards[index][0]).toBeCloseTo(20);
        if (cards[index + 1]) expect(cards[index + 1][0]).toBeCloseTo(fold.end);
      }
    }
  });

  test("book posture with the vertical bar on one side: both cards take the narrower pane's width", () => {
    // Row frame 0…867 after an 84 pt bar on the left; the fold in row coordinates.
    const fold = { start: 371.5, end: 411.5 };
    const g = getMobileContinueCardGeometry({ frameWidth: 867, gutterLeft: 8, gutterRight: 20, count: 3, fold });
    expect(g.foldAligned).toBe(true);
    expect(g.cardWidth).toBe(371.5 - 8);
    const [first, second] = cardsAt(g, 3, 0);
    expect(first[1]).toBeLessThanOrEqual(fold.start);
    expect(second[0]).toBe(fold.end);
    expect(second[1]).toBeLessThanOrEqual(867 - 20);
  });

  test("a fold that leaves a pane too narrow for a card falls back to the flat rules", () => {
    const g = getMobileContinueCardGeometry({ frameWidth: 420, gutterLeft: 20, count: 3, fold: { start: 190, end: 230 } });
    expect(g.foldAligned).toBe(false);
    expect(g.turns).toBe(true);
  });

  test("tall card on a phone: centred, a neighbour peeking on each side, every card can rest centred", () => {
    const g = getMobileContinueCardGeometry({ frameWidth: 420, gutterLeft: 20, count: 3, variant: "tall" });
    expect(g).toMatchObject({ cardWidth: 316, interval: 328, columns: 1, turns: true });
    const [previous, current, next] = cardsAt(g, 3, 1);
    expect(current[0]).toBeCloseTo(420 - current[1]);
    expect(previous[1]).toBeGreaterThan(20);
    expect(next[0]).toBeLessThan(400);
    expect(maxOffset(g, 3, 420)).toBeCloseTo(2 * g.interval);
  });

  test("tall card: a lone card sits centred and does not turn", () => {
    const g = getMobileContinueCardGeometry({ frameWidth: 420, gutterLeft: 20, count: 1, variant: "tall" });
    expect(g.turns).toBe(false);
    expect(g.paddingLeft).toBeCloseTo((420 - g.cardWidth) / 2);
  });

  test("tall cards on a wide window: several whole cards, each within the tall card's widths", () => {
    const g = getMobileContinueCardGeometry({ frameWidth: 1180, gutterLeft: 24, count: 6, variant: "tall" });
    expect(g.columns).toBe(4);
    expect(g.cardWidth).toBeGreaterThanOrEqual(220);
    expect(g.cardWidth).toBeLessThanOrEqual(316);
    expect(g.turns).toBe(false);
  });

  test("a tall card needs a tall window", () => {
    expect(getMobileContinueCardVariant("tall", 912)).toBe("tall");
    // iPhone landscape, the Duo's outer display, the open Duo in landscape.
    for (const height of [420, 678, 669]) expect(getMobileContinueCardVariant("tall", height)).toBe("wide");
    expect(getMobileContinueCardVariant("wide", 912)).toBe("wide");
    // A narrow window (the closed Duo's outer display in portrait) takes it from a lower height, a wide one does not.
    expect(getMobileContinueCardVariant("tall", 678, 466)).toBe("tall");
    expect(getMobileContinueCardVariant("tall", 466, 678)).toBe("wide");
    expect(getMobileContinueCardVariant("tall", 669, 951)).toBe("wide");
  });
});
