# Dual Read Alignment: Architecture and Algorithm

This document describes the alignment pipeline used by Dual Read, how it is scheduled, how it runs in the worker, and how results are applied in the reader. It is intended to be self-contained and implementation-aligned with the current codebase.

## Goals

- Align secondary pages to primary pages without user tuning.
- Keep alignment fast enough for on-device usage (mobile first).
- Be robust to margins, watermarks, resampling, and mild scan artifacts.
- Make alignment asynchronous so page matching is not blocked.

## High-Level Pipeline

1. **Page matching** (already in place): select a secondary render plan (`single`, `split`, `merge`, or `missing`) for a primary page.
2. **Alignment request**: queue alignment jobs based on loaded pages and distance from visible pages.
3. **Worker alignment**: compute per-page transform (scale + translation; crop is always zeroed).
4. **Render**: apply transform in the overlay path via CSS (`transform` only).

## Data Flow and Caching

- **Hash + sample cache (worker)**: image blobs are decoded to luma and downsampled; stored in `sampleCache` keyed by cacheId (worker-only).
- **Alignment cache (main thread)**: per-page alignment result stored in `secondaryAlignmentByChapter` (store).
- **Alignment queue**: maintained in `DualReadAutoAligner` with a concurrency limit; prioritizes pages closest to the visible index.

## Shared Defaults

Alignment defaults live in `src/lib/dual-reader/alignment-options.ts`:

- `DEFAULT_ALIGNMENT_OPTIONS` includes coarse/fine max sizes, FFT settings, and scoring defaults.
- `buildAlignmentOptions(overrides)` merges overrides and clamps `coarseMax` and `fftMax` to `fineMax`.

This helper is used by:
- Production overlay alignment
- Debug page alignment
- Tests and benchmarks
- Worker alignment

## Alignment Algorithm

### Inputs

- Primary luma image (downsampled, grayscale).
- Secondary luma image (downsampled, grayscale).
- Alignment options (shared defaults + overrides).

### Step 1: Content Insets (Masking Only)

We estimate margins by scanning gradient energy:

1. Compute gradient magnitude (`computeGradient`).
2. Compute per-row and per-column gradient scores.
3. Find the first/last row/column above threshold.
4. Clamp max insets to 25% and reject if content area is too small/large.

Insets are used to:
- Build masks for scoring and FFT (ignore borders/credits).

Note: alignment no longer outputs a crop. The final transform always returns zero insets.

### Step 2: Multi-Resolution Downsampling

We create three versions:

- **Coarse**: fast candidate scan (default max = 96).
- **Fine**: final alignment space (default max = 512).
- **Score**: optional intermediate resolution to speed scoring.

Downsampling uses a max-dimension rule to keep aspect ratio.

### Step 3: FFT Phase Correlation

We use FFT phase correlation to seed translation:

1. Downsample gradients to `fftMax` and pad to next power-of-two.
2. Build masked FFT input with a Hann window (reduces edge leakage).
3. Compute phase correlation and cross-power spectrum.
4. Extract translation peak(s) from the correlation surface.

#### Multi-Peak Seeds (Robustness)

We now take the top-N peaks (default N=5) with a minimum distance. Each seed is refined locally and the best score wins. This reduces “wrong basin” failures when the top peak is unstable.

#### Confidence Gating

We compute:
- **peakRatio** = peak / 2nd peak
- **PSR** (peak-to-sidelobe ratio) from correlation statistics

If confidence is low, we widen the local refinement window and allow multiple seeds.

### Step 4: Local Refinement (Score-Based)

Refinement uses gradient differences over sampled pixels:

- `scoreAlignment`: mean absolute difference between primary and secondary gradients.
- `refineTranslation`: local brute-force around the FFT seed.
- Optional rescore of top-K candidates at full `fineMax` resolution.

### Step 5: Final Transform

We output:

- `crop`: always zeroed (no crop applied by alignment).
- `scale`: uniform scale.
- `dx`, `dy`: normalized translation (relative to primary width/height).
- `confidence`: based on improvement vs identity and stability.

## Adaptive FFT Policy

`fftPolicy: 'adaptive'` selects `fftMax` based on image dimensions and a budget:

1. Compute candidate downsample sizes (step of 32).
2. Estimate padding overhead after `nextPow2`.
3. Score candidates by resolution vs padding/over-budget cost.
4. Choose the best candidate and record pad dimensions.

This reduces non-linear behavior across different `fftMax` values and stabilizes peak detection.

## Render Application (Overlay)

Alignment is applied in the overlay render path:

- Transform via `translate(dx, dy) scale(s)`.
- Overflow is constrained by the reader container, not by alignment crop.
- Translation is computed in render pixels from normalized `dx`, `dy`.

Primary layout is measured; overlay is reflowed on resize.

## Scheduling and Timeouts

Alignment is computed asynchronously:

- Queue is built from loaded pages within prefetch radius.
- Priority = distance to visible page.
- Concurrency limited (default 2).
- Each task has a 2s timeout and can be aborted.

If alignment arrives after render, overlay snaps into place.

## Debugging and Tests

Debug page (`/dual-read-debug`) uses the same alignment path and exposes:

- FFT policy, grid size, pad size
- Peak ratio / PSR / seed usage
- Full timing breakdown

Tests (`src/lib/dual-reader/visual-alignment.test.ts`) cover:

- Synthetic transforms (scale/translate with synthetic crops applied to source)
- Split/merge alignment
- Confidence fallback
- Abort behavior

## Key Files

- `src/lib/dual-reader/visual-alignment.ts`: core alignment algorithm.
- `src/lib/dual-reader/alignment-options.ts`: shared defaults and option builder.
- `src/lib/plugins/builtin/dual-reader/dhash.worker.ts`: worker alignment entrypoint.
- `src/lib/plugins/builtin/dual-reader/components.tsx`: production scheduling and overlay.
- `src/pages/dual-read-debug.tsx`: debug UI and instrumentation.
