import { create } from 'zustand';
import type { Chapter, Page } from '@/lib/sources/types';
import type { LocalSourceLink } from '@/data/schema';
import type { ChapterPairSeed, SecondaryRenderPlan } from '@/lib/dual-reader/types';
import { createPluginStorage } from '../../types';

const storage = createPluginStorage('dual-reader');

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
  configOpen: boolean;

  secondarySource: LocalSourceLink | null;
  seedPair: ChapterPairSeed | null;
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
  setConfigOpen: (open: boolean) => void;

  setSeedPair: (seedPair: ChapterPairSeed) => void;
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

type DualReadPersistedConfig = {
  enabled: boolean;
  secondarySource: LocalSourceLink | null;
  seedPair: ChapterPairSeed | null;
  activeSide: DualReadSide;
  fabPosition: DualReadFabPosition | null;
};

function makeConfigKey(sessionKey: string): string {
  return `config:${sessionKey}`;
}

function isValidSourceLink(value: unknown): value is LocalSourceLink {
  if (!value || typeof value !== 'object') return false;
  const link = value as Record<string, unknown>;
  return (
    typeof link.registryId === 'string' &&
    typeof link.sourceId === 'string' &&
    typeof link.sourceMangaId === 'string' &&
    typeof link.id === 'string'
  );
}

function isValidSeedPair(value: unknown): value is ChapterPairSeed {
  if (!value || typeof value !== 'object') return false;
  const pair = value as Record<string, unknown>;
  return typeof pair.primaryId === 'string' && typeof pair.secondaryId === 'string';
}

function isValidFabPosition(value: unknown): value is DualReadFabPosition {
  if (!value || typeof value !== 'object') return false;
  const pos = value as Record<string, unknown>;
  return (
    typeof pos.x === 'number' &&
    typeof pos.y === 'number' &&
    (pos.side === 'left' || pos.side === 'right')
  );
}

function loadPersistedConfig(sessionKey: string): DualReadPersistedConfig | null {
  const raw = storage.get<Record<string, unknown>>(makeConfigKey(sessionKey));
  if (!raw || typeof raw !== 'object') return null;
  const enabled = typeof raw.enabled === 'boolean' ? raw.enabled : false;
  const secondarySource = isValidSourceLink(raw.secondarySource) ? raw.secondarySource : null;
  const seedPair = isValidSeedPair(raw.seedPair) ? raw.seedPair : null;
  const activeSide = raw.activeSide === 'secondary' ? 'secondary' : 'primary';
  const fabPosition = isValidFabPosition(raw.fabPosition) ? raw.fabPosition : null;
  return { enabled, secondarySource, seedPair, activeSide, fabPosition };
}

function persistConfig(state: DualReadState): void {
  if (!state.sessionKey) return;
  const payload: DualReadPersistedConfig = {
    enabled: state.enabled,
    secondarySource: state.secondarySource,
    seedPair: state.seedPair,
    activeSide: state.activeSide,
    fabPosition: state.fabPosition,
  };
  storage.set(makeConfigKey(state.sessionKey), payload);
}

function revokeMapUrls(map: Map<string, string>) {
  map.forEach((url) => URL.revokeObjectURL(url));
}

function getInitialState() {
  return {
    enabled: false,
    activeSide: 'primary' as DualReadSide,
    peekActive: false,
    popoverOpen: false,
    configOpen: false,
    secondarySource: null,
    seedPair: null,
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
    const persisted = loadPersistedConfig(sessionKey);
    const hasPersistedConfig = Boolean(persisted?.secondarySource && persisted?.seedPair);
    set({
      sessionKey,
      ...getInitialState(),
      ...(persisted ?? {}),
      enabled: persisted?.enabled && hasPersistedConfig ? true : false,
    });
  },

  cleanupRuntime: () => {
    const prev = get();
    revokeMapUrls(prev.secondaryImageUrls);
    set(() => ({
      // Keep config + sessionKey, but close transient UI and clear caches.
      peekActive: false,
      popoverOpen: false,
      configOpen: false,
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

  enable: ({ secondarySource, seedPair, primaryChapters, secondaryChapters }) => {
    set((state) => ({
      enabled: true,
      activeSide: state.activeSide ?? 'primary',
      secondarySource,
      seedPair,
      primaryChapters,
      secondaryChapters,
      driftDeltaByChapter: {},
      secondaryRenderPlansByChapter: {},
    }));
    persistConfig(get());
  },

  disable: () => {
    const { secondaryImageUrls } = get();
    revokeMapUrls(secondaryImageUrls);
    set({
      enabled: false,
      peekActive: false,
      popoverOpen: false,
      configOpen: false,
      primaryChapters: [],
      secondaryChapters: [],
      driftDeltaByChapter: {},
      secondaryPagesByChapter: {},
      secondaryImageUrls: new Map(),
      loadingSecondaryKeys: new Set(),
      secondaryRenderPlansByChapter: {},
    });
    persistConfig(get());
  },

  setActiveSide: (side) => {
    set({ activeSide: side });
    persistConfig(get());
  },
  setPeekActive: (peek) => set({ peekActive: peek }),
  setPopoverOpen: (open) => set({ popoverOpen: open }),
  setConfigOpen: (open) => set({ configOpen: open }),

  setSeedPair: (seedPair) => {
    set({ seedPair, secondaryRenderPlansByChapter: {}, driftDeltaByChapter: {} });
    persistConfig(get());
  },
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

  setFabPosition: (pos) => {
    set({ fabPosition: pos });
    persistConfig(get());
  },
}));
