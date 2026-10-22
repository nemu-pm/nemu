import { describe, expect, test } from "bun:test";
import {
  createMobileReaderLivePageStore,
  mobileReaderLivePageIndex,
} from "./mobileReaderLivePage";

describe("reader live page", () => {
  test("shows the live page while the committed page is unchanged", () => {
    expect(mobileReaderLivePageIndex({ index: 7, baseIndex: 3 }, 3)).toBe(7);
  });

  test("any commit supersedes the live page", () => {
    expect(mobileReaderLivePageIndex({ index: 7, baseIndex: 3 }, 7)).toBe(7);
    expect(mobileReaderLivePageIndex({ index: 7, baseIndex: 3 }, 12)).toBe(12);
    expect(mobileReaderLivePageIndex(null, 4)).toBe(4);
  });

  test("notifies subscribers only on a change", () => {
    const store = createMobileReaderLivePageStore();
    let calls = 0;
    const unsubscribe = store.subscribe(() => {
      calls += 1;
    });
    store.set({ index: 2, baseIndex: 1 });
    store.set({ index: 2, baseIndex: 1 });
    expect(calls).toBe(1);
    expect(store.get()).toEqual({ index: 2, baseIndex: 1 });
    store.set(null);
    expect(calls).toBe(2);
    unsubscribe();
    store.set({ index: 5, baseIndex: 1 });
    expect(calls).toBe(2);
  });
});
