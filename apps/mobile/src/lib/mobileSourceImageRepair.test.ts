import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  clearMobileSourceImageLoadFailureListeners,
  isRepairableMobileSourceImageUri,
  reportMobileSourceImageLoadFailure,
  reportMobileSourceImageRepaired,
  shouldRepairMobileSourceImageRequest,
  subscribeMobileSourceImageLoadFailures,
  subscribeMobileSourceImageRepairs,
} from "./mobileSourceImageRepair";

const PROCESSED_COVER_URI = "file:///cache/nemu-processed-covers/cover-a.png";

afterEach(() => {
  clearMobileSourceImageLoadFailureListeners();
});

describe("isRepairableMobileSourceImageUri", () => {
  test("accepts the local schemes a processed cover can use", () => {
    expect(isRepairableMobileSourceImageUri(PROCESSED_COVER_URI)).toBe(true);
    expect(isRepairableMobileSourceImageUri("content://media/1")).toBe(true);
  });

  test("refuses remote URLs, data URIs and schemeless values", () => {
    // A remote cover that fails is the image cache's problem; re-resolving the
    // rewrite would just hammer the source.
    expect(isRepairableMobileSourceImageUri("https://cdn.test/a.jpg")).toBe(
      false,
    );
    expect(isRepairableMobileSourceImageUri("http://cdn.test/a.jpg")).toBe(
      false,
    );
    // A data URI carries its own bytes, so there is nothing to re-resolve.
    expect(isRepairableMobileSourceImageUri("data:image/png;base64,AA")).toBe(
      false,
    );
    expect(isRepairableMobileSourceImageUri("/cache/cover.png")).toBe(false);
    expect(isRepairableMobileSourceImageUri("")).toBe(false);
  });
});

describe("shouldRepairMobileSourceImageRequest", () => {
  test("repairs the holder whose local URI failed", () => {
    expect(
      shouldRepairMobileSourceImageRequest({
        failedUri: PROCESSED_COVER_URI,
        requestUrl: PROCESSED_COVER_URI,
        alreadyRepaired: false,
      }),
    ).toBe(true);
  });

  test("ignores a failure for a URI this holder did not resolve", () => {
    expect(
      shouldRepairMobileSourceImageRequest({
        failedUri: PROCESSED_COVER_URI,
        requestUrl: "file:///cache/nemu-processed-covers/cover-b.png",
        alreadyRepaired: false,
      }),
    ).toBe(false);
    expect(
      shouldRepairMobileSourceImageRequest({
        failedUri: PROCESSED_COVER_URI,
        requestUrl: null,
        alreadyRepaired: false,
      }),
    ).toBe(false);
  });

  test("never repairs a remote URL", () => {
    expect(
      shouldRepairMobileSourceImageRequest({
        failedUri: "https://cdn.test/cover.jpg",
        requestUrl: "https://cdn.test/cover.jpg",
        alreadyRepaired: false,
      }),
    ).toBe(false);
  });

  test("repairs a given URI only once", () => {
    expect(
      shouldRepairMobileSourceImageRequest({
        failedUri: PROCESSED_COVER_URI,
        requestUrl: PROCESSED_COVER_URI,
        alreadyRepaired: true,
      }),
    ).toBe(false);
  });

  test("ignores an empty reported URI", () => {
    expect(
      shouldRepairMobileSourceImageRequest({
        failedUri: "",
        requestUrl: "",
        alreadyRepaired: false,
      }),
    ).toBe(false);
  });

  test("accepts an injected repairability predicate", () => {
    expect(
      shouldRepairMobileSourceImageRequest({
        failedUri: "https://cdn.test/cover.jpg",
        requestUrl: "https://cdn.test/cover.jpg",
        alreadyRepaired: false,
        isRepairableUri: () => true,
      }),
    ).toBe(true);
  });
});

