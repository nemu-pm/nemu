import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { getMobileReaderHardwareBackAction } from "./mobileReaderBackBehavior";

describe("mobile reader hardware back behavior", () => {
  test("dismisses the modal end prompt before plugins, chrome, or navigation", () => {
    expect(
      getMobileReaderHardwareBackAction({
        hasActivePlugin: true,
        hasEndOfChapterPrompt: true,
        showControls: false,
      }),
    ).toBe("dismiss-end-prompt");
  });

  test("closes the active plugin before changing reader chrome", () => {
    expect(
      getMobileReaderHardwareBackAction({
        hasActivePlugin: true,
        showControls: false,
      })
    ).toBe("close-plugin");
  });

  test("shows hidden reader controls before leaving the reader", () => {
    expect(
      getMobileReaderHardwareBackAction({
        hasActivePlugin: false,
        showControls: false,
      })
    ).toBe("show-controls");
  });

  test("falls through to navigation when reader chrome is visible", () => {
    expect(
      getMobileReaderHardwareBackAction({
        hasActivePlugin: false,
        showControls: true,
      })
    ).toBe("navigate-back");
  });

  test("routes toolbar and hardware back through the cold deep-link fallback", () => {
    const screen = readFileSync(
      path.join(import.meta.dir, "../screens/ReaderScreen.tsx"),
      "utf8",
    );
    expect(screen).toContain("getMobileSourceReaderBackAction({");
    expect(screen).toContain("canGoBack: router.canGoBack()");
    expect(screen.match(/navigateBack\(\);/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
