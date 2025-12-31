import { create } from 'zustand';

export type DualReadDebugEvent = {
  ts: number;
  type: string;
  data?: Record<string, unknown>;
};

export type DualReadDebugSnapshot = {
  ts: number;
  sessionKey: string | null;
  overlayEnabled: boolean;
  dualReadEnabled: boolean;

  visiblePageIndices: number[];
  stableVisiblePageIndices: number[];

  // Render plan matching
  lastRenderPlanRunTs: number | null;
  lastRenderPlanSummary: string | null;

  // Alignment scheduling
  lastAlignmentQueueTs: number | null;
  alignmentQueueTotal: number;
  alignmentQueueStable: number;
  alignmentQueueBackfill: number;
  alignmentQueueAvailableSlots: number;
  alignmentPending: number;
  alignmentControllers: number;
  alignmentRunQueue: number[];
};

const MAX_EVENTS = 120;
const MAX_QUEUE_PREVIEW = 80;

function emptySnapshot(): DualReadDebugSnapshot {
  return {
    ts: Date.now(),
    sessionKey: null,
    overlayEnabled: false,
    dualReadEnabled: false,
    visiblePageIndices: [],
    stableVisiblePageIndices: [],
    lastRenderPlanRunTs: null,
    lastRenderPlanSummary: null,
    lastAlignmentQueueTs: null,
    alignmentQueueTotal: 0,
    alignmentQueueStable: 0,
    alignmentQueueBackfill: 0,
    alignmentQueueAvailableSlots: 0,
    alignmentPending: 0,
    alignmentControllers: 0,
    alignmentRunQueue: [],
  };
}

type DualReadDebugState = {
  snapshot: DualReadDebugSnapshot;
  events: DualReadDebugEvent[];
  setOverlayEnabled: (enabled: boolean) => void;
  clear: () => void;
  pushEvent: (type: string, data?: Record<string, unknown>) => void;
  updateSnapshot: (partial: Partial<DualReadDebugSnapshot>) => void;
  setAlignmentQueuePreview: (runQueue: number[]) => void;
};

export const useDualReadDebugStore = create<DualReadDebugState>((set) => ({
  snapshot: emptySnapshot(),
  events: [],
  setOverlayEnabled: (overlayEnabled) => {
    set((state) => ({ snapshot: { ...state.snapshot, overlayEnabled, ts: Date.now() } }));
  },
  clear: () => {
    set({ snapshot: emptySnapshot(), events: [] });
  },
  pushEvent: (type, data) => {
    const event: DualReadDebugEvent = { ts: Date.now(), type, data };
    set((state) => {
      const next = [...state.events, event];
      if (next.length > MAX_EVENTS) next.splice(0, next.length - MAX_EVENTS);
      return { events: next };
    });
  },
  updateSnapshot: (partial) => {
    set((state) => ({ snapshot: { ...state.snapshot, ...partial, ts: Date.now() } }));
  },
  setAlignmentQueuePreview: (runQueue) => {
    const preview = runQueue.slice(0, MAX_QUEUE_PREVIEW);
    set((state) => ({ snapshot: { ...state.snapshot, alignmentRunQueue: preview, ts: Date.now() } }));
  },
}));