describe("mobile source image load failure reports", () => {
  test("delivers a reported URI to every subscriber", () => {
    const first: string[] = [];
    const second: string[] = [];
    subscribeMobileSourceImageLoadFailures((uri) => first.push(uri));
    const unsubscribe = subscribeMobileSourceImageLoadFailures((uri) =>
      second.push(uri),
    );

    reportMobileSourceImageLoadFailure(PROCESSED_COVER_URI);
    unsubscribe();
    reportMobileSourceImageLoadFailure("file:///cache/other.png");

    expect(first).toEqual([PROCESSED_COVER_URI, "file:///cache/other.png"]);
    expect(second).toEqual([PROCESSED_COVER_URI]);
  });

  test("one throwing subscriber does not stop the others", () => {
    const seen: string[] = [];
    subscribeMobileSourceImageLoadFailures(() => {
      throw new Error("boom");
    });
    subscribeMobileSourceImageLoadFailures((uri) => seen.push(uri));

    expect(() =>
      reportMobileSourceImageLoadFailure(PROCESSED_COVER_URI),
    ).not.toThrow();
    expect(seen).toEqual([PROCESSED_COVER_URI]);
  });

  test("ignores an empty report", () => {
    const seen: string[] = [];
    subscribeMobileSourceImageLoadFailures((uri) => seen.push(uri));

    reportMobileSourceImageLoadFailure("");

    expect(seen).toEqual([]);
  });

  test("keeps the failure and repair channels separate", () => {
    const failures: string[] = [];
    const repairs: string[] = [];
    subscribeMobileSourceImageLoadFailures((uri) => failures.push(uri));
    const unsubscribe = subscribeMobileSourceImageRepairs((uri) =>
      repairs.push(uri),
    );

    reportMobileSourceImageLoadFailure(PROCESSED_COVER_URI);
    reportMobileSourceImageRepaired(PROCESSED_COVER_URI);
    unsubscribe();
    reportMobileSourceImageRepaired(PROCESSED_COVER_URI);

    expect(failures).toEqual([PROCESSED_COVER_URI]);
    expect(repairs).toEqual([PROCESSED_COVER_URI]);
  });
});

/**
 * The pure pieces above are only useful if the two ends are actually wired:
 * the render path has to report an app-local load failure, and the request
 * hook has to drop its memoized entry and resolve again exactly once.
 */
describe("processed cover repair wiring", () => {
  function mobileSource(relativePath: string): string {
    return readFileSync(path.join(import.meta.dir, "..", relativePath), "utf8");
  }

  test("MobileCachedImage reports app-local load failures", () => {
    const component = mobileSource(
      "design-system/components/MobileCachedImage.tsx",
    );

    // Both failure shapes must report: a load error from the native loader,
    // and a URI the policy now refuses because pruning unregistered it.
    expect(
      component.match(/reportMobileSourceImageLoadFailure\(sourceUri\);/g)
        ?.length,
    ).toBe(2);
    expect(component).toContain("isRepairableMobileSourceImageUri(sourceUri)");
  });

  test("MobileCachedImage re-evaluates a repaired URI exactly once", () => {
    const component = mobileSource(
      "design-system/components/MobileCachedImage.tsx",
    );

    expect(component).toContain(
      "subscribeMobileSourceImageRepairs((repairedUri)",
    );
    expect(component).toContain("if (repairedUri !== sourceUri) return;");
    // One bump per URI, so a cover that is genuinely unpaintable cannot loop.
    expect(component).toContain(
      "if (localRepairedUriRef.current === sourceUri) return;",
    );
    expect(component).toContain(
      "setLocalRepairGeneration((current) => current + 1);",
    );
    // The bump has to reach the URI verdict, the latched failure key and the
    // element the native loader failed on.
    expect(component).toContain("void localRepairGeneration;");
    expect(component).toContain("}:${localRepairGeneration}`");
    expect(component).toContain("key={localRepairGeneration}");
  });

  test("the hook announces the repair the view is waiting for", () => {
    const hook = mobileSource("lib/useMobileSourceImageRequest.ts");

    expect(hook).toContain("pendingRepairUriRef.current = failedUri;");
    expect(hook).toContain(
      "if (repairedUri && request?.url === repairedUri) {",
    );
    expect(hook).toContain("reportMobileSourceImageRepaired(repairedUri);");
  });

  test("the request hook drops the memoized entry and re-resolves once", () => {
    const hook = mobileSource("lib/useMobileSourceImageRequest.ts");

    expect(hook).toContain("subscribeMobileSourceImageLoadFailures((failedUri)");
    expect(hook).toContain("shouldRepairMobileSourceImageRequest({");
    expect(hook).toContain("repairedUrisRef.current.add(failedUri);");
    expect(hook).toContain("forgetMobileSourceImageRequest(cacheKey);");
    expect(hook).toContain("setRepairNonce((current) => current + 1);");
    // The nonce has to be part of the resolve effect or nothing re-resolves.
    expect(hook).toContain("    repairNonce,\n");
  });
});
