import { describe, expect, test } from "bun:test";
import {
  fitMobileRestingContent,
  getMobileExploreRestingEdge,
  getMobileExploreUnderPush,
  MOBILE_RESTING,
  type MobileRestingBlock,
} from "./mobileExploreRestingFit";

/** Where every block sits after a fit (window coordinates). */
function place(top: number, blocks: readonly MobileRestingBlock[], fit: ReturnType<typeof fitMobileRestingContent>) {
  let y = top;
  return blocks.map((block) => {
    const blockTop = y + fit.gaps[block.key]!;
    y = blockTop + fit.heights[block.key]!;
    return { key: block.key, top: blockTop, bottom: y };
  });
}

/** Nothing that rests whole is cut by the edge; a peek shows at least its minimum. */
function expectClear(top: number, edge: number, blocks: readonly MobileRestingBlock[]) {
  const fit = fitMobileRestingContent({ top, edge, blocks });
  expect(fit.clear).toBe(true);
  for (const [index, spot] of place(top, blocks, fit).entries()) {
    const block = blocks[index]!;
    const cut = spot.top < edge - MOBILE_RESTING.tolerance && spot.bottom > edge - MOBILE_RESTING.margin;
    if (!cut) continue;
    expect(block.rests).toBe("peek");
    expect(edge - MOBILE_RESTING.margin - spot.top).toBeGreaterThanOrEqual((block.minVisible ?? 0) - 0.01);
    if (block.maxVisible !== undefined) {
      expect(edge - MOBILE_RESTING.margin - spot.top).toBeLessThanOrEqual(block.maxVisible + 0.01);
    }
  }
  return fit;
}

