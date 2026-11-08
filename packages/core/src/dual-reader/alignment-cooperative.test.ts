import { describe, expect, it } from 'bun:test';
import {
  AlignmentAbortedError,
  AlignmentTimeoutError,
  computeAlignmentTransformCooperative,
} from './alignment-cooperative';
import { buildAlignmentOptions } from './alignment-options';
import {
  computeGradient,
  computeGradientSteps,
  downsampleToMax,
  downsampleToMaxSteps,
  type AlignmentSteps,
} from './image';
import { computeAlignmentTransform, computeAlignmentTransformSteps, type AlignmentResult } from './visual-alignment';
import { buildAlignmentFixtures, makeSyntheticPage } from './visual-alignment.fixtures';

// App sizes: mobile samples are <= 512 on the long side, aligned with fineMax 512 / fftMax 256 / JS FFT.
const appOptions = () => buildAlignmentOptions({ fineMax: 512, fftMax: 256, fftBackend: 'js' });
const microtaskYield = () => Promise.resolve();
const strip = (r: AlignmentResult) => ({ ...r, timings: undefined });

function drain<T>(steps: AlignmentSteps<T>): T {
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
}

describe('cooperative dual-reader alignment', () => {
  const fixtures = buildAlignmentFixtures();
  const shifted = fixtures.filter((f) => f.name.includes('shifted'));

  it('image step variants are bit-identical to the sync helpers', () => {
    const page = makeSyntheticPage(362, 512, 5);
    const always = () => true;
    expect(drain(computeGradientSteps(page.data, page.width, page.height, always))).toEqual(
      computeGradient(page.data, page.width, page.height)
    );
    expect(drain(downsampleToMaxSteps(page.data, page.width, page.height, 96, always))).toEqual(
      downsampleToMax(page.data, page.width, page.height, 96)
    );
  });

  for (const fixture of shifted) {
    it(
      `chunked result equals synchronous result (${fixture.name}) with every slice within budget`,
      async () => {
        const input = { primary: fixture.primary, secondary: fixture.secondary, options: appOptions() };
        const sync = computeAlignmentTransform(input);
        expect(sync.confidence).toBeGreaterThan(0.2);

        const slices: number[] = [];
        let sliceStart = 0;
        const steps = computeAlignmentTransformSteps(input, () => performance.now() - sliceStart >= 6);
        let chunked: AlignmentResult;
        for (;;) {
          sliceStart = performance.now();
          const r = steps.next();
          slices.push(performance.now() - sliceStart);
          if (r.done) {
            chunked = r.value;
            break;
          }
        }
        expect(strip(chunked)).toEqual(strip(sync));
        expect(slices.length).toBeGreaterThan(20);
        const sorted = [...slices].sort((a, b) => a - b);
        const p99 = sorted[Math.floor(sorted.length * 0.99)]!;
        // Budget 6 ms; deterministic checkpoint gaps are < 1 ms. p99 tolerates rare GC pauses,
        // the hard ceiling is the product requirement (never block > 50 ms).
        expect(p99).toBeLessThan(12);
        expect(sorted[sorted.length - 1]!).toBeLessThan(50);

        const coop = await computeAlignmentTransformCooperative(input, {
          sliceBudgetMs: 6,
          yieldToHost: microtaskYield,
        });
        expect(strip(coop.result)).toEqual(strip(sync));
        expect(coop.stats.slices).toBeGreaterThan(20);
        expect(coop.stats.maxSliceMs).toBeLessThan(50);
      },
      60_000
    );
  }

  it(
    'chunked result equals synchronous result on the brute-force fallback path',
    async () => {
      // Unrelated pages at a reduced size keep the (expensive) fallback path fast in tests.
      const unrelated = fixtures.find((f) => f.name === 'portrait-unrelated')!;
      const input = {
        primary: unrelated.primary,
        secondary: unrelated.secondary,
        options: buildAlignmentOptions({ fineMax: 192, fftMax: 128, fftBackend: 'js' }),
      };
      const sync = computeAlignmentTransform(input);
      const coop = await computeAlignmentTransformCooperative(input, { sliceBudgetMs: 2, yieldToHost: microtaskYield });
      expect(strip(coop.result)).toEqual(strip(sync));
      expect(coop.stats.slices).toBeGreaterThan(1);
    },
    60_000
  );

  it('stops working once aborted between slices', async () => {
    const fixture = shifted[0]!;
    const controller = new AbortController();
    let slicesAfterAbort = 0;
    let yields = 0;
    const run = computeAlignmentTransformCooperative(
      { primary: fixture.primary, secondary: fixture.secondary, options: appOptions() },
      {
        sliceBudgetMs: 1,
        signal: controller.signal,
        yieldToHost: async () => {
          yields += 1;
          if (controller.signal.aborted) slicesAfterAbort += 1;
          if (yields === 5) controller.abort();
        },
      }
    );
    let stats: { slices: number } | null = null;
    await expect(
      run.catch((err) => {
        stats = null;
        throw err;
      })
    ).rejects.toBeInstanceOf(AlignmentAbortedError);
    // Abort is observed on the very next hand-back; no further slices run.
    expect(slicesAfterAbort).toBe(0);
    expect(yields).toBe(5);
    expect(stats).toBeNull();
  });

  it('reports stats and rejects with a timeout once the wall-clock cap is exceeded', async () => {
    const fixture = shifted[0]!;
    let reported: { slices: number; maxSliceMs: number } | null = null;
    await expect(
      computeAlignmentTransformCooperative(
        { primary: fixture.primary, secondary: fixture.secondary, options: appOptions() },
        {
          sliceBudgetMs: 2,
          timeoutMs: 30,
          yieldToHost: microtaskYield,
          onStats: (s) => {
            reported = s;
          },
        }
      )
    ).rejects.toBeInstanceOf(AlignmentTimeoutError);
    expect(reported).not.toBeNull();
    expect(reported!.slices).toBeGreaterThan(0);
    expect(reported!.maxSliceMs).toBeLessThan(50);
  });

  it('honours options.abortCheck at checkpoints (sync API unchanged)', () => {
    const fixture = shifted[0]!;
    let calls = 0;
    expect(() =>
      computeAlignmentTransform({
        primary: fixture.primary,
        secondary: fixture.secondary,
        options: buildAlignmentOptions({
          fineMax: 512,
          fftMax: 256,
          fftBackend: 'js',
          abortCheck: () => {
            calls += 1;
            if (calls > 50) throw new Error('Alignment timeout');
          },
        }),
      })
    ).toThrow('Alignment timeout');
  });
});
