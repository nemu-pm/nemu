import { describe, it, expect } from 'bun:test';
import { dhashWordFromHex, findBestSecondaryMatch } from './hash';
import type { Dhash, MultiDhash } from './hash';

const ALL = 'ffffffffffffffff';
const HALF = 'ffffffff';
const ZERO = '0';

function dh(h: string, v: string): Dhash {
  return { h: dhashWordFromHex(h), v: dhashWordFromHex(v) };
}

function multi(full: Dhash, extra?: Partial<MultiDhash>): MultiDhash {
  return { full, ...extra };
}

describe('dual-reader alignment', () => {
  it('prefers split when a secondary spread side matches better', () => {
    const primaryHash = multi(dh(ZERO, ZERO));
    const secondaryHashes = [
      multi(dh(ALL, ALL)),
      multi(dh(ALL, ALL), { left: dh(ZERO, ZERO), right: dh(ALL, ALL) }),
      multi(dh(ALL, ALL)),
    ];

    const result = findBestSecondaryMatch({
      primaryHash,
      secondaryHashes,
      expectedIndex: 1,
      windowSize: 1,
      deviationBias: 0,
      variantPenalty: 20,
      fullThreshold: 20,
      splitMargin: 8,
      splitPenalty: 4,
      mergePenalty: 6,
      primarySpreadThreshold: 24,
      secondarySpreadThreshold: 24,
    });

    expect(result).not.toBeNull();
    expect(result!.best.kind).toBe('split');
    if (result!.best.kind === 'split') {
      expect(result!.best.index).toBe(1);
      expect(result!.best.side).toBe('left');
    }
  });

  it('prefers merge when primary spread matches two secondary pages', () => {
    const primaryHash = multi(dh(HALF, HALF), { left: dh(ZERO, ZERO), right: dh(ALL, ALL) });
    const secondaryHashes = [multi(dh(ZERO, ZERO)), multi(dh(ALL, ALL))];

    const result = findBestSecondaryMatch({
      primaryHash,
      secondaryHashes,
      expectedIndex: 0,
      windowSize: 1,
      deviationBias: 0,
      variantPenalty: 20,
      fullThreshold: 20,
      splitMargin: 8,
      splitPenalty: 4,
      mergePenalty: 6,
      primarySpreadThreshold: 24,
      secondarySpreadThreshold: 24,
    });

    expect(result).not.toBeNull();
    expect(result!.best.kind).toBe('merge');
    if (result!.best.kind === 'merge') {
      expect(result!.best.indexA).toBe(0);
      expect(result!.best.indexB).toBe(1);
      expect(result!.best.order).toBe('normal');
    }
  });

  it('breaks ties using expectedIndex when pages are duplicated', () => {
    const primaryHash = multi(dh(ZERO, ZERO));
    const secondaryHashes = [multi(dh(ZERO, ZERO)), multi(dh(ZERO, ZERO))];

    const result = findBestSecondaryMatch({
      primaryHash,
      secondaryHashes,
      expectedIndex: 0,
      windowSize: 1,
      deviationBias: 1,
      variantPenalty: 20,
      fullThreshold: 20,
      splitMargin: 8,
      splitPenalty: 4,
      mergePenalty: 6,
      primarySpreadThreshold: 24,
      secondarySpreadThreshold: 24,
    });

    expect(result).not.toBeNull();
    expect(result!.best.kind).toBe('single');
    if (result!.best.kind === 'single') {
      expect(result!.best.index).toBe(0);
    }
  });

  it('jumps to swapped pages when hash distance dominates the deviation penalty', () => {
    const primaryHash = multi(dh(ALL, ALL));
    const secondaryHashes = [multi(dh(ZERO, ZERO)), multi(dh(ALL, ALL))];

    const result = findBestSecondaryMatch({
      primaryHash,
      secondaryHashes,
      expectedIndex: 0,
      windowSize: 1,
      deviationBias: 1,
      variantPenalty: 20,
      fullThreshold: 20,
      splitMargin: 8,
      splitPenalty: 4,
      mergePenalty: 6,
      primarySpreadThreshold: 24,
      secondarySpreadThreshold: 24,
    });

    expect(result).not.toBeNull();
    expect(result!.best.kind).toBe('single');
    if (result!.best.kind === 'single') {
      expect(result!.best.index).toBe(1);
    }
  });
});