describe("resting content clears the tab bar", () => {
  test("leaves a page alone when the edge already falls between blocks", () => {
    const blocks: MobileRestingBlock[] = [
      { key: "a", gap: 0, height: 300, rests: "whole" },
      { key: "b", gap: 20, height: 300, rests: "whole" },
    ];
    const fit = expectClear(100, 900, blocks);
    expect(fit.mode).toBe("natural");
    expect(fit.under).toBeNull();
  });

  test("detail hero: the synopsis ends on a whole line above the tab bar and the tags rest under it", () => {
    // Air: hero at 135, tab bar top at 773; tags would be cut 5 pt above it.
    const blocks: MobileRestingBlock[] = [
      { key: "head", gap: 8, height: 406, rests: "whole" },
      { key: "facts", gap: 16, height: 34, rests: "whole" },
      { key: "actions", gap: 16, height: 50, rests: "whole" },
      { key: "synopsis", gap: 16, height: 88, rests: "whole", shrink: { by: 44, step: 22, order: 0 } },
      { key: "tags", gap: 16, height: 34, rests: "whole" },
    ];
    const fit = expectClear(135, 773, blocks);
    // One line less lets the synopsis end above the edge; the tags drop under it.
    expect(fit.heights.synopsis).toBe(66);
    expect(fit.under).toBe("tags");
    expect(fit.gaps.tags).toBeLessThanOrEqual(16 + MOBILE_RESTING.maxPush);
  });

  test("detail hero on a short phone: the synopsis gives whole lines until the actions clear", () => {
    const blocks: MobileRestingBlock[] = [
      { key: "head", gap: 8, height: 380, rests: "whole", shrink: { by: 60, order: 1 } },
      { key: "facts", gap: 16, height: 34, rests: "whole" },
      { key: "actions", gap: 16, height: 50, rests: "whole" },
      { key: "synopsis", gap: 16, height: 88, rests: "whole", shrink: { by: 44, step: 22, order: 0 } },
      { key: "tags", gap: 16, height: 34, rests: "whole" },
    ];
    const fit = expectClear(120, 640, blocks);
    // Lines are taken whole: the synopsis is 4, 3 or 2 lines tall, never a fraction.
    expect([44, 66, 88]).toContain(fit.heights.synopsis!);
  });

  test("library: the card's cover window gives room so Collections peeks with its heading and folder tops", () => {
    const blocks: MobileRestingBlock[] = [
      { key: "cards", gap: 0, height: 560, rests: "whole", shrink: { by: 100, order: 0 }, grow: { by: 76, order: 0 } },
      { key: "collections", gap: 28, height: 220, rests: "peek", minVisible: 124 },
    ];
    const fit = expectClear(135, 773, blocks);
    expect(fit.mode).toBe("shrunk");
    expect(fit.heights.cards).toBe(560 - 84);
  });

  test("a peek that would need more than the shrink allows lands under the edge instead", () => {
    const blocks: MobileRestingBlock[] = [
      { key: "cards", gap: 0, height: 560, rests: "whole", shrink: { by: 20, order: 0 }, grow: { by: 120, order: 0 } },
      { key: "collections", gap: 28, height: 220, rests: "peek", minVisible: 124 },
    ];
    const fit = expectClear(135, 773, blocks);
    expect(fit.mode).toBe("grown");
    expect(fit.under).toBe("collections");
  });

  test("folders: never resting with the art whole and the names under the tab bar", () => {
    // Air (pass 13): the folders' art ended just above the bar, their names under it.
    const blocks: MobileRestingBlock[] = [
      { key: "cards", gap: 0, height: 448, rests: "whole", shrink: { by: 66, order: 0 }, grow: { by: 58, order: 0 } },
      { key: "collections", gap: 28, height: 2000, rests: "peek", minVisible: 92, maxVisible: 115 },
    ];
    const fit = expectClear(135, 773, blocks);
    // The cards take a little room, so the edge cuts through the folders' art.
    expect(fit.mode).toBe("grown");
    expect(fit.heights.cards).toBeGreaterThan(448);
  });

  test("landscape phone: a wide card the tab bar covers gives up height until it rests whole above it", () => {
    const blocks: MobileRestingBlock[] = [
      { key: "cards", gap: 0, height: 240, rests: "whole", shrink: { by: 80, order: 0 } },
      { key: "next", gap: 28, height: 160, rests: "peek", minVisible: 60 },
    ];
    const fit = expectClear(70, 281, blocks);
    expect(fit.heights.cards).toBeLessThan(240);
  });

  test("growing never shoves an earlier block onto the edge", () => {
    const blocks: MobileRestingBlock[] = [
      { key: "a", gap: 0, height: 100, rests: "whole", grow: { by: 400, order: 0 } },
      { key: "b", gap: 10, height: 100, rests: "whole" },
      { key: "c", gap: 10, height: 100, rests: "whole" },
    ];
    // c is cut; growing a would put b on the edge first, so the fit must not report grown-and-clear wrongly.
    const fit = fitMobileRestingContent({ top: 0, edge: 300, blocks });
    if (fit.clear) expectClear(0, 300, blocks);
  });

  test("a window too short to fix keeps the natural sizes and says so", () => {
    const blocks: MobileRestingBlock[] = [{ key: "a", gap: 0, height: 500, rests: "whole" }];
    const fit = fitMobileRestingContent({ top: 100, edge: 400, blocks });
    expect(fit.clear).toBe(false);
    expect(fit.heights.a).toBe(500);
  });

  test("every phone height rests clear", () => {
    for (const windowHeight of [667, 736, 812, 844, 874, 912, 932, 956]) {
      for (const bottom of [83, 139]) {
        const edge = windowHeight - bottom;
        const blocks: MobileRestingBlock[] = [
          { key: "head", gap: 8, height: 400, rests: "whole", shrink: { by: 90, order: 1 } },
          { key: "facts", gap: 16, height: 34, rests: "whole" },
          { key: "actions", gap: 16, height: 50, rests: "whole" },
          { key: "synopsis", gap: 16, height: 88, rests: "whole", shrink: { by: 44, step: 22, order: 0 } },
          { key: "tags", gap: 16, height: 34, rests: "whole" },
        ];
        expectClear(120, edge, blocks);
      }
    }
  });
});

describe("resting edge", () => {
  test("the inset in a regular-height window; the compact tab bar's top in a short one", () => {
    // Portrait Air: the tab bar is in the 139 pt inset.
    expect(getMobileExploreRestingEdge(912, 139, false)).toBe(773);
    // Landscape Air: the inset is the home indicator; the bar's band is cleared.
    expect(getMobileExploreRestingEdge(420, 21, true)).toBe(356);
    // A larger inset still wins.
    expect(getMobileExploreRestingEdge(420, 90, true)).toBe(330);
  });

  test("a section dropped under the edge of a wide window starts under its bottom", () => {
    // Air in landscape: edge 356 (compact tab bar), window 420 × 912.
    expect(getMobileExploreUnderPush({ top: 380, edge: 356, windowWidth: 912, windowHeight: 420 })).toBe(40);
    // Still peeking: not this rule's business.
    expect(getMobileExploreUnderPush({ top: 300, edge: 356, windowWidth: 912, windowHeight: 420 })).toBe(0);
    // A portrait phone: the bars span the window.
    expect(getMobileExploreUnderPush({ top: 800, edge: 772, windowWidth: 420, windowHeight: 912 })).toBe(0);
    // Already below the window.
    expect(getMobileExploreUnderPush({ top: 430, edge: 356, windowWidth: 912, windowHeight: 420 })).toBe(0);
  });
});
