import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { collectNativeSegmentTemporaryUrisForCleanup } from "./mobileNativeHttpFileCleanup";

describe("native segmented temporary cleanup", () => {
  test("captures every owned URI from an over-count 33-tile response", () => {
    const segments = Array.from({ length: 33 }, (_, index) => ({
      fileUri: ` file:///owned/tile-${index}.part `,
    }));
    expect(
      collectNativeSegmentTemporaryUrisForCleanup(segments, (uri) =>
        uri.startsWith("file:///owned/"),
      ),
    ).toEqual(
      Array.from(
        { length: 33 },
        (_, index) => `file:///owned/tile-${index}.part`,
      ),
    );
  });

  test("deduplicates, rejects foreign paths, and bounds malformed scans", () => {
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    const segments = [
      { fileUri: "file:///owned/same.part" },
      { fileUri: "file:///owned/same.part" },
      { fileUri: "file:///foreign/no.part" },
      {
        get fileUri(): string {
          throw new Error("malformed accessor");
        },
      },
      revoked.proxy,
      ...Array.from({ length: 200 }, (_, index) => ({
        fileUri: `file:///owned/tile-${index}.part`,
      })),
    ];
    const uris = collectNativeSegmentTemporaryUrisForCleanup(segments, (uri) =>
      uri.startsWith("file:///owned/"),
    );
    expect(uris[0]).toBe("file:///owned/same.part");
    expect(uris).toHaveLength(124);
  });

  test("collects ownership before trusting the bridge response union", () => {
    const bridge = readFileSync(
      path.join(import.meta.dir, "mobileNativeHttpFile.native.ts"),
      "utf8",
    );
    const collectAt = bridge.indexOf(
      "nativeSegmentUris = collectNativeSegmentTemporaryUrisForCleanup(",
    );
    const kindValidationAt = bridge.indexOf(
      'response.kind !== "segmented-image"',
    );
    expect(collectAt).toBeGreaterThan(-1);
    expect(kindValidationAt).toBeGreaterThan(collectAt);
    expect(bridge).toContain("nativeFileUri != null ||");
    expect(bridge).toContain("response.imageSegments.length !== 0");
  });
});
