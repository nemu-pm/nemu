export type ChapterLike = {
  id: string;
  title?: string | null;
  chapterNumber?: number | null;
  volumeNumber?: number | null;
  lang?: string | null;
};

export type ChapterPairSeed = {
  primaryId: string;
  secondaryId: string;
};

export type ChapterMatchInput = {
  primaryChapter: ChapterLike | null | undefined;
  primaryAll: ChapterLike[];
  secondaryAll: ChapterLike[];
  seedPair?: ChapterPairSeed | null;
};

export type ChapterMatchResult = string | null;

export type PageMapInput = {
  primaryIndex: number;
  driftDelta?: number | null;
};

export type SecondaryRenderPlan =
  | {
      kind: 'single';
      secondaryChapterId: string;
      secondaryIndex: number;
      driftDelta: number;
    }
  | {
      kind: 'split';
      secondaryChapterId: string;
      secondaryIndex: number;
      side: 'left' | 'right';
      driftDelta: number;
    }
  | {
      kind: 'merge';
      secondaryChapterId: string;
      secondaryIndices: [number, number];
      order: 'normal' | 'swap';
      driftDelta: number;
    }
  | {
      kind: 'missing';
      secondaryChapterId: string;
      driftDelta: number;
    };
