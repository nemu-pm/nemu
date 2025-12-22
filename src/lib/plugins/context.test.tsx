import { useCallback } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

import { ReaderPluginProvider } from "./context";
import { usePluginRegistry } from "./registry";
import type { ReaderPlugin } from "./types";

describe("ReaderPluginProvider", () => {
  beforeEach(() => {
    // Ensure clean plugin registry + enabled-state between tests
    localStorage.removeItem("nemu:plugins:enabled");
    usePluginRegistry.setState({ plugins: new Map(), enabledState: {} });
  });

  it("fires onPageChange when the visible page image URL becomes available (without a page turn)", async () => {
    const onPageChange = vi.fn();

    const plugin: ReaderPlugin = {
      manifest: { id: "test-plugin", name: "Test Plugin" },
      hooks: { onPageChange },
    };
    usePluginRegistry.getState().register(plugin);

    function Harness({ url }: { url?: string }) {
      const getPageImageUrl = useCallback((pageIndex: number) => {
        if (pageIndex !== 0) return undefined;
        return url;
      }, [url]);

      const getLoadedPageUrls = useCallback(() => {
        const m = new Map<number, string>();
        if (url) m.set(0, url);
        return m;
      }, [url]);

      return (
        <ReaderPluginProvider
          currentPageIndex={0}
          visiblePageIndices={[0]}
          pageCount={1}
          chapterId="c1"
          mangaId="m1"
          sourceId="s1"
          registryId="r1"
          readingMode="rtl"
          sourceLanguages={["ja"]}
          chapterLanguage="ja"
          getPageImageUrl={getPageImageUrl}
          getLoadedPageUrls={getLoadedPageUrls}
        >
          <div>child</div>
        </ReaderPluginProvider>
      );
    }

    const { rerender } = render(<Harness url={undefined} />);
    expect(onPageChange).toHaveBeenCalledTimes(0);

    rerender(<Harness url="blob:test" />);
    expect(onPageChange).toHaveBeenCalledTimes(1);

    // No-op rerender with same URL should not fire again
    rerender(<Harness url="blob:test" />);
    expect(onPageChange).toHaveBeenCalledTimes(1);
  });
});


