import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  MOBILE_PERFORMANCE_MARKS,
  getMobilePerformanceEntries,
  markMobilePerformance,
  measureMobilePerformance,
  resetMobilePerformanceEntriesForTesting,
  setMobilePerformanceEnabledForTesting,
  startMobileSyncPerformancePhase,
} from "./mobilePerformance";

describe("mobile performance timeline", () => {
  beforeEach(() => {
    setMobilePerformanceEnabledForTesting(true);
    resetMobilePerformanceEntriesForTesting();
  });

  afterEach(() => {
    setMobilePerformanceEnabledForTesting(null);
    resetMobilePerformanceEntriesForTesting();
  });

  test("records boot, route, reader, and measured entries", () => {
    markMobilePerformance(MOBILE_PERFORMANCE_MARKS.bootJsEntry);
    markMobilePerformance(MOBILE_PERFORMANCE_MARKS.routeChange, { pathname: "/library" });
    const readerStartedAt = markMobilePerformance(
      MOBILE_PERFORMANCE_MARKS.readerPagesRequest,
    );
    measureMobilePerformance(
      MOBILE_PERFORMANCE_MARKS.readerFirstPage,
      readerStartedAt,
      { page: 1 },
    );

    expect(getMobilePerformanceEntries().map((entry) => entry.label)).toEqual([
      "boot.js-entry",
      "route.change",
      "reader.pages-request",
      "reader.first-page",
    ]);
  });

  test("provides idempotent sync phase spans", () => {
    const phase = startMobileSyncPerformancePhase("library", { source: "foreground" });
    expect(phase.finish({ rows: 12 })).toBeGreaterThanOrEqual(0);
    expect(phase.finish()).toBe(0);
    const entries = getMobilePerformanceEntries();
    expect(entries.map((entry) => entry.label)).toEqual([
      "sync.library.start",
      "sync.library",
    ]);
    expect(entries[1]?.metadata).toEqual({ source: "foreground", rows: 12 });
  });

  test("keeps only the newest 200 entries", () => {
    for (let index = 0; index < 215; index += 1) {
      markMobilePerformance(`mark.${index}`);
    }
    const entries = getMobilePerformanceEntries();
    expect(entries).toHaveLength(200);
    expect(entries[0]?.label).toBe("mark.15");
    expect(entries.at(-1)?.label).toBe("mark.214");
  });
});
