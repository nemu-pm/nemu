import { describe, it, expect } from 'bun:test';
import {
  mapSecondaryChapterForPrimary,
  matchSecondaryChapter,
  pairNextChapters,
  pickSecondaryChapterId,
  resolveSecondaryChapterSelection,
} from './chapters';

describe('dual-reader chapters', () => {
  it('maps with seed pair using chapterNumber delta', () => {
    const primaryAll = [
      { id: 'p1', chapterNumber: 1 },
      { id: 'p2', chapterNumber: 2 },
      { id: 'p3', chapterNumber: 3 },
      { id: 'p4', chapterNumber: 4 },
    ];
    const secondaryAll = [
      { id: 's1', chapterNumber: 10 },
      { id: 's2', chapterNumber: 11 },
      { id: 's3', chapterNumber: 12 },
      { id: 's4', chapterNumber: 13 },
    ];

    const result = mapSecondaryChapterForPrimary({
      primaryChapter: primaryAll[3],
      primaryAll,
      secondaryAll,
      seedPair: { primaryId: 'p2', secondaryId: 's2' },
    });

    expect(result).toBe('s4');
  });

  it('maps with seed pair using index delta when numbers missing', () => {
    const primaryAll = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }, { id: 'p4' }];
    const secondaryAll = [{ id: 's1' }, { id: 's2' }, { id: 's3' }, { id: 's4' }];

    const result = mapSecondaryChapterForPrimary({
      primaryChapter: primaryAll[2],
      primaryAll,
      secondaryAll,
      seedPair: { primaryId: 'p1', secondaryId: 's2' },
    });

    expect(result).toBe('s4');
  });

  it('matches without seed using closest chapterNumber', () => {
    const primary = { id: 'p10', chapterNumber: 5 };
    const secondaryAll = [
      { id: 's3', chapterNumber: 3 },
      { id: 's5', chapterNumber: 5 },
      { id: 's8', chapterNumber: 8 },
    ];

    const result = matchSecondaryChapter({ primaryChapter: primary, secondaryAll });
    expect(result).toBe('s5');
  });

  it('prefers title similarity when numbers missing', () => {
    const primaryAll = [
      { id: 'p1', title: 'Prologue' },
      { id: 'p2', title: 'Chapter 1 - Start' },
      { id: 'p3', title: 'Chapter 2 - Meet' },
    ];
    const secondaryAll = [
      { id: 's1', title: 'Prologue' },
      { id: 's2', title: 'Chapter 1 Start' },
      { id: 's3', title: 'Chapter 2 Meet' },
    ];

    const result = mapSecondaryChapterForPrimary({
      primaryChapter: primaryAll[2],
      primaryAll,
      secondaryAll,
    });

    expect(result).toBe('s3');
  });

  it('pairNextChapters uses seed pair continuity', () => {
    const primaryAll = [
      { id: 'p1', chapterNumber: 1 },
      { id: 'p2', chapterNumber: 2 },
      { id: 'p3', chapterNumber: 3 },
    ];
    const secondaryAll = [
      { id: 's1', chapterNumber: 5 },
      { id: 's2', chapterNumber: 6 },
      { id: 's3', chapterNumber: 7 },
    ];

    const result = pairNextChapters({
      primaryNext: primaryAll[2],
      primaryAll,
      secondaryAll,
      seedPair: { primaryId: 'p1', secondaryId: 's1' },
    });

    expect(result).toBe('s3');
  });

  it('picks latest secondary chapter when no primary is available', () => {
    const secondaryAll = [
      { id: 's1', chapterNumber: 2 },
      { id: 's2', chapterNumber: 5 },
      { id: 's3', chapterNumber: 4 },
    ];

    const result = pickSecondaryChapterId({
      primaryChapter: null,
      primaryAll: [],
      secondaryAll,
    });

    expect(result).toBe('s2');
  });

  it('clears invalid selection when switching secondary sources', () => {
    const primaryAll = [{ id: 'p1', chapterNumber: 1 }];
    const secondaryAll = [
      { id: 's1', chapterNumber: 1 },
      { id: 's2', chapterNumber: 2 },
    ];

    const result = resolveSecondaryChapterSelection({
      selectedId: 's-old',
      primaryChapter: primaryAll[0],
      primaryAll,
      secondaryAll,
    });

    expect(result).toBe('s1');
  });
});
