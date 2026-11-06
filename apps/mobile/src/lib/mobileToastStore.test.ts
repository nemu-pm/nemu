import { describe, expect, test } from "bun:test";
import {
  createMobileToastStore,
  MOBILE_TOAST_ACTION_AUTO_DISMISS_MS,
  MOBILE_TOAST_AUTO_DISMISS_MS,
} from "./mobileToastStore";

type Options = { id?: string; title: string; action?: object; duration?: "normal" | "long" | "sticky" };

function harness() {
  const timers = new Map<number, { run: () => void; ms: number }>();
  let next = 1;
  const store = createMobileToastStore<Options>({
    schedule: (run, ms) => {
      timers.set(next, { run, ms });
      return next++ as unknown as ReturnType<typeof setTimeout>;
    },
    cancel: (timer) => {
      timers.delete(timer as unknown as number);
    },
  });
  return { store, timers, fire: () => [...timers.entries()].forEach(([k, t]) => (timers.delete(k), t.run())) };
}

describe("createMobileToastStore", () => {
  test("a toast dismisses itself after its duration", () => {
    const { store, timers, fire } = harness();
    store.show({ title: "a" });
    expect([...timers.values()][0]?.ms).toBe(MOBILE_TOAST_AUTO_DISMISS_MS);
    fire();
    expect(store.getSnapshot()).toBeNull();
  });

  test("an action keeps it longer; sticky never expires", () => {
    const { store, timers } = harness();
    store.show({ title: "a", action: {} });
    expect([...timers.values()][0]?.ms).toBe(MOBILE_TOAST_ACTION_AUTO_DISMISS_MS);
    store.show({ title: "b", duration: "sticky" });
    expect(timers.size).toBe(0);
  });

  test("dismissing a replaced toast leaves the visible toast's timer running", () => {
    const { store, timers, fire } = harness();
    store.show({ id: "progress", title: "a", duration: "sticky" });
    store.show({ id: "result", title: "b" });
    store.dismiss("progress");
    expect(store.getSnapshot()?.id).toBe("result");
    expect(timers.size).toBe(1);
    fire();
    expect(store.getSnapshot()).toBeNull();
  });

  test("replacing a toast restarts the timer, and the old timer cannot end the new toast", () => {
    const { store, timers } = harness();
    store.show({ id: "x", title: "a" });
    store.show({ id: "x", title: "b" });
    expect(timers.size).toBe(1);
    expect(store.getSnapshot()?.options.title).toBe("b");
  });

  test("subscribers hear every change and a toast outlives any one subscriber", () => {
    const { store } = harness();
    let heard = 0;
    const unsubscribe = store.subscribe(() => heard++);
    store.show({ id: "x", title: "a" });
    unsubscribe();
    expect(heard).toBe(1);
    expect(store.getSnapshot()?.id).toBe("x");
  });
});
