import { describe, expect, it } from 'bun:test';
import { buildAlignmentQueue, getAlignmentPlanSignature } from './alignment-scheduler';
import type { SecondaryAlignment, SecondaryRenderPlan } from './types';

const makeAlignment = (): SecondaryAlignment => ({
  crop: { top: 0, right: 0, bottom: 0, left: 0 },
  scale: 1,
  dx: 0,
  dy: 0,
  confidence: 1,
});

const makeSinglePlan = (secondaryChapterId: string, index: number, driftDelta = 0): SecondaryRenderPlan => ({
  kind: 'single',
  secondaryChapterId,
  secondaryIndex: index,
  driftDelta,
});

describe('alignment scheduler queue', () => {
  it('orders by distance to visible pages', () => {
    const queue = buildAlignmentQueue({
      visiblePageIndices: [5],
      loadedPageIndices: [7, 3, 5],
      getPageMeta: (pageIndex) => ({ kind: 'page', chapterId: 'c1', localIndex: pageIndex }),
      getPageImageUrl: (pageIndex) => `blob:${pageIndex}`,
      renderPlansByChapter: {
        c1: {
          3: makeSinglePlan('s1', 3),
          5: makeSinglePlan('s1', 5),
          7: makeSinglePlan('s1', 7),
        },
      },
      alignmentByChapter: {},
      driftDeltaByChapter: { c1: 0 },
    });

    expect(queue.map((entry) => entry.globalIndex)).toEqual([5, 3, 7]);
    expect(queue[0]?.distance).toBe(0);
    expect(queue[1]?.distance).toBe(2);
    expect(queue[2]?.distance).toBe(2);
  });

  it('skips missing plans and drift mismatches', () => {
    const queue = buildAlignmentQueue({
      visiblePageIndices: [1],
      loadedPageIndices: [1, 2],
      getPageMeta: (pageIndex) => ({ kind: 'page', chapterId: 'c1', localIndex: pageIndex }),
      getPageImageUrl: (pageIndex) => `blob:${pageIndex}`,
      renderPlansByChapter: {
        c1: {
          1: makeSinglePlan('s1', 1, 1),
        },
      },
      alignmentByChapter: {},
      driftDeltaByChapter: { c1: 0 },
    });

    expect(queue).toHaveLength(0);
  });

  it('skips pages with existing alignment for the same secondary chapter', () => {
    const alignment: Record<string, { secondaryChapterId: string; byPage: Record<number, SecondaryAlignment> }> =
      {
        c1: {
          secondaryChapterId: 's1',
          byPage: {
            2: makeAlignment(),
          },
        },
      };
    const queue = buildAlignmentQueue({
      visiblePageIndices: [2],
      loadedPageIndices: [2],
      getPageMeta: (pageIndex) => ({ kind: 'page', chapterId: 'c1', localIndex: pageIndex }),
      getPageImageUrl: (pageIndex) => `blob:${pageIndex}`,
      renderPlansByChapter: {
        c1: {
          2: makeSinglePlan('s1', 2),
        },
      },
      alignmentByChapter: alignment,
      driftDeltaByChapter: { c1: 0 },
    });

    expect(queue).toHaveLength(0);
  });

  it('builds stable signatures', () => {
    expect(getAlignmentPlanSignature(makeSinglePlan('s1', 4))).toBe('single:s1:4');
  });
});
