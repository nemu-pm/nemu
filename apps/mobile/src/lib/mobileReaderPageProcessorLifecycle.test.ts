import { describe, expect, test } from "bun:test";
import type { MobileReaderPageProcessor } from "@/sources/mobileSourcePages";
import { disposeMobileReaderPageProcessorIfUnowned } from "./mobileReaderPageProcessorLifecycle";

function fakeProcessor(onDispose: () => void): MobileReaderPageProcessor {
  return {
    processWindow: async () => null,
    cancel() {},
    dispose: onDispose,
    cacheSize: () => 0,
  };
}

describe("mobile reader page processor lifecycle", () => {
  test("a cancelled old effect cannot dispose a processor adopted by its replacement", async () => {
    let disposed = 0;
    let processedWindows = 0;
    const shared: MobileReaderPageProcessor = {
      processWindow: async () => {
        processedWindows += 1;
        return null;
      },
      cancel() {},
      dispose() {
        disposed += 1;
      },
      cacheSize: () => 0,
    };

    expect(disposeMobileReaderPageProcessorIfUnowned(shared, shared)).toBe(false);
    await shared.processWindow(4);
    expect(disposed).toBe(0);
    expect(processedWindows).toBe(1);
  });

  test("a cancelled refresh disposes a processor that was never adopted", () => {
    let disposed = 0;
    const orphan = fakeProcessor(() => {
      disposed += 1;
    });

    expect(disposeMobileReaderPageProcessorIfUnowned(orphan, null)).toBe(true);
    expect(disposed).toBe(1);
  });
});
