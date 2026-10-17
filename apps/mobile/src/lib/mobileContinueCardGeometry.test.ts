import { describe, expect, test } from "bun:test";
import {
  getMobileContinueCardGeometry,
  getMobileContinueCardRestOffset,
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
      cardWidth: 340,
      interval: 352,
      paddingLeft: 20,
      paddingRight: 60,
      columns: 1,
      turns: true,
      foldAligned: false,
    });
    // Every card can rest leading-aligned, the last one included.
    expect(maxOffset(g, 3, 420)).toBe(2 * g.interval);
    expect(cardsAt(g, 3, 2)[2][0]).toBe(20);
  });

  test("phone: a lone card fills the content and does not turn", () => {
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
    // Leading edge on the gutter (content 336 pt), the next card peeking past a 12 pt gap.
    expect(g.cardWidth).toBe(296);
    expect(g.paddingLeft).toBe(8);
    expect(cardsAt(g, 4, 0)[1][0]).toBe(8 + 296 + 12);
    // Each card can rest leading-aligned, the last one included.
    expect(maxOffset(g, 4, 360)).toBeCloseTo(3 * g.interval);
    expect(cardsAt(g, 4, 3)[3][0]).toBe(8);
    // Mirrored (bar on the right): same card, the gutters swap.
    const mirrored = getMobileContinueCardGeometry({ frameWidth: 360, gutterLeft: 16, gutterRight: 8, count: 4 });
    expect(mirrored.paddingLeft).toBe(16);
    expect(mirrored.cardWidth).toBe(296);
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
    // The row ends as it starts, mirrored: the last card on the trailing
    // gutter, the gaps all equal, no empty stretch where the peek was.
    const end = maxOffset(many, 5, 951);
    const ending = cardsAt(many, 5, 0).map(([left, right]) => [left - end, right - end] as const);
    expect(ending[4][1]).toBeCloseTo(951 - 20);
    for (let card = 1; card < 5; card += 1) expect(ending[card][0] - ending[card - 1][1]).toBeCloseTo(12);
    // The card before the last two peeks on the leading side, as the third did on the trailing.
    expect(ending[2][1]).toBeGreaterThan(0);
    expect(ending[2][1]).toBeLessThan(ending[3][0]);
    // The last step is shorter than an interval; the rest offset clamps to it.
    expect(end).toBeLessThan(3 * many.interval);
    expect(getMobileContinueCardRestOffset(many, { index: 3, count: 5, frameWidth: 951 })).toBeCloseTo(end);
    expect(getMobileContinueCardRestOffset(many, { index: 1, count: 5, frameWidth: 951 })).toBe(many.interval);
  });

  test("open flat with the vertical bar: equal gaps from the first resting place to the last", () => {
    for (const [gutterLeft, gutterRight] of [[20, 16], [16, 20]]) {
      const g = getMobileContinueCardGeometry({ frameWidth: 867, gutterLeft, gutterRight, count: 6, preferEven: true });
      expect(g.columns).toBe(2);
      const end = maxOffset(g, 6, 867);
      for (const offset of [0, g.interval, end]) {
        const cards = cardsAt(g, 6, 0).map(([left, right]) => [left - offset, right - offset] as const);
        for (let card = 1; card < 6; card += 1) expect(cards[card][0] - cards[card - 1][1]).toBeCloseTo(12);
      }
      expect(cardsAt(g, 6, 0)[0][0]).toBe(gutterLeft);
      expect(cardsAt(g, 6, 0)[5][1] - end).toBeCloseTo(867 - gutterRight);
    }
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

  /**
   * The open Duo in book posture, as measured: 951 pt across, the fold
   * 455.5–495.5, the 84 pt vertical bar on one side. The row's frame ends at
   * the bar; its gutters are the page gutter (20) and the bar-side gap (16).
   */
  const BOOK = {
    barRight: { frameWidth: 867, gutterLeft: 20, gutterRight: 16, fold: { start: 455.5, end: 495.5 } },
    barLeft: { frameWidth: 867, gutterLeft: 16, gutterRight: 20, fold: { start: 371.5, end: 411.5 } },
  } as const;

  for (const [side, frame] of Object.entries(BOOK)) {
    test(`Duo book posture (${side}): each card centred in its own pane, never on the fold, one pane a step`, () => {
      const { frameWidth, gutterLeft, gutterRight, fold } = frame;
      for (const count of [1, 2, 3, 6]) {
        const g = getMobileContinueCardGeometry({ ...frame, count, preferEven: true });
        expect(g).toMatchObject({ columns: 2, turns: false, foldAligned: true });
        // One width for both panes: the narrower pane's, inside its two margins.
        const narrower = Math.min(fold.start - 2 * gutterLeft, frameWidth - fold.end - 2 * gutterRight);
        expect(g.cardWidth).toBeCloseTo(Math.min(460, narrower));
        // Every snap point is one pane further, the last with the last card in the trailing pane.
        const last = Math.max(0, count - 2);
        expect(maxOffset(g, count, frameWidth)).toBeCloseTo(last * g.interval);
        for (let index = 0; index <= last; index += 1) {
          const cards = cardsAt(g, count, index);
          for (const [left, right] of cards) {
            if (right <= 0 || left >= frameWidth) continue;
            expect(right <= fold.start + 0.01 || left >= fold.end - 0.01).toBe(true);
          }
          // Leading pane: as far from its outer edge (the gutter's own margin counted) as from the fold.
          const [a0, a1] = cards[index];
          expect(a0).toBeGreaterThanOrEqual(gutterLeft - 0.01);
          expect(a0).toBeCloseTo(fold.start - a1);
          // Trailing pane: the same balance against the frame's far edge.
          if (cards[index + 1]) {
            const [b0, b1] = cards[index + 1];
            expect(b1).toBeLessThanOrEqual(frameWidth - gutterRight + 0.01);
            expect(b0 - fold.end).toBeCloseTo(frameWidth - b1);
          }
        }
      }
    });
  }

  test("book posture: the narrower pane keeps the plain page margins, the wider one centres the same card", () => {
    const g = getMobileContinueCardGeometry({ ...BOOK.barRight, count: 4 });
    const [first, second] = cardsAt(g, 4, 0);
    // The bar's pane: 16 pt from the fold and from the frame's edge at the bar.
    expect(second[0] - 495.5).toBeCloseTo(16);
    expect(867 - second[1]).toBeCloseTo(16);
    expect(g.cardWidth).toBeCloseTo(867 - 495.5 - 32);
    // The other pane: equal margins, wider than the gutter.
    expect(first[0]).toBeCloseTo(455.5 - first[1]);
    expect(first[0]).toBeGreaterThan(20);
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

  test("a wide card to a position stays narrow and leads from the gutter (landscape, the closed Duo)", () => {
    const g = getMobileContinueCardGeometry({ frameWidth: 640, gutterLeft: 20, gutterRight: 20, count: 3 });
    expect(g).toMatchObject({ columns: 1, cardWidth: 420, turns: true, paddingLeft: 20 });
    expect(cardsAt(g, 3, 0)[0][0]).toBe(20);
    // The next card peeks on the trailing side only.
    expect(cardsAt(g, 3, 0)[1][0]).toBe(20 + 420 + 12);
    expect(cardsAt(g, 3, 1)[1][0]).toBe(20);
    expect(maxOffset(g, 3, 640)).toBe(2 * g.interval);
  });

  test("a lone wide card leads from the gutter and does not turn", () => {
    const g = getMobileContinueCardGeometry({ frameWidth: 640, gutterLeft: 20, gutterRight: 20, count: 1 });
    expect(g).toMatchObject({ columns: 1, cardWidth: 420, turns: false, paddingLeft: 20 });
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
