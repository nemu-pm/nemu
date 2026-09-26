import { describe, expect, test } from "bun:test";
import { createMobileKeyedRefreshGate } from "./mobileKeyedRefreshGate";

describe("createMobileKeyedRefreshGate", () => {
  test("runs each key once and keeps the in-flight run alive on same-key re-runs", () => {
    const gate = createMobileKeyedRefreshGate();
    const run = gate.begin("aidoku-community:multi.mangadex:m1:0");
    expect(run).not.toBeNull();

    // An effect re-run caused by an unrelated dependency (entry identity after
    // a sync snapshot) must neither start a duplicate nor cancel the first run.
    expect(gate.begin("aidoku-community:multi.mangadex:m1:0")).toBeNull();
    expect(run!.isCancelled()).toBe(false);
  });

  test("a new key cancels the previous run", () => {
    const gate = createMobileKeyedRefreshGate();
    const first = gate.begin("k:0")!;
    const second = gate.begin("k:1")!;
    expect(first.isCancelled()).toBe(true);
    expect(second.isCancelled()).toBe(false);
  });

  test("reset cancels the active run and allows the same key again", () => {
    const gate = createMobileKeyedRefreshGate();
    const first = gate.begin("k:0")!;
    gate.reset();
    expect(first.isCancelled()).toBe(true);
    const again = gate.begin("k:0");
    expect(again).not.toBeNull();
    expect(again!.isCancelled()).toBe(false);
  });

  test("cancelActive (unmount) cancels without allowing a duplicate run", () => {
    const gate = createMobileKeyedRefreshGate();
    const first = gate.begin("k:0")!;
    gate.cancelActive();
    expect(first.isCancelled()).toBe(true);
    expect(gate.begin("k:0")).toBeNull();
  });
});
