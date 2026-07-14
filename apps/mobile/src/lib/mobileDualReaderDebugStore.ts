/**
 * Mobile dual-reader debug store — captures a snapshot of the alignment
 * pipeline + a rolling event log for the on-screen debug HUD
 * (`MobileDualReaderDebugOverlay`). Native counterpart to web's
 * `useDualReadDebugStore` (`src/lib/plugins/builtin/dual-reader/debug-store.ts`).
 *
 * Pure external store (subscribe/getState/setState) consumed via
 * `useSyncExternalStore`, mirroring `mobileDualReaderStore`. No persistence —
 * debug data is ephemeral per session. Populated by the AutoAligner (T3.5); the
 * HUD reads it and is gated by the `debugOverlay` reader-plugin setting.
 */
import { useSyncExternalStore } from "react";
import { registerMobileSourceProfileTransitionHandler } from "@/sources/mobileSourceProfileScope";

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

type DualReadDebugData = {
  snapshot: DualReadDebugSnapshot;
  events: DualReadDebugEvent[];
};

type DualReadDebugActions = {
  setOverlayEnabled: (enabled: boolean) => void;
  clear: () => void;
  pushEvent: (type: string, data?: Record<string, unknown>) => void;
  updateSnapshot: (partial: Partial<DualReadDebugSnapshot>) => void;
  setAlignmentQueuePreview: (runQueue: number[]) => void;
};

export type DualReadDebugState = DualReadDebugData & DualReadDebugActions;

type Listener = () => void;

function createDualReadDebugStore() {
  let data: DualReadDebugData = { snapshot: emptySnapshot(), events: [] };
  const listeners = new Set<Listener>();

  let snapshot: DualReadDebugState;

  const set = (partial: Partial<DualReadDebugData>) => {
    data = { ...data, ...partial };
    snapshot = { ...data, ...actions } as DualReadDebugState;
    listeners.forEach((l) => l());
  };

  const actions: DualReadDebugActions = {
    setOverlayEnabled: (overlayEnabled) => {
      set({ snapshot: { ...data.snapshot, overlayEnabled, ts: Date.now() } });
    },
    clear: () => {
      set({ snapshot: emptySnapshot(), events: [] });
    },
    pushEvent: (type, eventData) => {
      const event: DualReadDebugEvent = { ts: Date.now(), type, data: eventData };
      const next = [...data.events, event];
      if (next.length > MAX_EVENTS) next.splice(0, next.length - MAX_EVENTS);
      set({ events: next });
    },
    updateSnapshot: (partial) => {
      set({ snapshot: { ...data.snapshot, ...partial, ts: Date.now() } });
    },
    setAlignmentQueuePreview: (runQueue) => {
      const preview = runQueue.slice(0, MAX_QUEUE_PREVIEW);
      set({ snapshot: { ...data.snapshot, alignmentRunQueue: preview, ts: Date.now() } });
    },
  };

  const getState = (): DualReadDebugState => snapshot;
  snapshot = { ...data, ...actions } as DualReadDebugState;

  return {
    getState,
    subscribe(listener: Listener): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const mobileDualReadDebugStore = createDualReadDebugStore();

registerMobileSourceProfileTransitionHandler(
  "dual-reader-debug-store",
  () => mobileDualReadDebugStore.getState().clear(),
);

export type MobileDualReadDebugStore = ReturnType<typeof createDualReadDebugStore>;

export function getMobileDualReadDebugStore(): MobileDualReadDebugStore {
  return mobileDualReadDebugStore;
}

/**
 * Subscribe to the debug store with a selector (zustand-style). Select
 * primitives or stable references (`s => s.snapshot`, `s => s.events`) — the
 * snapshot/events arrays are replaced on every update, so this re-renders on
 * each change (acceptable for a debug HUD). `getMobileDualReadDebugStore()` is
 * available for non-component code.
 */
export function useMobileDualReaderDebugStore<U>(
  selector: (state: DualReadDebugState) => U,
): U {
  return useSyncExternalStore(
    mobileDualReadDebugStore.subscribe,
    () => selector(mobileDualReadDebugStore.getState()),
    () => selector(mobileDualReadDebugStore.getState()),
  );
}
