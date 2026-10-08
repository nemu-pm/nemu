/**
 * "Resting content clears the tab bar" (design-explore): how a page's first
 * screenful is sized so the top edge of what floats over its bottom (the tab
 * bar) never cuts through something that
 * has to be read whole: a row of facts, the action buttons, a card, a section
 * heading with nothing under it.
 *
 * A page describes its first blocks top to bottom. Each block either rests
 * `whole` (the edge may not cross it) or may `peek` (the edge may cross it once
 * `minVisible` of it shows, so it reads as "more below" rather than as a
 * sliver). Blocks can offer room: `shrink` (a shorter cover window, fewer
 * synopsis lines) and `grow` (a taller cover window). The fit tries, in this
 * order of preference by least change:
 *
 * - nothing, when the edge already falls between blocks or in a legal peek;
 * - shrinking what is above the cut block until it clears the edge (or peeks
 *   far enough);
 * - growing what is above it, then widening the gap before it (at most
 *   `maxPush`), until it starts under the edge instead.
 *
 * When neither works (a very short window), the natural sizes stand and
 * `clear` is false. Pure maths; every surface that sits above the tab bar
 * (the detail hero, the library's cards) feeds it its own blocks.
 */

export const MOBILE_RESTING = {
  /** Air kept between the last whole block and the edge. */
  margin: 10,
  /** A block starting this close above the edge counts as under it. */
  tolerance: 2,
  /** The widest a gap may open to drop a block under the edge. */
  maxPush: 40,
} as const;

export type MobileRestingBlock = {
  key: string;
  /** Space above the block. */
  gap: number;
  height: number;
  rests: "whole" | "peek";
  /** `peek`: this much must show above the edge when any of it does. */
  minVisible?: number;
  /**
   * `peek`: no more than this may show while the rest is under the edge, so
   * a block whose lower part names it (a folder's title under its art) is
   * either cut through clearly or not at all, never "whole but nameless".
   */
  maxVisible?: number;
  /** Room the block can give up, in `step`s when it is quantised (text lines); lower `order` gives first. */
  shrink?: { by: number; step?: number; order: number };
  /** Room the block can take; lower `order` takes first. */
  grow?: { by: number; order: number };
};

type MobileRestingFit = {
  /** Final height of every block. */
  heights: Record<string, number>;
  /** Final gap above every block. */
  gaps: Record<string, number>;
  /** The edge falls between blocks or in a legal peek. */
  clear: boolean;
  /** How it got there. */
  mode: "natural" | "shrunk" | "grown";
  /** The first block that starts under the edge or is cut by it, if any. */
  under: string | null;
};

type State = { heights: number[]; gaps: number[] };

type Verdict =
  | { fine: true; under: number | null }
  | { fine: false; index: number; shrinkNeed: number; growNeed: number };

function judge(blocks: readonly MobileRestingBlock[], state: State, top: number, edge: number): Verdict {
  let y = top;
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index]!;
    const blockTop = y + state.gaps[index]!;
    const blockBottom = blockTop + state.heights[index]!;
    y = blockBottom;
    if (blockBottom <= edge - MOBILE_RESTING.margin) continue;
    if (blockTop >= edge - MOBILE_RESTING.tolerance) return { fine: true, under: index };
    const visible = edge - MOBILE_RESTING.margin - blockTop;
    const tooMuch = block.rests === "peek" && block.maxVisible !== undefined && visible > block.maxVisible;
    if (block.rests === "peek" && visible >= (block.minVisible ?? 0) && !tooMuch) return { fine: true, under: index };
    return {
      fine: false,
      index,
      shrinkNeed:
        block.rests === "peek" && !tooMuch
          ? (block.minVisible ?? 0) - visible
          : blockBottom - (edge - MOBILE_RESTING.margin),
      // Too much showing: push it down until only `maxVisible` does.
      growNeed: tooMuch ? visible - block.maxVisible! : edge - MOBILE_RESTING.tolerance - blockTop,
    };
  }
  return { fine: true, under: null };
}

