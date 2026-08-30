import type { SecondaryAlignment, SecondaryRenderPlan } from './types';
import { ALIGNMENT_CONFIDENCE_MIN_DEFAULT } from './alignment-constants';

export type AlignmentQueueEntry = {
  chapterId: string;
  localIndex: number;
  globalIndex: number;
  primaryUrl: string;
  renderPlan: SecondaryRenderPlan;
  secondaryChapterId: string;
  distance: number;
};

export type AlignmentQueueInput = {
  visiblePageIndices: number[];
  loadedPageIndices: number[];
  getPageMeta: (pageIndex: number) =>
    | {
        kind: 'page' | 'spacer';
        chapterId?: string;
        localIndex?: number;
        key?: string;
      }
    | null;
  getPageImageUrl: (pageIndex: number) => string | undefined;
  renderPlansByChapter: Record<string, Record<number, SecondaryRenderPlan>>;
  alignmentByChapter: Record<
    string,
    { secondaryChapterId: string; byPage: Record<number, SecondaryAlignment> }
  >;
  driftDeltaByChapter: Record<string, number>;
};

export function getAlignmentPlanSignature(plan: SecondaryRenderPlan): string {
  if (plan.kind === 'single') {
    return `single:${plan.secondaryChapterId}:${plan.secondaryIndex}`;
  }
  if (plan.kind === 'split') {
    return `split:${plan.secondaryChapterId}:${plan.secondaryIndex}:${plan.side}`;
  }
  if (plan.kind === 'merge') {
    return `merge:${plan.secondaryChapterId}:${plan.secondaryIndices[0]}:${plan.secondaryIndices[1]}:${plan.order}`;
  }
  return `missing:${plan.secondaryChapterId}`;
}

function distanceToVisible(globalIndex: number, visible: number[]): number {
  if (visible.length === 0) return 0;
  let best = Number.POSITIVE_INFINITY;
  for (const index of visible) {
    const delta = Math.abs(globalIndex - index);
    if (delta < best) best = delta;
  }
  return best === Number.POSITIVE_INFINITY ? 0 : best;
}

export function buildAlignmentQueue(input: AlignmentQueueInput): AlignmentQueueEntry[] {
  const {
    visiblePageIndices,
    loadedPageIndices,
    getPageMeta,
    getPageImageUrl,
    renderPlansByChapter,
    alignmentByChapter,
    driftDeltaByChapter,
  } = input;
  // Always include visible pages, even if `loadedPageIndices` is non-empty.
  // Some reader implementations can report a non-empty loaded set that doesn't include the current visible pages,
  // which would starve alignment for what the user is actually viewing.
  const loaded =
    loadedPageIndices.length > 0
      ? Array.from(new Set([...visiblePageIndices, ...loadedPageIndices]))
      : visiblePageIndices;
  const candidates: AlignmentQueueEntry[] = [];
  const unique = new Set<number>();

  for (const globalIndex of loaded) {
    if (unique.has(globalIndex)) continue;
    unique.add(globalIndex);
    const meta = getPageMeta(globalIndex);
    if (!meta || meta.kind !== 'page' || meta.chapterId == null || meta.localIndex == null) continue;
    const chapterId = meta.chapterId;
    const localIndex = meta.localIndex;
    const renderPlan = renderPlansByChapter[chapterId]?.[localIndex];
    if (!renderPlan || renderPlan.kind === 'missing') continue;
    const driftDelta = driftDeltaByChapter[chapterId] ?? 0;
    if (renderPlan.driftDelta !== driftDelta) continue;
    const alignmentEntry = alignmentByChapter[chapterId];
    const existingAlignment =
      alignmentEntry?.secondaryChapterId === renderPlan.secondaryChapterId
        ? alignmentEntry.byPage[localIndex]
        : undefined;
    // Don't treat low-confidence alignment as "done" — allow re-attempts.
    if (existingAlignment && existingAlignment.confidence >= ALIGNMENT_CONFIDENCE_MIN_DEFAULT) continue;
    const primaryUrl = getPageImageUrl(globalIndex);
    if (!primaryUrl) continue;
    candidates.push({
      chapterId,
      localIndex,
      globalIndex,
      primaryUrl,
      renderPlan,
      secondaryChapterId: renderPlan.secondaryChapterId,
      distance: distanceToVisible(globalIndex, visiblePageIndices),
    });
  }

  candidates.sort((a, b) => {
    if (a.distance !== b.distance) return a.distance - b.distance;
    return a.globalIndex - b.globalIndex;
  });
  return candidates;
}
