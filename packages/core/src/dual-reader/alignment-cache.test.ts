import { describe, expect, it } from 'bun:test';
import { makeAlignmentSampleCacheId } from './alignment-cache';

describe('makeAlignmentSampleCacheId', () => {
  it('includes sample size in the cache id', () => {
    const base = 'debug:pair:primary';
    expect(makeAlignmentSampleCacheId(base, 320)).toBe('debug:pair:primary:s320');
    expect(makeAlignmentSampleCacheId(base, 512)).toBe('debug:pair:primary:s512');
    expect(makeAlignmentSampleCacheId(base, 512)).not.toBe(makeAlignmentSampleCacheId(base, 320));
  });

  it('normalizes non-integer sample sizes', () => {
    expect(makeAlignmentSampleCacheId('id', 12.9)).toBe('id:s12');
    expect(makeAlignmentSampleCacheId('id', 0)).toBe('id:s1');
  });
});
