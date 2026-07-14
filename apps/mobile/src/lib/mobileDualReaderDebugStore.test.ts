import { afterEach, describe, expect, test } from "bun:test";
import { getMobileDualReadDebugStore } from "./mobileDualReaderDebugStore";

function reset() {
  getMobileDualReadDebugStore().getState().clear();
  getMobileDualReadDebugStore().getState().setOverlayEnabled(false);
}

afterEach(() => reset());

describe("mobileDualReaderDebugStore", () => {
  test("starts with an empty snapshot and no events", () => {
    const { snapshot, events } = getMobileDualReadDebugStore().getState();
    expect(events).toEqual([]);
    expect(snapshot.visiblePageIndices).toEqual([]);
    expect(snapshot.alignmentQueueTotal).toBe(0);
    expect(snapshot.lastRenderPlanRunTs).toBeNull();
    expect(snapshot.sessionKey).toBeNull();
  });

  test("setOverlayEnabled flips the flag and stamps a ts", () => {
    const before = getMobileDualReadDebugStore().getState().snapshot.ts;
    getMobileDualReadDebugStore().getState().setOverlayEnabled(true);
    const { snapshot } = getMobileDualReadDebugStore().getState();
    expect(snapshot.overlayEnabled).toBe(true);
    expect(snapshot.ts).toBeGreaterThanOrEqual(before);
  });

  test("updateSnapshot merges fields and stamps a fresh ts", () => {
    const store = getMobileDualReadDebugStore();
    store.getState().updateSnapshot({
      sessionKey: "reg:src:manga",
      alignmentQueueTotal: 3,
      alignmentQueueStable: 2,
      lastAlignmentQueueTs: 1000,
    });
    const { snapshot } = store.getState();
    expect(snapshot.sessionKey).toBe("reg:src:manga");
    expect(snapshot.alignmentQueueTotal).toBe(3);
    expect(snapshot.alignmentQueueStable).toBe(2);
    expect(snapshot.lastAlignmentQueueTs).toBe(1000);
    // Untouched fields stay at their defaults.
    expect(snapshot.alignmentQueueBackfill).toBe(0);
  });

  test("pushEvent appends events and caps the log at 120", () => {
    const store = getMobileDualReadDebugStore();
    for (let index = 0; index < 130; index += 1) {
      store.getState().pushEvent("align", { i: index });
    }
    const events = store.getState().events;
    expect(events).toHaveLength(120);
    // The oldest 10 (i:0..9) were dropped; the log keeps i:10..129.
    expect(events[0]?.data?.i).toBe(10);
    expect(events[events.length - 1]?.data?.i).toBe(129);
  });

  test("setAlignmentQueuePreview truncates the run queue to 80 entries", () => {
    const store = getMobileDualReadDebugStore();
    const full = Array.from({ length: 100 }, (_, index) => index);
    store.getState().setAlignmentQueuePreview(full);
    const { snapshot } = store.getState();
    expect(snapshot.alignmentRunQueue).toHaveLength(80);
    expect(snapshot.alignmentRunQueue[0]).toBe(0);
    expect(snapshot.alignmentRunQueue[79]).toBe(79);
  });

  test("clear resets the snapshot and events", () => {
    const store = getMobileDualReadDebugStore();
    store.getState().updateSnapshot({ sessionKey: "x", alignmentQueueTotal: 5 });
    store.getState().pushEvent("evt");
    store.getState().clear();
    const { snapshot, events } = store.getState();
    expect(events).toEqual([]);
    expect(snapshot.sessionKey).toBeNull();
    expect(snapshot.alignmentQueueTotal).toBe(0);
  });

  test("the zustand-style selector reads the live snapshot via getState", () => {
    const store = getMobileDualReadDebugStore();
    store.getState().updateSnapshot({ dualReadEnabled: true });
    const selectDualRead = (s: ReturnType<typeof store.getState>) => s.snapshot.dualReadEnabled;
    expect(selectDualRead(store.getState())).toBe(true);
  });
});