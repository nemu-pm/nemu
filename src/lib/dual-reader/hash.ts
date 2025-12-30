import { resizeLuma, toLuma } from './image';

export type Dhash = { h: bigint; v: bigint };
export type MultiDhash = {
  full: Dhash;
  left?: Dhash;
  right?: Dhash;
  top?: Dhash;
  bottom?: Dhash;
  center?: Dhash;
  trimmed?: Dhash;
};

export type DhashInput = {
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
  channels?: number;
};

export type VariantKind = 'full' | 'left' | 'right' | 'top' | 'bottom' | 'center' | 'trimmed';

export type CandidateMatch = {
  distance: number;
  fullDistance: number;
  variantDistance: number;
  bestVariant: VariantKind | null;
};

export type CandidateDistance = {
  distance: number;
  fullDistance: number;
  variantDistance: number;
};

function popcount64(x: bigint): number {
  let count = 0;
  let v = x;
  while (v !== 0n) {
    v &= v - 1n;
    count += 1;
  }
  return count;
}

export function hammingDistance(a: bigint, b: bigint): number {
  return popcount64(a ^ b);
}

export function dhashDistance(a: Dhash, b: Dhash): number {
  return hammingDistance(a.h, b.h) + hammingDistance(a.v, b.v);
}

function computeDhashFromLuma(luma: Uint8Array, width: number, height: number): Dhash {
  const w = Math.max(1, Math.trunc(width));
  const h = Math.max(1, Math.trunc(height));
  const hBuf = resizeLuma(luma, w, h, 9, 8);
  let hVal = 0n;
  let bit = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const a = hBuf[y * 9 + x] ?? 0;
      const b = hBuf[y * 9 + x + 1] ?? 0;
      if (a > b) hVal |= 1n << bit;
      bit += 1n;
    }
  }

  const vBuf = resizeLuma(luma, w, h, 8, 9);
  let vVal = 0n;
  bit = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const a = vBuf[y * 8 + x] ?? 0;
      const b = vBuf[(y + 1) * 8 + x] ?? 0;
      if (a > b) vVal |= 1n << bit;
      bit += 1n;
    }
  }

  return { h: hVal, v: vVal };
}

export function computeDhash(input: DhashInput): Dhash {
  const width = Math.max(1, Math.trunc(input.width));
  const height = Math.max(1, Math.trunc(input.height));
  const luma = toLuma({ ...input, width, height });
  return computeDhashFromLuma(luma, width, height);
}

function sliceLuma(
  luma: Uint8Array,
  width: number,
  height: number,
  rect: { left: number; top: number; width: number; height: number }
): Uint8Array {
  const out = new Uint8Array(rect.width * rect.height);
  for (let y = 0; y < rect.height; y++) {
    const srcY = rect.top + y;
    if (srcY < 0 || srcY >= height) continue;
    const srcRow = srcY * width;
    const dstRow = y * rect.width;
    for (let x = 0; x < rect.width; x++) {
      const srcX = rect.left + x;
      if (srcX < 0 || srcX >= width) continue;
      out[dstRow + x] = luma[srcRow + srcX] ?? 0;
    }
  }
  return out;
}