function natural(blocks: readonly MobileRestingBlock[]): State {
  return { heights: blocks.map((block) => block.height), gaps: blocks.map((block) => block.gap) };
}

function cost(blocks: readonly MobileRestingBlock[], state: State): number {
  return blocks.reduce(
    (total, block, index) =>
      total + Math.abs(state.heights[index]! - block.height) + Math.abs(state.gaps[index]! - block.gap),
    0,
  );
}

/** One shrink step on the lever that gives first among the cut block and those above it; null when none is left. */
function shrinkStep(blocks: readonly MobileRestingBlock[], state: State, verdict: Verdict & { fine: false }): State | null {
  let lever = -1;
  for (let index = 0; index <= verdict.index; index += 1) {
    const shrink = blocks[index]!.shrink;
    if (!shrink) continue;
    const left = shrink.by - (blocks[index]!.height - state.heights[index]!);
    if (left < (shrink.step ?? 0.5)) continue;
    if (lever < 0 || shrink.order < blocks[lever]!.shrink!.order) lever = index;
  }
  if (lever < 0) return null;
  const shrink = blocks[lever]!.shrink!;
  const left = shrink.by - (blocks[lever]!.height - state.heights[lever]!);
  const next = { heights: [...state.heights], gaps: [...state.gaps] };
  next.heights[lever]! -= shrink.step ?? Math.min(left, Math.max(0.5, verdict.shrinkNeed));
  return next;
}

/**
 * From `state`, drops whatever the edge still cuts under it: growing blocks
 * above it first, then opening the gap before it (at most `maxPush`). Never
 * lets that move an earlier block onto the edge.
 */
function settle(blocks: readonly MobileRestingBlock[], start: State, top: number, edge: number): State | null {
  const state = { heights: [...start.heights], gaps: [...start.gaps] };
  let target = -1;
  for (let guard = 0; guard < 64; guard += 1) {
    const verdict = judge(blocks, state, top, edge);
    if (verdict.fine) return state;
    if (target < 0) target = verdict.index;
    else if (verdict.index < target) return null;
    else target = verdict.index;
    let lever = -1;
    for (let index = 0; index < target; index += 1) {
      const grow = blocks[index]!.grow;
      if (!grow) continue;
      const left = grow.by - (state.heights[index]! - blocks[index]!.height);
      if (left < 0.5) continue;
      if (lever < 0 || grow.order < blocks[lever]!.grow!.order) lever = index;
    }
    if (lever >= 0) {
      const grow = blocks[lever]!.grow!;
      const left = grow.by - (state.heights[lever]! - blocks[lever]!.height);
      state.heights[lever]! += Math.min(left, verdict.growNeed);
      continue;
    }
    const pushed = state.gaps[target]! - blocks[target]!.gap;
    if (pushed + verdict.growNeed > MOBILE_RESTING.maxPush) return null;
    state.gaps[target]! += verdict.growNeed;
  }
  return null;
}

/**
 * Sizes a page's first blocks so the edge at `edge` (window coordinates, the
 * top of the bottom chrome) cuts nothing that rests whole. `top` is where the
 * first block's gap starts at rest, in the same coordinates.
 */
