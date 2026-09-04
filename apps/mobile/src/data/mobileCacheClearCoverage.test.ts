import { describe, expect, test } from "bun:test";
import path from "node:path";

/**
 * Every in-memory or on-disk source cache has to be listed in BOTH clear paths:
 * the Settings "clear cache" step list in `useMobileDataManagement` and the
 * device-wide `clearAllMobileDeviceData`. A cache only one path knows about
 * silently survives the clear the user just asked for — which is how the
 * source listing cache kept serving pre-clear grids.
 */
const CLEAR_PATHS = [
  {
    file: "mobileHooks.ts",
    marker: "await runMobileCacheClearSteps([",
  },
  {
    file: "mobileDeviceDataClear.ts",
    marker: "await runMobileCacheClearSteps([",
  },
] as const;

const REQUIRED_STEPS = [
  "clearCachedSourcePackages",
  "defaultMobileSourceSessionCache.clear()",
  "clearMobileImageCache",
  "clearMobileReaderPageListCache",
  "clearMobileSourceImageRequestCache",
  "clearMobileSourceDetailCache",
  "clearMobileSourceListingCache",
  "clearMobileJapaneseLearningTtsCache",
  "clearMobileDualReaderDhashCache",
] as const;

async function readClearStepList(file: string, marker: string) {
  const source = await Bun.file(
    path.join(import.meta.dir, file),
  ).text();
  const start = source.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = source.indexOf("]);", start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("mobile cache clear coverage", () => {
  for (const { file, marker } of CLEAR_PATHS) {
    test(`${file} clears every registered cache backend`, async () => {
      const stepList = await readClearStepList(file, marker);
      for (const step of REQUIRED_STEPS) {
        expect(`${file}:${stepList.includes(step)}`).toBe(`${file}:true`);
      }
    });
  }
});
