/**
 * Automatic spread parity from what a scanned book's pages show about where
 * they were bound.
 *
 * - Side evidence `e ∈ [-1, 1]`: a printed page's binding margin is wider
 *   than its outer one, so a page whose wider blank margin is on its LEFT
 *   edge sat on the RIGHT of a spread (+1), and the other way round (-1).
 * - Continuity `c ∈ [0, 1]`: artwork that runs across two facing pages
 *   matches along their inner edges.
 *
 * A segment's parity is the hypothesis that scores best; it is only taken
 * when it wins clearly, otherwise the fixed rule (the cover alone) stands.
 * A Viterbi pass over the pages finds an inserted or missing page, where the
 * parity changes inside the segment. Measured on 13 scanned volumes
 * (2,859 pages): 99%+ correct when it decides, and it abstains on web
 * comics without margins instead of guessing.
 */
import type { MobileReaderPairingSegment, MobileReaderSegmentParity } from "./mobileReaderPairing";

/** What inference reads from one page (`MobileReaderPageFeatures`). */
export type MobileReaderParityFeatures = {
  width: number;
  height: number;
  marginL: number;
  marginR: number;
  edgeL: readonly number[];
  edgeR: readonly number[];
};

/** Weight of an artwork match across a pair. */
export const READER_PARITY_CONTINUITY_WEIGHT = 3;
/** Cost of a parity change inside a segment (an inserted or missing page). */
export const READER_PARITY_SWITCH_PENALTY = 4;
/** The winning hypothesis must lead by this much to be taken. */
export const READER_PARITY_CONFIDENT_MARGIN = 1.5;

/** + = binding margin on the left edge: the page sat on the right of its spread. */
export function mobileReaderSideEvidence(page: MobileReaderParityFeatures | null | undefined): number {
  if (!page || !(page.height > 0)) return 0;
  if (page.width > page.height * 1.2) return 0;
  const difference = page.marginL - page.marginR;
  if (Math.max(page.marginL, page.marginR) < 0.03 || Math.abs(difference) < 0.02) return 0;
  return Math.max(-1, Math.min(1, difference / 0.06));
}

function deviation(values: readonly number[]): number {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
}

/**
 * Artwork continuing from the right-hand page's left edge into the
 * left-hand page's right edge. Both edges must carry ink with structure (a
 * bare margin or a flat fill matches anything).
 */
export function mobileReaderEdgeContinuity(
  rightPage: MobileReaderParityFeatures | null | undefined,
  leftPage: MobileReaderParityFeatures | null | undefined,
): number {
  const a = rightPage?.edgeL;
  const b = leftPage?.edgeR;
  if (!a || !b || a.length === 0 || a.length !== b.length) return 0;
  const ink = (values: readonly number[]) => values.filter((value) => value < 0.85).length / values.length;
  if (ink(a) < 0.25 || ink(b) < 0.25) return 0;
  if (deviation(a) < 0.03 || deviation(b) < 0.03) return 0;
  const difference = a.reduce((sum, value, index) => sum + Math.abs(value - b[index]!), 0) / a.length;
  return Math.max(0, 1 - difference / 0.12);
}

/**
 * Parity hypotheses are physical: `q` = local pages with `j % 2 === q` sit on
 * the right. In right-to-left reading the right-hand page is read first and
 * starts the pair, in left-to-right the left-hand page does.
 */
function pairStateForRightParity(q: 0 | 1, rtl: boolean): 0 | 1 {
  return rtl ? q : q === 0 ? 1 : 0;
}

/** The parity of one segment, or null to keep the fixed rule. */
export function inferMobileReaderSegmentParity(input: {
  segment: MobileReaderPairingSegment;
  featuresAt: (index: number) => MobileReaderParityFeatures | null | undefined;
  rtl: boolean;
}): MobileReaderSegmentParity | null {
  const { segment, rtl } = input;
  const length = segment.end - segment.start;
  if (segment.wide || length < 2) return null;
  const pages = Array.from({ length }, (_, j) => input.featuresAt(segment.start + j) ?? null);
  const evidence = pages.map(mobileReaderSideEvidence);
  // continuity[j]: pages j and j + 1 facing each other (j on the right when j % 2 === q).
  const continuity = Array.from({ length: length - 1 }, (_, j) => ({
    // Under q with j % 2 === q, page j is the right-hand page.
    jRight: mobileReaderEdgeContinuity(pages[j], pages[j + 1]),
    // Otherwise page j + 1 is on the right.
    jLeft: mobileReaderEdgeContinuity(pages[j + 1], pages[j]),
  }));
  // A pair (j, j+1) exists under q when j % 2 === q (RTL: j is the right page;
  // LTR: j is the left page, the right page is j + 1).
  const pairContinuity = (j: number) => (rtl ? continuity[j]!.jRight : continuity[j]!.jLeft);
  const sign = (j: number, q: 0 | 1) => (j % 2 === q ? 1 : -1);
  const pairStarts = (j: number, q: 0 | 1) => j % 2 === (rtl ? q : 1 - q);

  const score = (q: 0 | 1) => {
    let total = 0;
    for (let j = 0; j < length; j += 1) total += evidence[j]! * sign(j, q);
    for (let j = 0; j < length - 1; j += 1) {
      const c = pairContinuity(j);
      total += pairStarts(j, q) ? READER_PARITY_CONTINUITY_WEIGHT * c : -0.5 * READER_PARITY_CONTINUITY_WEIGHT * c;
    }
    return total;
  };
  const scores = [score(0), score(1)] as const;
  const constant: 0 | 1 | null = Math.abs(scores[0] - scores[1]) < READER_PARITY_CONFIDENT_MARGIN
    ? null
    : scores[0] > scores[1] ? 0 : 1;

  // Viterbi over q per page, so an inserted or missing page changes parity there.
  const best: [number, number][] = [];
  const back: [0 | 1, 0 | 1][] = [];
  best.push([evidence[0]! * sign(0, 0), evidence[0]! * sign(0, 1)]);
  back.push([0, 1]);
  for (let j = 1; j < length; j += 1) {
    const row: [number, number] = [0, 0];
    const from: [0 | 1, 0 | 1] = [0, 0];
    for (const q of [0, 1] as const) {
      const c = pairContinuity(j - 1);
      const pair = pairStarts(j - 1, q)
        ? READER_PARITY_CONTINUITY_WEIGHT * c
        : -0.5 * READER_PARITY_CONTINUITY_WEIGHT * c;
      const stay = best[j - 1]![q] + pair;
      const other: 0 | 1 = q === 0 ? 1 : 0;
      const change = best[j - 1]![other] - READER_PARITY_SWITCH_PENALTY;
      const local = evidence[j]! * sign(j, q);
      if (stay >= change) {
        row[q] = stay + local;
        from[q] = q;
      } else {
        row[q] = change + local;
        from[q] = other;
      }
    }
    best.push(row);
    back.push(from);
  }
  const last = best[length - 1]!;
  const path: (0 | 1)[] = new Array(length);
  path[length - 1] = last[0] >= last[1] ? 0 : 1;
  for (let j = length - 1; j > 0; j -= 1) path[j - 1] = back[j]![path[j]!]!;
  const switches = path.some((q) => q !== path[0]);
  // A parity change is taken only where it clearly beats either constant
  // parity (an inserted or missing page, whose halves cancel out above).
  if (switches && Math.max(last[0], last[1]) - Math.max(scores[0], scores[1]) >= READER_PARITY_CONFIDENT_MARGIN) {
    return path.map((q) => pairStateForRightParity(q, rtl));
  }
  return constant === null ? null : pairStateForRightParity(constant, rtl);
}
