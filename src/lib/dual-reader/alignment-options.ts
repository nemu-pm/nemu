import { ALIGNMENT_FINE_MAX_DEFAULT, ALIGNMENT_FFT_MAX_DEFAULT } from './alignment-constants';
import type { AlignmentOptions } from './visual-alignment';

export const DEFAULT_ALIGNMENT_OPTIONS: AlignmentOptions = {
  coarseMax: 96,
  fineMax: ALIGNMENT_FINE_MAX_DEFAULT,
  fftMax: ALIGNMENT_FFT_MAX_DEFAULT,
  fftPolicy: 'adaptive',
  scaleMin: 0.8,
  scaleMax: 1.2,
  scaleWindow: 0.3,
  scaleStep: 0.003,
  maxFineScales: 5,
  maxCoarseCandidates: 2,
  useScalePrior: false,
  fftBackend: 'wasm',
  scoreMax: 128,
  useCoarseToFineScore: true,
  useEdgeSampling: true,
  edgeSampleMax: 8000,
  rescoreTopK: 2,
  earlyExit: true,
  profile: false,
};

export function buildAlignmentOptions(overrides: AlignmentOptions = {}): AlignmentOptions {
  const definedOverrides = Object.fromEntries(
    Object.entries(overrides).filter(([, value]) => value !== undefined)
  ) as AlignmentOptions;
  const merged: AlignmentOptions = { ...DEFAULT_ALIGNMENT_OPTIONS, ...definedOverrides };
  if (merged.fineMax != null && merged.coarseMax != null) {
    merged.coarseMax = Math.min(merged.coarseMax, merged.fineMax);
  }
  if (merged.fineMax != null && merged.fftMax != null) {
    merged.fftMax = Math.min(merged.fftMax, merged.fineMax);
  }
  return merged;
}
