import { describe, it, expect, beforeEach } from "bun:test";
import {
  HLC,
  generateNodeId,
  createHLCState,
  formatIntentClock,
  parseIntentClock,
  compareIntentClocks,
  isClockNewer,
  maxClock,
  mergeFieldWithClock,
  mergeLibraryMembership,
  ZERO_CLOCK,
} from "./hlc";

describe("HLC", () => {
  describe("generateNodeId", () => {
    it("generates unique node IDs", () => {
      const id1 = generateNodeId();
      const id2 = generateNodeId();
      expect(id1).toBeTruthy();
      expect(id2).toBeTruthy();
      expect(id1).not.toBe(id2);
    });
  });

  describe("formatIntentClock / parseIntentClock", () => {
    it("formats and parses correctly", () => {
      const state = { wallMs: 1703497912345, counter: 12, nodeId: "device-9f3c" };
      const clock = formatIntentClock(state);
      
      expect(clock).toBe("00001703497912345:000012:device-9f3c");
      
      const parsed = parseIntentClock(clock);
      expect(parsed).toEqual(state);
    });

    it("handles zero values", () => {
      const state = { wallMs: 0, counter: 0, nodeId: "node" };
      const clock = formatIntentClock(state);
      const parsed = parseIntentClock(clock);
      expect(parsed).toEqual(state);
    });

    it("returns null for invalid clocks", () => {
      expect(parseIntentClock("")).toBeNull();
      expect(parseIntentClock("invalid")).toBeNull();
      expect(parseIntentClock("123")).toBeNull();
      expect(parseIntentClock(null as any)).toBeNull();
    });

    it("handles nodeId with colons", () => {
      const state = { wallMs: 1000, counter: 1, nodeId: "node:with:colons" };
      const clock = formatIntentClock(state);
      const parsed = parseIntentClock(clock);
      expect(parsed).toEqual(state);
    });
  });

  describe("compareIntentClocks", () => {
    it("compares by wallMs first", () => {
      const earlier = formatIntentClock({ wallMs: 1000, counter: 99, nodeId: "a" });
      const later = formatIntentClock({ wallMs: 2000, counter: 0, nodeId: "z" });
      
      expect(compareIntentClocks(earlier, later)).toBeLessThan(0);
      expect(compareIntentClocks(later, earlier)).toBeGreaterThan(0);
    });

    it("compares by counter when wallMs is equal", () => {
      const earlier = formatIntentClock({ wallMs: 1000, counter: 1, nodeId: "z" });
      const later = formatIntentClock({ wallMs: 1000, counter: 2, nodeId: "a" });
      
      expect(compareIntentClocks(earlier, later)).toBeLessThan(0);
      expect(compareIntentClocks(later, earlier)).toBeGreaterThan(0);
    });

    it("compares by nodeId when wallMs and counter are equal", () => {
      const a = formatIntentClock({ wallMs: 1000, counter: 1, nodeId: "aaa" });
      const b = formatIntentClock({ wallMs: 1000, counter: 1, nodeId: "bbb" });
      
      expect(compareIntentClocks(a, b)).toBeLessThan(0);
      expect(compareIntentClocks(b, a)).toBeGreaterThan(0);
    });

    it("returns 0 for equal clocks", () => {
      const clock = formatIntentClock({ wallMs: 1000, counter: 1, nodeId: "node" });
      expect(compareIntentClocks(clock, clock)).toBe(0);
    });
  });

  describe("isClockNewer", () => {
    it("returns true when a > b", () => {
      const older = formatIntentClock({ wallMs: 1000, counter: 0, nodeId: "a" });
      const newer = formatIntentClock({ wallMs: 2000, counter: 0, nodeId: "a" });
      
      expect(isClockNewer(newer, older)).toBe(true);
      expect(isClockNewer(older, newer)).toBe(false);
    });

    it("handles null/undefined", () => {
      const clock = formatIntentClock({ wallMs: 1000, counter: 0, nodeId: "a" });
      
      expect(isClockNewer(clock, null)).toBe(true);
      expect(isClockNewer(clock, undefined)).toBe(true);
      expect(isClockNewer(null, clock)).toBe(false);
      expect(isClockNewer(undefined, clock)).toBe(false);
      expect(isClockNewer(null, null)).toBe(false);
    });
  });

  describe("maxClock", () => {
    it("returns the newer clock", () => {
      const older = formatIntentClock({ wallMs: 1000, counter: 0, nodeId: "a" });
      const newer = formatIntentClock({ wallMs: 2000, counter: 0, nodeId: "a" });
      
      expect(maxClock(older, newer)).toBe(newer);
      expect(maxClock(newer, older)).toBe(newer);
    });

    it("handles null/undefined", () => {
      const clock = formatIntentClock({ wallMs: 1000, counter: 0, nodeId: "a" });
      
      expect(maxClock(clock, null)).toBe(clock);
      expect(maxClock(null, clock)).toBe(clock);
      expect(maxClock(null, null)).toBeUndefined();
    });
  });

  describe("HLC class", () => {
    let hlc: HLC;

    beforeEach(() => {
      hlc = new HLC(createHLCState("test-node"));
    });

    it("generates monotonically increasing clocks", () => {
      const clock1 = hlc.now();
      const clock2 = hlc.now();
      const clock3 = hlc.now();
      
      expect(compareIntentClocks(clock1, clock2)).toBeLessThan(0);
      expect(compareIntentClocks(clock2, clock3)).toBeLessThan(0);
    });

    it("maintains clock ordering even with rapid calls", () => {
      const clocks: string[] = [];
      for (let i = 0; i < 100; i++) {
        clocks.push(hlc.now());
      }
      
      for (let i = 1; i < clocks.length; i++) {
        expect(compareIntentClocks(clocks[i - 1], clocks[i])).toBeLessThan(0);
      }
    });

    it("receive() advances clock past remote", () => {
      const remoteWallMs = Date.now() + 1000; // 1 second in future
      const remoteClock = formatIntentClock({ wallMs: remoteWallMs, counter: 5, nodeId: "remote" });
      
      const afterReceive = hlc.receive(remoteClock);
      expect(compareIntentClocks(afterReceive, remoteClock)).toBeGreaterThan(0);
      
      // Subsequent now() should also be > remoteClock
      const afterNow = hlc.now();
      expect(compareIntentClocks(afterNow, remoteClock)).toBeGreaterThan(0);
    });

    it("getState() returns current state", () => {
      hlc.now();
      const state = hlc.getState();
      
      expect(state.nodeId).toBe("test-node");
      expect(state.wallMs).toBeGreaterThan(0);
    });

    it("restore() recovers from persisted state", () => {
      // Generate some clocks
      hlc.now();
      hlc.now();
      const state1 = hlc.getState();
      
      // Create new HLC and restore
      const hlc2 = new HLC();
      hlc2.restore(state1);
      
      expect(hlc2.getNodeId()).toBe("test-node");
      
      // New clock should be >= old state
      const newClock = hlc2.now();
      const oldStateClock = formatIntentClock(state1);
      expect(compareIntentClocks(newClock, oldStateClock)).toBeGreaterThanOrEqual(0);
    });
  });

  describe("ZERO_CLOCK", () => {
    it("is older than any normal clock", () => {
      const normalClock = formatIntentClock({ wallMs: 1, counter: 0, nodeId: "a" });
      expect(compareIntentClocks(ZERO_CLOCK, normalClock)).toBeLessThan(0);
    });
  });

  describe("mergeFieldWithClock", () => {
    it("accepts newer incoming value", () => {
      const olderClock = formatIntentClock({ wallMs: 1000, counter: 0, nodeId: "a" });
      const newerClock = formatIntentClock({ wallMs: 2000, counter: 0, nodeId: "a" });
      
      const result = mergeFieldWithClock("old", olderClock, "new", newerClock);
      expect(result.value).toBe("new");
      expect(result.clock).toBe(newerClock);
    });

    it("keeps existing value when incoming is older", () => {
      const olderClock = formatIntentClock({ wallMs: 1000, counter: 0, nodeId: "a" });
      const newerClock = formatIntentClock({ wallMs: 2000, counter: 0, nodeId: "a" });
      
      const result = mergeFieldWithClock("existing", newerClock, "incoming", olderClock);
      expect(result.value).toBe("existing");
      expect(result.clock).toBe(newerClock);
    });

    it("accepts null as newer value (explicit clear)", () => {
      const olderClock = formatIntentClock({ wallMs: 1000, counter: 0, nodeId: "a" });
      const newerClock = formatIntentClock({ wallMs: 2000, counter: 0, nodeId: "a" });
      
      const result = mergeFieldWithClock("old", olderClock, null, newerClock);
      expect(result.value).toBeNull();
      expect(result.clock).toBe(newerClock);
    });

    it("handles undefined clocks", () => {
      const clock = formatIntentClock({ wallMs: 1000, counter: 0, nodeId: "a" });
      
      // Incoming with clock wins over existing without clock
      const result1 = mergeFieldWithClock("existing", undefined, "incoming", clock);
      expect(result1.value).toBe("incoming");
      
      // Existing with clock wins over incoming without clock
      const result2 = mergeFieldWithClock("existing", clock, "incoming", undefined);
      expect(result2.value).toBe("existing");
    });

    it("does not allow incoming undefined (even with newer clock) to wipe existing", () => {
      const olderClock = formatIntentClock({ wallMs: 1000, counter: 0, nodeId: "a" });
      const newerClock = formatIntentClock({ wallMs: 2000, counter: 0, nodeId: "a" });

      // Explicit clear should be null, not undefined.
      const result = mergeFieldWithClock("existing", olderClock, undefined, newerClock);
      expect(result.value).toBe("existing");
      expect(result.clock).toBe(olderClock);
    });
  });

  describe("mergeLibraryMembership", () => {
    it("accepts newer membership state", () => {
      const olderClock = formatIntentClock({ wallMs: 1000, counter: 0, nodeId: "a" });
      const newerClock = formatIntentClock({ wallMs: 2000, counter: 0, nodeId: "a" });
      
      // Add then remove
      const result = mergeLibraryMembership(true, olderClock, false, newerClock);
      expect(result.inLibrary).toBe(false);
      expect(result.clock).toBe(newerClock);
    });

    it("keeps existing membership when incoming is older", () => {
      const olderClock = formatIntentClock({ wallMs: 1000, counter: 0, nodeId: "a" });
      const newerClock = formatIntentClock({ wallMs: 2000, counter: 0, nodeId: "a" });
      
      // Remove, then try to add with older clock - should stay removed
      const result = mergeLibraryMembership(false, newerClock, true, olderClock);
      expect(result.inLibrary).toBe(false);
      expect(result.clock).toBe(newerClock);
    });

    it("offline clear arrives late, online edit wins (HLC ordering)", () => {
      // Two-device test from sync.md:
      // A clears overrides offline at time t, B edits overrides online at t+ε.
      // When A comes online later, B's edit must win (because its HLC is larger).
      
      const tA = formatIntentClock({ wallMs: 1000, counter: 0, nodeId: "deviceA" });
      const tB = formatIntentClock({ wallMs: 1001, counter: 0, nodeId: "deviceB" }); // t+ε
      
      // A's clear (with older clock) should NOT win over B's edit (with newer clock)
      const result = mergeFieldWithClock(
        { title: "B's edit" }, // existing (from B)
        tB, // B's clock
        null, // incoming (A's clear)
        tA // A's clock (older)
      );
      
      expect(result.value).toEqual({ title: "B's edit" });
      expect(result.clock).toBe(tB);
    });
  });
});

