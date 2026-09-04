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

  test("installed sources keep per-item reference-stable data across reloads", () => {
    const hooks = mobileSource("data/mobileHooks.ts");
    expect(hooks).toContain("stabilizeListReferences(");
    expect(hooks).toContain(
      "setData((current) => keepReferenceIfUnchanged(current, source));",
    );
  });

  test("installed-source hooks listen on the sources scope, not settings", () => {
    const hooks = mobileSource("data/mobileHooks.ts");
    const installedSourcesHook = hooks.slice(
      hooks.indexOf("export function useInstalledSources("),
      hooks.indexOf("export function useLibraryItem("),
    );
    expect(installedSourcesHook).toContain(
      'useMobileDataRevision(["sources"])',
    );
    expect(installedSourcesHook).not.toContain(
      'useMobileDataRevision(["settings"])',
    );
  });

  test("installed-source mutations emit the sources scope", () => {
    // Package hydration during reading/browsing is the hot path: it must not
    // ride the settings channel, or it re-wakes every settings listener.
    for (const relativePath of [
      "screens/MangaDetailScreen.tsx",
      "screens/SourceMangaScreen.tsx",
      "screens/SourceBrowseScreen.tsx",
      "screens/ReaderScreen.tsx",
    ]) {
      expect(mobileSource(relativePath)).toContain(
        'emitMobileDataChanged("sources")',
      );
    }
    const hooks = mobileSource("data/mobileHooks.ts");
    expect(hooks).toContain('emitMobileDataChanged("sources")');
    // Cloud hydration rewrites settings and installed sources together.
    expect(mobileSource("sync/MobileSyncProvider.tsx")).toContain(
      'emitMobileDataChanged("sources")',
    );
    expect(mobileSource("sync/mobileBackgroundSyncRunner.ts")).toContain(
      'emitMobileDataChanged("sources")',
    );
  });
});

describe("incidental-churn guards across screens", () => {
  test("source search refetches only when its request key changes", () => {
    const screen = mobileSource("screens/SourceBrowseScreen.tsx");
    expect(screen).toContain("const loadedSourceSearchKeyRef = useRef<");
    expect(screen).toContain(
      "if (loadedSourceSearchKeyRef.current === sourceSearchRequestKey) return;",
    );
    // The key must derive from the same generation inputs as the home tab.
    expect(screen).toContain("? `${sourceHomeGenerationKey}:${sourceSearchTerm}:");
  });

  test("library refresh scheduler is decoupled from callback identity", () => {
    const screen = mobileSource("screens/LibraryScreen.tsx");
    expect(screen).toContain(
      "const refreshLatestChaptersRef = useRef(refreshLatestChapters);",
    );
    expect(screen).toContain(
      "const refreshLatestChapters = () => refreshLatestChaptersRef.current();",
    );
    const schedulerIndex = screen.indexOf(
      "const refreshLatestChapters = () => refreshLatestChaptersRef.current();",
    );
    const schedulerEnd = screen.indexOf("subscription.remove();\n    };\n  }, []);", schedulerIndex);
    expect(schedulerEnd).toBeGreaterThan(schedulerIndex);
  });

  test("cover requests keep the last resolved request while refreshing", () => {
    const hook = mobileSource("lib/useMobileSourceImageRequest.ts");
    expect(hook).toContain(
      "const settledRequest =\n    state?.identityKey === imageIdentityKey ? state.request : null;",
    );
    expect(hook).not.toContain("state?.key === sourceRequestKey");
  });

  test("covers hold the last resolved paint until the next request settles", () => {
    const hook = mobileSource("lib/useMobileSourceImageRequest.ts");
    // An unresolved cover must never fall back to a headerless source URL:
    // referer-gated hosts answer 403 and MobileCachedImage latches that.
    expect(hook).toContain(
      "return previous?.resolved\n    ? previous\n    : keep({ request: { uri: cover }, resolved: false });",
    );
    for (const screen of ["screens/SourceMangaScreen.tsx", "screens/MangaDetailScreen.tsx"]) {
      const source = mobileSource(screen);
      expect(source).toContain("useMobileStickySourceCover({");
      expect(source).toContain("coverSource={coverImage.source}");
      expect(source).not.toContain("coverRequest?.url ?? cover");
    }
  });

  test("source settings reload does not flash loading for the same source", () => {
    const hooks = mobileSource("data/mobileHooks.ts");
    expect(hooks).toContain(
      "loadedSourceSettingsSignature.current !== sourceSettingsLoadSignature\n    ) {\n      setLoading(true);",
    );
  });

  test("selected live-search sources hold their reference across sibling changes", () => {
    const screen = mobileSource("screens/SearchScreen.tsx");
    expect(screen).toContain("const selectedInstalledSources = useStableList(");
  });
});