export function fitMobileRestingContent({
  top,
  edge,
  blocks,
}: {
  top: number;
  edge: number;
  blocks: readonly MobileRestingBlock[];
}): MobileRestingFit {
  const pack = (state: State, mode: MobileRestingFit["mode"]): MobileRestingFit => {
    const verdict = judge(blocks, state, top, edge);
    const heights: Record<string, number> = {};
    const gaps: Record<string, number> = {};
    blocks.forEach((block, index) => {
      heights[block.key] = state.heights[index]!;
      gaps[block.key] = state.gaps[index]!;
    });
    const under = verdict.fine ? verdict.under : verdict.index;
    return { heights, gaps, clear: verdict.fine, mode, under: under === null ? null : blocks[under]!.key };
  };
  const start = natural(blocks);
  if (!(edge > top) || judge(blocks, start, top, edge).fine) return pack(start, "natural");
  // Candidates: every amount of shrinking (none, one step, two…), each either
  // clear as it is or settled by dropping what is still cut under the edge.
  type Candidate = { state: State; shrunk: boolean; grown: boolean; peeks: boolean };
  const candidates: Candidate[] = [];
  let state: State | null = start;
  for (let guard = 0; state && guard < 256; guard += 1) {
    const verdict = judge(blocks, state, top, edge);
    const shrunk = guard > 0;
    if (verdict.fine) {
      candidates.push({ state, shrunk, grown: false, peeks: true });
      break;
    }
    const settled = settle(blocks, state, top, edge);
    if (settled) candidates.push({ state: settled, shrunk, grown: true, peeks: false });
    state = shrinkStep(blocks, state, verdict);
  }
  if (!candidates.length) return pack(start, "natural");
  // A section that may peek is there to be seen: if shrinking alone lets it
  // show, that wins. Otherwise the least change wins.
  const firstCut = judge(blocks, start, top, edge);
  const peekTarget = !firstCut.fine && blocks[firstCut.index]!.rests === "peek";
  const showing = candidates.find((candidate) => candidate.peeks);
  const best =
    peekTarget && showing
      ? showing
      : candidates.reduce((a, b) => (cost(blocks, b.state) < cost(blocks, a.state) ? b : a));
  return pack(best.state, best.grown ? "grown" : best.shrunk ? "shrunk" : "natural");
}

/**
 * The compact-height tab bar's band at the window's foot (measured on the
 * iPhone Air in landscape, iOS 27: the floating bar spans y 356–420 of a
 * 420 pt window). UIKit does not extend a tab page's bottom safe area by it
 * there (the inset stays at the home indicator's 21 pt), so resting content
 * would run under the bar.
 */
const MOBILE_COMPACT_TAB_BAR_BAND = 64;

/** Windows shorter than this are compact height (an iPhone in landscape is 402–440 pt). */
const MOBILE_COMPACT_HEIGHT = 500;

export function isMobileCompactHeight(windowHeight: number): boolean {
  return windowHeight > 0 && windowHeight < MOBILE_COMPACT_HEIGHT;
}

/**
 * Where a tab page's resting content must end: the window less its bottom
 * inset (which carries the tab bar in a regular-height window), and never
 * lower than the compact tab bar's top in a short one.
 */
export function getMobileExploreRestingEdge(
  windowHeight: number,
  insetBottom: number,
  compactHeight: boolean,
): number {
  const band = compactHeight ? MOBILE_COMPACT_TAB_BAR_BAND : 0;
  return windowHeight - Math.max(insetBottom, band);
}

/**
 * The bottom bars float as capsules narrower than a wide window (a phone in
 * landscape: the tab bar spans about 40 % of it; an iPad), so a section the
 * fit drops "under the edge" there is not under anything at its sides: its
 * heading showed in the corner beside the bar. Wider than this, a section
 * that starts under the edge starts under the window's bottom instead.
 */
const MOBILE_EXPLORE_OPEN_SIDES_WIDTH = 700;

/**
 * Extra gap that moves a section the fit dropped under the edge (`top`, in
 * window coordinates) below the window's bottom when the bars leave the
 * window's sides open. Zero in a narrow window, where the bars span it.
 */
export function getMobileExploreUnderPush(input: {
  top: number;
  edge: number;
  windowWidth: number;
  windowHeight: number;
}): number {
  if (input.windowWidth <= MOBILE_EXPLORE_OPEN_SIDES_WIDTH) return 0;
  if (input.top < input.edge - MOBILE_RESTING.tolerance) return 0;
  return Math.max(0, Math.ceil(input.windowHeight - input.top));
}