function findContentRectFromLuma(
  luma: Uint8Array,
  width: number,
  height: number,
  opts?: { threshold?: number; minFillRatio?: number; minAreaRatio?: number; maxInsetRatio?: number }
): { left: number; top: number; width: number; height: number } | null {
  const threshold = opts?.threshold ?? 8;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let count = 0;
  const total = width * height;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if ((luma[row + x] ?? 0) > threshold) {
        count += 1;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (count === 0) return null;
  const fillRatio = count / total;
  if (fillRatio < (opts?.minFillRatio ?? 0.08)) return null;
  if (maxX < minX || maxY < minY) return null;
  const boxW = maxX - minX + 1;
  const boxH = maxY - minY + 1;
  const areaRatio = (boxW * boxH) / total;
  if (areaRatio < (opts?.minAreaRatio ?? 0.4)) return null;
  const maxInsetRatio = opts?.maxInsetRatio ?? 0.92;
  if (boxW / width >= maxInsetRatio && boxH / height >= maxInsetRatio) return null;
  return { left: minX, top: minY, width: boxW, height: boxH };
}

export function computeMultiDhash(
  input: DhashInput,
  opts?: { split?: boolean; centerCropRatio?: number; luma?: Uint8Array }
): MultiDhash {
  const width = Math.max(1, Math.trunc(input.width));
  const height = Math.max(1, Math.trunc(input.height));
  const luma = opts?.luma ?? toLuma({ ...input, width, height });
  const full = computeDhashFromLuma(luma, width, height);
  if (!opts?.split) return { full };

  const trimRect = findContentRectFromLuma(luma, width, height);
  const baseRect = trimRect ?? { left: 0, top: 0, width, height };
  const midX = Math.max(1, Math.floor(baseRect.width / 2));
  const midY = Math.max(1, Math.floor(baseRect.height / 2));

  const leftLuma = sliceLuma(luma, width, height, {
    left: baseRect.left,
    top: baseRect.top,
    width: midX,
    height: baseRect.height,
  });
  const rightLuma = sliceLuma(luma, width, height, {
    left: baseRect.left + midX,
    top: baseRect.top,
    width: baseRect.width - midX,
    height: baseRect.height,
  });
  const topLuma = sliceLuma(luma, width, height, {
    left: baseRect.left,
    top: baseRect.top,
    width: baseRect.width,
    height: midY,
  });
  const bottomLuma = sliceLuma(luma, width, height, {
    left: baseRect.left,
    top: baseRect.top + midY,
    width: baseRect.width,
    height: baseRect.height - midY,
  });

  const left = computeDhashFromLuma(leftLuma, midX, baseRect.height);
  const right = computeDhashFromLuma(rightLuma, baseRect.width - midX, baseRect.height);
  const top = computeDhashFromLuma(topLuma, baseRect.width, midY);
  const bottom = computeDhashFromLuma(bottomLuma, baseRect.width, baseRect.height - midY);
  let center: Dhash | undefined;
  if (typeof opts.centerCropRatio === 'number') {
    const ratio = Math.max(0.1, Math.min(1, opts.centerCropRatio));
    const cropW = Math.max(1, Math.floor(baseRect.width * ratio));
    const cropH = Math.max(1, Math.floor(baseRect.height * ratio));
    const cropLeft = Math.max(0, Math.floor(baseRect.left + (baseRect.width - cropW) / 2));
    const cropTop = Math.max(0, Math.floor(baseRect.top + (baseRect.height - cropH) / 2));
    const centerLuma = sliceLuma(luma, width, height, { left: cropLeft, top: cropTop, width: cropW, height: cropH });
    center = computeDhashFromLuma(centerLuma, cropW, cropH);
  }

  const trimmed = trimRect
    ? computeDhashFromLuma(sliceLuma(luma, width, height, trimRect), trimRect.width, trimRect.height)
    : undefined;

  return { full, left, right, top, bottom, center, trimmed };
}

export function computeCandidateDistance(
  primaryHash: Dhash,
  candidate: MultiDhash,
  opts?: { variantPenalty?: number; fullThreshold?: number }
): CandidateDistance {
  const match = computeCandidateMatch(primaryHash, candidate, opts);
  return { distance: match.distance, fullDistance: match.fullDistance, variantDistance: match.variantDistance };
}

export function computeCandidateMatch(
  primaryHash: Dhash,
  candidate: MultiDhash,
  opts?: { variantPenalty?: number; fullThreshold?: number }
): CandidateMatch {
  const fullDistance = dhashDistance(primaryHash, candidate.full);
  const variantEntries: Array<{ kind: VariantKind; hash: Dhash }> = [];
  if (candidate.left) variantEntries.push({ kind: 'left', hash: candidate.left });
  if (candidate.right) variantEntries.push({ kind: 'right', hash: candidate.right });
  if (candidate.top) variantEntries.push({ kind: 'top', hash: candidate.top });
  if (candidate.bottom) variantEntries.push({ kind: 'bottom', hash: candidate.bottom });
  if (candidate.center) variantEntries.push({ kind: 'center', hash: candidate.center });
  if (candidate.trimmed) variantEntries.push({ kind: 'trimmed', hash: candidate.trimmed });

  let variantDistance = Number.POSITIVE_INFINITY;
  let bestVariant: VariantKind | null = null;
  for (const entry of variantEntries) {
    const dist = dhashDistance(primaryHash, entry.hash);
    if (dist < variantDistance) {
      variantDistance = dist;
      bestVariant = entry.kind;
    }
  }

  const variantPenalty = opts?.variantPenalty ?? 20;
  const fullThreshold = opts?.fullThreshold ?? 20;
  let distance = fullDistance;
  if (variantDistance < Number.POSITIVE_INFINITY && fullDistance > fullThreshold) {
    distance = Math.min(fullDistance, variantDistance + variantPenalty);
  }

  return { distance, fullDistance, variantDistance, bestVariant };
}

export type SecondaryMatch =
  | {
      kind: 'single';
      index: number;
      bestIndex: number;
      distance: number;
      score: number;
      fullDistance: number;
      variantDistance: number;
      bestVariant: VariantKind | null;
    }
  | {
      kind: 'split';
      index: number;
      side: 'left' | 'right';
      bestIndex: number;
      distance: number;
      score: number;
      fullDistance: number;
    }
  | {
      kind: 'merge';
      indexA: number;
      indexB: number;
      order: 'normal' | 'swap';
      bestIndex: number;
      distance: number;
      score: number;
    };

export type SecondaryMatchResult = {
  best: SecondaryMatch;
  secondBest: SecondaryMatch | null;
};

export function findBestSecondaryMatch(input: {
  primaryHash: MultiDhash;
  secondaryHashes: Array<MultiDhash | null | undefined>;
  expectedIndex: number;
  windowSize: number;
  deviationBias?: number;
  variantPenalty?: number;
  fullThreshold?: number;
  splitMargin?: number;
  splitPenalty?: number;
  mergePenalty?: number;
  primarySpreadThreshold?: number;
  secondarySpreadThreshold?: number;
}): SecondaryMatchResult | null {
  const { primaryHash, secondaryHashes, expectedIndex, windowSize } = input;
  if (secondaryHashes.length === 0 || !Number.isFinite(expectedIndex)) return null;

  const start = Math.max(0, Math.trunc(expectedIndex) - windowSize);
  const end = Math.min(secondaryHashes.length - 1, Math.trunc(expectedIndex) + windowSize);
  const deviationBias = input.deviationBias ?? 0;
  const splitMargin = input.splitMargin ?? 8;
  const splitPenalty = input.splitPenalty ?? 4;
  const mergePenalty = input.mergePenalty ?? 6;
  const primarySpreadThreshold = input.primarySpreadThreshold ?? 24;
  const secondarySpreadThreshold = input.secondarySpreadThreshold ?? 24;

  let best: SecondaryMatch | null = null;
  let secondBest: SecondaryMatch | null = null;

  const consider = (candidate: SecondaryMatch) => {
    if (!best || candidate.score < best.score) {
      secondBest = best;
      best = candidate;
      return;
    }
    if (!secondBest || candidate.score < secondBest.score) {
      secondBest = candidate;
    }
  };

  for (let i = start; i <= end; i++) {
    const candidate = secondaryHashes[i];
    if (!candidate) continue;
    const match = computeCandidateMatch(primaryHash.full, candidate, {
      variantPenalty: input.variantPenalty,
      fullThreshold: input.fullThreshold,
    });
    const deviation = Math.abs(i - expectedIndex);
    const singleScore = match.distance + deviationBias * deviation;
    consider({
      kind: 'single',
      index: i,
      bestIndex: i,
      distance: match.distance,
      score: singleScore,
      fullDistance: match.fullDistance,
      variantDistance: match.variantDistance,
      bestVariant: match.bestVariant,
    });

    if ((match.bestVariant === 'left' || match.bestVariant === 'right') && candidate.left && candidate.right) {
      const spreadScore = dhashDistance(candidate.left, candidate.right);
      if (spreadScore >= secondarySpreadThreshold && match.fullDistance - match.variantDistance >= splitMargin) {
        const splitDistance = match.variantDistance;
        const splitScore = splitDistance + splitPenalty + deviationBias * deviation;
        consider({
          kind: 'split',
          index: i,
          side: match.bestVariant,
          bestIndex: i,
          distance: splitDistance,
          score: splitScore,
          fullDistance: match.fullDistance,
        });
      }
    }
  }

  if (primaryHash.left && primaryHash.right) {
    const primarySpreadScore = dhashDistance(primaryHash.left, primaryHash.right);
    if (primarySpreadScore >= primarySpreadThreshold) {
      for (let i = start; i < end; i++) {
        const a = secondaryHashes[i];
        const b = secondaryHashes[i + 1];
        if (!a || !b) continue;
        const distNormal =
          dhashDistance(primaryHash.left, a.full) + dhashDistance(primaryHash.right, b.full);
        const distSwap =
          dhashDistance(primaryHash.left, b.full) + dhashDistance(primaryHash.right, a.full);
        const order: 'normal' | 'swap' = distSwap < distNormal ? 'swap' : 'normal';
        const pairDistance = (Math.min(distNormal, distSwap)) / 2;
        const deviation = Math.min(Math.abs(i - expectedIndex), Math.abs(i + 1 - expectedIndex));
        const score = pairDistance + mergePenalty + deviationBias * deviation;
        const bestIndex =
          Math.abs(i - expectedIndex) <= Math.abs(i + 1 - expectedIndex) ? i : i + 1;
        consider({
          kind: 'merge',
          indexA: i,
          indexB: i + 1,
          order,
          bestIndex,
          distance: pairDistance,
          score,
        });
      }
    }
  }

  // `best.distance` is always finite when a candidate exists (computed from dhash distances).
  // Avoid over-checking here to keep types simple and prevent TS narrowing issues.
  if (!best) return null;
  return { best, secondBest };
}

export function findBestSecondaryIndex(input: {
  primaryHash: Dhash;
  secondaryHashes: Array<MultiDhash | null | undefined>;
  expectedIndex: number;
  windowSize: number;
  threshold?: number;
  softThreshold?: number;
  deviationBias?: number;
  minDistanceGap?: number;
  variantPenalty?: number;
  fullThreshold?: number;
}): { bestIndex: number; bestDistance: number; secondBestDistance: number; bestScore: number; secondBestScore: number } | null {
  const { primaryHash, secondaryHashes, expectedIndex, windowSize } = input;
  if (secondaryHashes.length === 0 || !Number.isFinite(expectedIndex)) return null;

  const start = Math.max(0, Math.trunc(expectedIndex) - windowSize);
  const end = Math.min(secondaryHashes.length - 1, Math.trunc(expectedIndex) + windowSize);
  const deviationBias = input.deviationBias ?? 0;

  let bestIndex = start;
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestScore = Number.POSITIVE_INFINITY;
  let secondBestDistance = Number.POSITIVE_INFINITY;
  let secondBestScore = Number.POSITIVE_INFINITY;

  for (let i = start; i <= end; i++) {
    const candidate = secondaryHashes[i];
    if (!candidate) continue;
    const { distance: dist } = computeCandidateDistance(primaryHash, candidate, {
      variantPenalty: input.variantPenalty,
      fullThreshold: input.fullThreshold,
    });
    const score = dist + deviationBias * Math.abs(i - expectedIndex);
    if (score < bestScore) {
      secondBestScore = bestScore;
      secondBestDistance = bestDistance;
      bestScore = score;
      bestDistance = dist;
      bestIndex = i;
    } else if (score < secondBestScore) {
      secondBestScore = score;
      secondBestDistance = dist;
    }
  }

  if (!Number.isFinite(bestDistance)) return null;

  const threshold = input.threshold;
  const softThreshold = input.softThreshold ?? threshold;
  const minDistanceGap = input.minDistanceGap ?? 6;

  let accept = true;
  if (typeof threshold === 'number' && bestDistance > threshold) {
    accept = false;
  }
  if (!accept && typeof softThreshold === 'number' && bestDistance <= softThreshold) {
    if (secondBestDistance - bestDistance >= minDistanceGap) {
      accept = true;
    }
  }

  if (!accept) return null;
  return { bestIndex, bestDistance, secondBestDistance, bestScore, secondBestScore };
}

export function updateDriftDelta(input: {
  expectedIndex: number;
  bestIndex: number | null;
  prevDriftDelta: number;
}): number {
  if (input.bestIndex == null || !Number.isFinite(input.bestIndex)) return input.prevDriftDelta;
  if (!Number.isFinite(input.expectedIndex)) return input.prevDriftDelta;
  return input.bestIndex - input.expectedIndex + input.prevDriftDelta;
}
