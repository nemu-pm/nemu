import type { ChapterLike, ChapterMatchInput, ChapterMatchResult, ChapterPairSeed } from './types';
import { clampIndex } from './pages';

type ChapterIndex = {
  indexById: Map<string, number>;
};

function buildIndex(chapters: ChapterLike[]): ChapterIndex {
  const indexById = new Map<string, number>();
  chapters.forEach((c, i) => indexById.set(c.id, i));
  return { indexById };
}

function getChapterNumber(chapter: ChapterLike | null | undefined): number | null {
  if (!chapter) return null;
  const num = chapter.chapterNumber;
  return typeof num === 'number' && Number.isFinite(num) ? num : null;
}

function getTitleTokens(title: string | null | undefined): string[] {
  if (!title) return [];
  const normalized = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  if (!normalized) return [];
  return normalized.split(' ').filter(Boolean);
}

function titleSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const aTokens = getTitleTokens(a);
  const bTokens = getTitleTokens(b);
  if (aTokens.length === 0 || bTokens.length === 0) return 0;
  const bSet = new Set(bTokens);
  let common = 0;
  for (const token of aTokens) {
    if (bSet.has(token)) common += 1;
  }
  return common / Math.max(aTokens.length, bTokens.length);
}

function findClosestByNumber(chapters: ChapterLike[], target: number): ChapterLike | null {
  let best: ChapterLike | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const chapter of chapters) {
    const num = getChapterNumber(chapter);
    if (num == null) continue;
    const delta = Math.abs(num - target);
    if (delta < bestDelta) {
      best = chapter;
      bestDelta = delta;
    }
  }
  return best;
}

function mapWithSeedPair(input: ChapterMatchInput, seedPair: ChapterPairSeed): ChapterMatchResult {
  const primary = input.primaryChapter;
  if (!primary) return null;

  const { indexById: primaryIndexById } = buildIndex(input.primaryAll);
  const { indexById: secondaryIndexById } = buildIndex(input.secondaryAll);
  const primaryIndex = primaryIndexById.get(primary.id);
  const seedPrimaryIndex = primaryIndexById.get(seedPair.primaryId);
  const seedSecondaryIndex = secondaryIndexById.get(seedPair.secondaryId);
  if (primaryIndex == null || seedPrimaryIndex == null || seedSecondaryIndex == null) return null;

  const primaryNum = getChapterNumber(primary);
  const seedPrimaryNum = getChapterNumber(input.primaryAll[seedPrimaryIndex]);
  const seedSecondaryNum = getChapterNumber(input.secondaryAll[seedSecondaryIndex]);

  if (primaryNum != null && seedPrimaryNum != null && seedSecondaryNum != null) {
    const targetNum = seedSecondaryNum + (primaryNum - seedPrimaryNum);
    const match = findClosestByNumber(input.secondaryAll, targetNum);
    return match?.id ?? null;
  }

  const deltaIndex = primaryIndex - seedPrimaryIndex;
  const targetIndex = clampIndex(seedSecondaryIndex + deltaIndex, input.secondaryAll.length);
  return input.secondaryAll[targetIndex]?.id ?? null;
}

function mapWithoutSeedPair(input: ChapterMatchInput): ChapterMatchResult {
  const primary = input.primaryChapter;
  if (!primary) return null;
  if (input.secondaryAll.length === 0) return null;

  const primaryNum = getChapterNumber(primary);
  if (primaryNum != null) {
    const match = findClosestByNumber(input.secondaryAll, primaryNum);
    if (match) return match.id;
  }

  const { indexById: primaryIndexById } = buildIndex(input.primaryAll);
  const primaryIndex = primaryIndexById.get(primary.id) ?? 0;
  const primaryRatio =
    input.primaryAll.length > 1 ? primaryIndex / (input.primaryAll.length - 1) : 0;
  const expectedSecondaryIndex = Math.round(primaryRatio * Math.max(0, input.secondaryAll.length - 1));

  let bestId: string | null = null;
  let bestScore = -1;
  for (let i = 0; i < input.secondaryAll.length; i++) {
    const candidate = input.secondaryAll[i]!;
    const titleScore = titleSimilarity(primary.title, candidate.title);
    const indexScore =
      input.secondaryAll.length > 1
        ? 1 - Math.abs(i - expectedSecondaryIndex) / (input.secondaryAll.length - 1)
        : 1;
    const score = titleScore > 0 ? titleScore * 0.7 + indexScore * 0.3 : indexScore;
    if (score > bestScore) {
      bestScore = score;
      bestId = candidate.id;
    }
  }

  return bestId;
}

function getLatestChapterId(chapters: ChapterLike[]): string | null {
  if (chapters.length === 0) return null;
  let bestIndex = chapters.length - 1;
  let bestNumber: number | null = null;
  chapters.forEach((chapter, index) => {
    const num = getChapterNumber(chapter);
    if (num == null) return;
    if (bestNumber == null || num > bestNumber) {
      bestNumber = num;
      bestIndex = index;
    }
  });
  return chapters[bestIndex]?.id ?? null;
}

export function mapSecondaryChapterForPrimary(input: ChapterMatchInput): ChapterMatchResult {
  if (!input.primaryChapter) return null;
  if (input.secondaryAll.length === 0) return null;

  if (input.seedPair) {
    const withSeed = mapWithSeedPair(input, input.seedPair);
    if (withSeed) return withSeed;
  }

  return mapWithoutSeedPair(input);
}

export function pickSecondaryChapterId(input: ChapterMatchInput): ChapterMatchResult {
  if (input.secondaryAll.length === 0) return null;
  const suggested = mapSecondaryChapterForPrimary(input);
  if (suggested) return suggested;
  return getLatestChapterId(input.secondaryAll) ?? input.secondaryAll[0]?.id ?? null;
}

export function resolveSecondaryChapterSelection(
  input: ChapterMatchInput & { selectedId: string | null }
): ChapterMatchResult {
  if (input.selectedId && input.secondaryAll.some((chapter) => chapter.id === input.selectedId)) {
    return input.selectedId;
  }
  return pickSecondaryChapterId(input);
}

export function matchSecondaryChapter(input: {
  primaryChapter: ChapterLike | null | undefined;
  secondaryAll: ChapterLike[];
}): ChapterMatchResult {
  return mapSecondaryChapterForPrimary({
    primaryChapter: input.primaryChapter,
    primaryAll: input.primaryChapter ? [input.primaryChapter] : [],
    secondaryAll: input.secondaryAll,
  });
}

export function pairNextChapters(input: {
  primaryNext: ChapterLike | null | undefined;
  primaryAll: ChapterLike[];
  secondaryAll: ChapterLike[];
  seedPair: ChapterPairSeed;
}): ChapterMatchResult {
  return mapSecondaryChapterForPrimary({
    primaryChapter: input.primaryNext,
    primaryAll: input.primaryAll,
    secondaryAll: input.secondaryAll,
    seedPair: input.seedPair,
  });
}
