import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

function mobileSource(relativePath: string): string {
  return readFileSync(path.join(import.meta.dir, "..", relativePath), "utf8");
}

/**
 * Any settings write (reading mode, theme, two-page toggle, …) bumps the
 * installed-sources revision, which used to flip the reader's `loading` flag
 * and re-run the pages effect — blanking the rendered chapter and refetching
 * it from the source. The reader must key refetches on the actual request
 * identity, and the installed-sources hook must keep reference-stable data.
 */
describe("mobile reader pages reload policy", () => {
  test("pages effect refetches only when the request key changes", () => {
    const screen = mobileSource("screens/ReaderScreen.tsx");

    expect(screen).toContain("const readerPagesLoadedKeyRef = useRef<");
    expect(screen).toContain(
      "if (readerPagesLoadedKeyRef.current === pagesRequestKey) {",
    );
    expect(screen).toContain(
      "readerPagesLoadedKeyRef.current = pagesRequestKey;",
    );
    // The key must cover everything that genuinely requires a refetch.
    expect(screen).toContain(
      "}:${pagesRefreshNonce}:${appLanguage}`",
    );
    // The guard must run before the effect resets the rendered pages.
    const guardIndex = screen.indexOf(
      "if (readerPagesLoadedKeyRef.current === pagesRequestKey) {",
    );
    const resetIndex = screen.indexOf(
      'detail: effectStrings.reader.loadingPages,',
    );
    expect(guardIndex).toBeGreaterThan(0);
    expect(resetIndex).toBeGreaterThan(guardIndex);
  });

  test("installed sources keep reference-stable data across reloads", () => {
    const hooks = mobileSource("data/mobileHooks.ts");
    expect(hooks).toContain(
      "setData((current) => keepReferenceIfUnchanged(current, sources));",
    );
  });
});
