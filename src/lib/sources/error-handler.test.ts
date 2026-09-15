import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { sanitizeSourceErrorDiagnostic } from "@nemu/core/sources";

function repoFile(relativePath: string): string {
  return readFileSync(
    path.join(import.meta.dir, "..", "..", relativePath),
    "utf8",
  );
}

/**
 * Source-controlled error text must never reach a web surface raw: the
 * localized title is the primary copy and the message only appears as a
 * bounded, sanitized secondary diagnostic. The rules themselves are covered by
 * `packages/core/src/sources/error-diagnostics.test.ts`; these assertions pin
 * the call sites so a new surface cannot quietly go back to `error.message`.
 */
describe("web source error copy", () => {
  it("bounds and scrubs what a source can put on screen", () => {
    const detail = sanitizeSourceErrorDiagnostic(
      new Error(
        `Blocked https://user:pass@source.test/a?token=secret ${"x".repeat(900)}`,
      ),
    );

    expect(detail).not.toBeNull();
    expect(detail!.length).toBeLessThanOrEqual(500);
    expect(detail).not.toContain("user:pass");
    expect(detail).not.toContain("token=secret");
  });

  it("routes handleSourceError descriptions through the sanitizer", () => {
    const handler = repoFile("lib/sources/error-handler.ts");

    expect(handler).toContain(
      'sanitizeSourceErrorDiagnostic,\n} from "@nemu/core/sources";',
    );
    expect(handler).toContain(
      "description: sanitizeSourceErrorDiagnostic(error) ?? undefined,",
    );
    expect(handler).not.toContain("description: (error as Error).message,");
    expect(handler).not.toContain("description: context || error.message,");
  });

  it("routes the browse empty states through the sanitizer", () => {
    for (const page of [
      "pages/source-browse/aidoku-browse.tsx",
      "pages/source-browse/tachiyomi-browse.tsx",
    ]) {
      const source = repoFile(page);

      expect(source, page).toContain(
        'import { sanitizeSourceErrorDiagnostic } from "@nemu/core/sources";',
      );
      expect(source, page).toContain("sanitizeSourceErrorDiagnostic(activeQuery.error)");
      // The localized title stays the primary copy on every one of them.
      expect(source, page).toContain('title={t("error.sourceError")}');
      expect(source, page).not.toContain("activeQuery.error.message");
    }

    const aidoku = repoFile("pages/source-browse/aidoku-browse.tsx");
    expect(aidoku).toContain(
      "description={sanitizeSourceErrorDiagnostic(homeError) ?? undefined}",
    );
    expect(aidoku).not.toContain("description={homeError}");
  });
});
