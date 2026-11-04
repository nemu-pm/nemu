import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

function readSource(relativePath: string) {
  return readFileSync(path.join(import.meta.dir, "..", relativePath), "utf8");
}

const reader = readSource("screens/ReaderScreen.tsx");
const gallery = readSource("components/reader/MobileReaderGallery.tsx");

function block(source: string, start: string, end: string) {
  const from = source.indexOf(start);
  expect(from).toBeGreaterThanOrEqual(0);
  const to = source.indexOf(end, from + start.length);
  expect(to).toBeGreaterThan(from);
  return source.slice(from, to);
}

describe("scroll mode: the list's top padding does not flip at mount (Duo SPY p1 162pt band)", () => {
  test("the padding comes from one native sample, the app observer's until the reader reports", () => {
    const inset = block(reader, "const readerScrollTopInset =", "+ 80;");
    expect(inset).toContain("mobileReaderScrollStableTopInset(");
    expect(inset).toContain("reader: reservedLayout ? readerFoldedWindowLayout : null");
    expect(inset).toContain("app: appObservedWindowLayout");
    expect(reader).toContain("const appObservedWindowLayout = useMobileObservedWindowLayout();");
    // The gallery mounts at once: no wait on the reader's own report.
    expect(reader).not.toContain("mobileReaderStableTopInset(readerFoldedWindowLayout, insets)");
  });
});

describe("scroll mode: a top padding change re-places the page unconditionally", () => {
  const paddingEffect = block(
    gallery,
    "const chromeTopPaddingTrackRef = useRef",
    "}, [chromeTopPadding, pagedMode, scrollMountKey]);",
  );
  const reapply = block(
    gallery,
    "const reapplyPageSeek = useCallback(() => {",
    "}, [checkPageSeekLanded]);",
  );

  test("a held seek no longer skips it: renewed with its landing state, and forced", () => {
    expect(paddingEffect).not.toContain("|| pendingPageSeekRef.current) return;");
    expect(paddingEffect).toContain("const anchor = held ?? scrollAnchorRef.current;");
    expect(paddingEffect).toContain("holdMobileReaderPageSeek(anchor, held ? held.landed : true)");
    expect(paddingEffect).toContain("forcePageSeekRef.current = true;");
  });

  test("the forced seek scrolls even when the recorded offset is the target (offset 0 at p1)", () => {
    expect(reapply).toContain("const forced = forcePageSeekRef.current;");
    expect(reapply).toContain("forcePageSeekRef.current = false;");
    expect(reapply).toContain(
      "if (forced || Math.abs(latestScrollMetricsRef.current.contentOffset - offset) > 1) {",
    );
  });

  test("a drag or a new mount drops the force with the seek", () => {
    const beginDrag = block(gallery, "const handleScrollBeginDrag = (", "onUserScrollBegin?.();");
    expect(beginDrag).toContain("forcePageSeekRef.current = false;");
    const mount = block(gallery, "dragStartOffsetRef.current = null;\n    forcePageSeekRef", "scrollToOffset({");
    expect(mount).toContain("initialOffset > 0");
  });
});
