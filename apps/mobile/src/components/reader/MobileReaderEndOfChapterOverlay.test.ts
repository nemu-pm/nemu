import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("mobile reader end-of-chapter overlay", () => {
  test("keeps intrinsically sized GlassSurface content from collapsing on Android", () => {
    const source = readFileSync(
      path.join(import.meta.dir, "MobileReaderEndOfChapterOverlay.tsx"),
      "utf8",
    );

    const cardContentStyle = source.match(
      /cardContent:\s*\{(?<style>[\s\S]*?)\n\s*\},/,
    )?.groups?.style;

    expect(cardContentStyle).toBeDefined();
    expect(cardContentStyle).toMatch(/\bflex:\s*0\b/);
    expect(source).toContain("contentStyle={styles.cardContent}");
    expect(source).toContain("accessibilityViewIsModal");
    expect(source).toContain('accessibilityLiveRegion="polite"');
    expect(source).toContain("AccessibilityInfo.setAccessibilityFocus(tag)");
    expect(source).toContain('accessibilityRole="header"');
    expect(source).toContain("<ScrollView");
    expect(source).toMatch(/cardScroll:\s*\{[\s\S]*?maxHeight:\s*"100%"/);
    expect(source).toContain('accessibilityLiveRegion="assertive"');
    expect(source).toMatch(/zIndex:\s*100/);
    expect(source).toMatch(/elevation:\s*100/);
  });

  test("is the final reader layer while background controls are suppressed", () => {
    const source = readFileSync(
      path.join(import.meta.dir, "MobileReaderEndOfChapterOverlay.tsx"),
      "utf8",
    );
    const reader = readFileSync(
      path.join(import.meta.dir, "../../screens/ReaderScreen.tsx"),
      "utf8",
    );
    expect(
      reader.lastIndexOf("<MobileReaderEndOfChapterOverlay"),
    ).toBeGreaterThan(reader.lastIndexOf("<MobileNemuAgentSheet"));
    expect(reader).toContain("showReaderChrome && !endOfChapterPromptVisible");
    expect(reader).toContain(
      "visible={readerPluginSettingsOpen && !endOfChapterPromptVisible}",
    );
    expect(reader).toContain(
      "visible={readerDisplaySettingsOpen && !endOfChapterPromptVisible}",
    );
    expect(reader).toContain("busy={endOfChapterProgressSaving}");
    expect(reader).toContain("error={endOfChapterProgressError}");
    expect(reader).toContain("throwOnError: true");
    expect(reader).toContain("void persistEndOfChapterCompletion()");
    expect(source).toContain("caughtUp && !error ? null");
    expect(source).toContain("caughtUp ? strings.common.retry");
  });
});
