import type { PageMapInput, SecondaryRenderPlan } from './types';
import type { SecondaryMatch } from './hash';

export function mapSecondaryPageIndex({ primaryIndex, driftDelta }: PageMapInput): number {
  const delta = driftDelta ?? 0;
  return primaryIndex + delta;
}

export function clampIndex(index: number, length: number): number {
  if (!Number.isFinite(length) || length <= 0) return 0;
  if (!Number.isFinite(index)) return 0;
  const max = Math.max(0, length - 1);
  return Math.max(0, Math.min(max, Math.trunc(index)));
}

export function getDriftExpectedIndex(input: {
  expectedIndex: number;
  match: SecondaryMatch;
  readingMode: 'rtl' | 'ltr' | 'scrolling';
}): number {
  const { expectedIndex, match, readingMode } = input;
  if (match.kind !== 'split') return expectedIndex;
  if (!Number.isFinite(expectedIndex)) return expectedIndex;
  const isRtl = readingMode === 'rtl';
  const isSecondHalf = isRtl ? match.side === 'left' : match.side === 'right';
  if (!isSecondHalf) return expectedIndex;
  return Math.max(0, expectedIndex - 1);
}

export function shouldApplySiblingSplit(input: {
  match: SecondaryMatch;
  sibling: SecondaryMatch | null | undefined;
}): boolean {
  const { match, sibling } = input;
  if (match.kind !== 'split') return false;
  if (!sibling || sibling.kind !== 'split') return false;
  if (sibling.index !== match.index) return false;
  return sibling.side !== match.side;
}

export function shouldApplySiblingSplitPlan(input: {
  match: SecondaryMatch;
  sibling: SecondaryMatch | null | undefined;
  sameSecondaryChapter: boolean;
}): boolean {
  if (!input.sameSecondaryChapter) return false;
  return shouldApplySiblingSplit({ match: input.match, sibling: input.sibling });
}

export function shouldMarkMissing(input: {
  bestDistance: number;
  secondBestDistance: number;
  missingDistance: number;
  missingGap: number;
}): boolean {
  if (!Number.isFinite(input.bestDistance)) return false;
  if (input.bestDistance < input.missingDistance) return false;
  const gap = input.secondBestDistance - input.bestDistance;
  return gap <= input.missingGap;
}

export function buildSecondaryRenderPlan(input: {
  match: SecondaryMatch;
  secondaryChapterId: string;
  driftDelta: number;
}): SecondaryRenderPlan {
  const common = {
    secondaryChapterId: input.secondaryChapterId,
    driftDelta: input.driftDelta,
  };
  if (input.match.kind === 'single') {
    return { kind: 'single', secondaryIndex: input.match.index, ...common };
  }
  if (input.match.kind === 'split') {
    return { kind: 'split', secondaryIndex: input.match.index, side: input.match.side, ...common };
  }
  return {
    kind: 'merge',
    secondaryIndices: [input.match.indexA, input.match.indexB],
    order: input.match.order,
    ...common,
  };
}

export function buildMissingRenderPlan(input: {
  secondaryChapterId: string;
  driftDelta: number;
}): SecondaryRenderPlan {
  return {
    kind: 'missing',
    secondaryChapterId: input.secondaryChapterId,
    driftDelta: input.driftDelta,
  };
}
