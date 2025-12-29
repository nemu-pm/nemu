import { create } from 'zustand';
import type { Chapter, Page } from '@/lib/sources/types';
import type { LocalSourceLink } from '@/data/schema';
import type { ChapterPairSeed, SecondaryRenderPlan } from '@/lib/dual-reader/types';

export type DualReadSide = 'primary' | 'secondary';

export type DualReadFabPosition = {
  x: number;
  y: number;
  side: 'left' | 'right';
};

type DualReadState = {
  sessionKey: string | null;
  enabled: boolean;
  activeSide: DualReadSide;
  peekActive: boolean;
  popoverOpen: boolean;
  nudgeOpen: boolean;

  secondarySource: LocalSourceLink | null;
  seedPair: ChapterPairSeed | null;
  pageOffset: number;
  driftDeltaByChapter: Record<string, number>;

  primaryChapters: Chapter[];
  secondaryChapters: Chapter[];

  secondaryPagesByChapter: Record<string, Page[]>;
  secondaryImageUrls: Map<string, string>;
  loadingSecondaryKeys: Set<string>;
  secondaryRenderPlansByChapter: Record<string, Record<number, SecondaryRenderPlan>>;

  fabPosition: DualReadFabPosition | null;

  /** Called by plugin lifecycle when entering a reader session (idempotent). */
  startSession: (sessionKey: string) => void;
  /** Called by plugin lifecycle on reader unmount to clear heavy caches but keep user config. */
  cleanupRuntime: () => void;

  setSessionKey: (sessionKey: string) => void;
  resetSession: () => void;

  enable: (input: {
    secondarySource: LocalSourceLink;
    seedPair: ChapterPairSeed;
    primaryChapters: Chapter[];
    secondaryChapters: Chapter[];
  }) => void;
  disable: () => void;

  setActiveSide: (side: DualReadSide) => void;
  setPeekActive: (peek: boolean) => void;
  setPopoverOpen: (open: boolean) => void;
  setNudgeOpen: (open: boolean) => void;

  setSeedPair: (seedPair: ChapterPairSeed) => void;
  setPageOffset: (offset: number) => void;
  setDriftDelta: (chapterId: string, delta: number) => void;

  setPrimaryChapters: (chapters: Chapter[]) => void;
  setSecondaryChapters: (chapters: Chapter[]) => void;
  setSecondaryPages: (chapterId: string, pages: Page[]) => void;
  setSecondaryImageUrl: (key: string, url: string) => void;
  clearSecondaryCache: () => void;
  setSecondaryRenderPlan: (chapterId: string, primaryIndex: number, plan: SecondaryRenderPlan) => void;
  clearSecondaryRenderPlans: (chapterId?: string) => void;

  setFabPosition: (pos: DualReadFabPosition | null) => void;
};

function revokeMapUrls(map: Map<string, string>) {
  map.forEach((url) => URL.revokeObjectURL(url));
}

function getInitialState() {
  return {
    enabled: false,
    activeSide: 'primary' as DualReadSide,
    peekActive: false,
    popoverOpen: false,
    nudgeOpen: false,
    secondarySource: null,
    seedPair: null,
    pageOffset: 0,
    driftDeltaByChapter: {},
    primaryChapters: [],
    secondaryChapters: [],
    secondaryPagesByChapter: {},
    secondaryImageUrls: new Map<string, string>(),
    loadingSecondaryKeys: new Set<string>(),
    secondaryRenderPlansByChapter: {},
    fabPosition: null,
  };
}

