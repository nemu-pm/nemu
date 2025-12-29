import { describe, it, expect } from 'bun:test';
import {
  mapSecondaryPageIndex,
  clampIndex,
  getDriftExpectedIndex,
  shouldApplySiblingSplit,
  shouldApplySiblingSplitPlan,
  shouldMarkMissing,
} from './pages';
import type { SecondaryMatch } from './hash';

describe('dual-reader pages', () => {
  it('maps page index with drift', () => {
    const mapped = mapSecondaryPageIndex({ primaryIndex: 5, driftDelta: -1 });
    expect(mapped).toBe(4);
  });

  it('clamps indices to bounds', () => {
    expect(clampIndex(3, 5)).toBe(3);
    expect(clampIndex(-2, 5)).toBe(0);
    expect(clampIndex(99, 5)).toBe(4);
  });

  it('adjusts split drift based on reading order', () => {
    const splitRight: SecondaryMatch = {
      kind: 'split',
      index: 1,
      side: 'right',
      bestIndex: 1,
      distance: 4,
      score: 4,
      fullDistance: 12,
    };
    const splitLeft: SecondaryMatch = {
      kind: 'split',
      index: 1,
      side: 'left',
      bestIndex: 1,
      distance: 4,
      score: 4,
      fullDistance: 12,
    };

    expect(getDriftExpectedIndex({ expectedIndex: 2, match: splitRight, readingMode: 'ltr' })).toBe(1);
    expect(getDriftExpectedIndex({ expectedIndex: 2, match: splitRight, readingMode: 'rtl' })).toBe(2);
    expect(getDriftExpectedIndex({ expectedIndex: 2, match: splitLeft, readingMode: 'rtl' })).toBe(1);
    expect(getDriftExpectedIndex({ expectedIndex: 2, match: splitLeft, readingMode: 'ltr' })).toBe(2);
    expect(getDriftExpectedIndex({ expectedIndex: 0, match: splitRight, readingMode: 'ltr' })).toBe(0);
  });

  it('requires sibling split to be complementary', () => {
    const base: SecondaryMatch = {
      kind: 'split',
      index: 2,
      side: 'left',
      bestIndex: 2,
      distance: 4,
      score: 4,
      fullDistance: 12,
    };
    const siblingOk: SecondaryMatch = { ...base, side: 'right' };
    const siblingSameSide: SecondaryMatch = { ...base, side: 'left' };
    const siblingDiffIndex: SecondaryMatch = { ...base, index: 3, side: 'right' };
    const siblingSingle: SecondaryMatch = {
      kind: 'single',
      index: 2,
      bestIndex: 2,
      distance: 4,
      score: 4,
      fullDistance: 12,
      variantDistance: 12,
      bestVariant: null,
    };

    expect(shouldApplySiblingSplit({ match: base, sibling: siblingOk })).toBe(true);
    expect(shouldApplySiblingSplit({ match: base, sibling: siblingSameSide })).toBe(false);
    expect(shouldApplySiblingSplit({ match: base, sibling: siblingDiffIndex })).toBe(false);
    expect(shouldApplySiblingSplit({ match: base, sibling: siblingSingle })).toBe(false);
    expect(shouldApplySiblingSplit({ match: base, sibling: null })).toBe(false);
  });

  it('avoids propagating split when sibling best match disagrees', () => {
    const base: SecondaryMatch = {
      kind: 'split',
      index: 1,
      side: 'right',
      bestIndex: 1,
      distance: 3,
      score: 3,
      fullDistance: 10,
    };
    const siblingSingle: SecondaryMatch = {
      kind: 'single',
      index: 2,
      bestIndex: 2,
      distance: 5,
      score: 5,
      fullDistance: 12,
      variantDistance: 12,
      bestVariant: null,
    };
    const siblingOpposite: SecondaryMatch = { ...base, side: 'left' };

    expect(
      shouldApplySiblingSplitPlan({ match: base, sibling: siblingSingle, sameSecondaryChapter: true })
    ).toBe(false);
    expect(
      shouldApplySiblingSplitPlan({ match: base, sibling: siblingOpposite, sameSecondaryChapter: false })
    ).toBe(false);
    expect(
      shouldApplySiblingSplitPlan({ match: base, sibling: siblingOpposite, sameSecondaryChapter: true })
    ).toBe(true);
  });

  it('marks missing when distances are high and ambiguous', () => {
    expect(
      shouldMarkMissing({
        bestDistance: 47,
        secondBestDistance: 50,
        missingDistance: 45,
        missingGap: 10,
      })
    ).toBe(true);

    expect(
      shouldMarkMissing({
        bestDistance: 47,
        secondBestDistance: 80,
        missingDistance: 45,
        missingGap: 10,
      })
    ).toBe(false);

    expect(
      shouldMarkMissing({
        bestDistance: 30,
        secondBestDistance: 35,
        missingDistance: 45,
        missingGap: 10,
      })
    ).toBe(false);
  });
});