export const useDualReadStore = create<DualReadState>((set, get) => ({
  sessionKey: null,
  ...getInitialState(),

  startSession: (sessionKey) => {
    const prev = get();
    if (prev.sessionKey === sessionKey) {
      // StrictMode / re-mounts: don't wipe state.
      return;
    }
    // New manga/session: clear heavy runtime caches and reset pairing state.
    revokeMapUrls(prev.secondaryImageUrls);
    set({
      sessionKey,
      ...getInitialState(),
      // Preserve the user's FAB position across sessions.
      fabPosition: prev.fabPosition,
    });
  },

  cleanupRuntime: () => {
    const prev = get();
    revokeMapUrls(prev.secondaryImageUrls);
    set(() => ({
      // Keep config + sessionKey, but close transient UI and clear caches.
      peekActive: false,
      popoverOpen: false,
      nudgeOpen: false,
      primaryChapters: [],
      secondaryChapters: [],
      driftDeltaByChapter: {},
      secondaryPagesByChapter: {},
      secondaryImageUrls: new Map(),
      loadingSecondaryKeys: new Set(),
      secondaryRenderPlansByChapter: {},
    }));
  },

  setSessionKey: (sessionKey) => set({ sessionKey }),

  resetSession: () => {
    const { secondaryImageUrls } = get();
    revokeMapUrls(secondaryImageUrls);
    set({
      sessionKey: null,
      ...getInitialState(),
    });
  },

  enable: ({ secondarySource, seedPair, primaryChapters, secondaryChapters }) =>
    set((state) => ({
      enabled: true,
      activeSide: state.activeSide ?? 'primary',
      secondarySource,
      seedPair,
      primaryChapters,
      secondaryChapters,
    })),

  disable: () => {
    const { secondaryImageUrls } = get();
    revokeMapUrls(secondaryImageUrls);
    set({
      sessionKey: null,
      ...getInitialState(),
    });
  },

  setActiveSide: (side) => set({ activeSide: side }),
  setPeekActive: (peek) => set({ peekActive: peek }),
  setPopoverOpen: (open) => set({ popoverOpen: open }),
  setNudgeOpen: (open) => set({ nudgeOpen: open }),

  setSeedPair: (seedPair) => set({ seedPair, secondaryRenderPlansByChapter: {} }),
  setPageOffset: (offset) => set({ pageOffset: offset, secondaryRenderPlansByChapter: {} }),
  setDriftDelta: (chapterId, delta) =>
    set((state) => ({
      driftDeltaByChapter: { ...state.driftDeltaByChapter, [chapterId]: delta },
    })),

  setPrimaryChapters: (chapters) => set({ primaryChapters: chapters }),
  setSecondaryChapters: (chapters) => set({ secondaryChapters: chapters }),
  setSecondaryPages: (chapterId, pages) =>
    set((state) => ({
      secondaryPagesByChapter: { ...state.secondaryPagesByChapter, [chapterId]: pages },
    })),

  setSecondaryImageUrl: (key, url) =>
    set((state) => {
      const next = new Map(state.secondaryImageUrls);
      next.set(key, url);
      return { secondaryImageUrls: next };
    }),

  clearSecondaryCache: () => {
    const { secondaryImageUrls } = get();
    revokeMapUrls(secondaryImageUrls);
    set({
      secondaryPagesByChapter: {},
      secondaryImageUrls: new Map(),
      loadingSecondaryKeys: new Set(),
      secondaryRenderPlansByChapter: {},
    });
  },

  setSecondaryRenderPlan: (chapterId, primaryIndex, plan) =>
    set((state) => ({
      secondaryRenderPlansByChapter: {
        ...state.secondaryRenderPlansByChapter,
        [chapterId]: {
          ...(state.secondaryRenderPlansByChapter[chapterId] ?? {}),
          [primaryIndex]: plan,
        },
      },
    })),

  clearSecondaryRenderPlans: (chapterId) =>
    set((state) => {
      if (!chapterId) {
        return { secondaryRenderPlansByChapter: {} };
      }
      const next = { ...state.secondaryRenderPlansByChapter };
      if (next[chapterId]) {
        next[chapterId] = {};
      }
      return { secondaryRenderPlansByChapter: next };
    }),

  setFabPosition: (pos) => set({ fabPosition: pos }),
}));
