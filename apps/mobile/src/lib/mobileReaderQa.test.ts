import { describe, expect, test } from "bun:test";
import {
  resolveMobileReaderQaChrome,
  resolveMobileReaderQaNotebook,
  resolveMobileReaderQaPanel,
  resolveMobileReaderQaPlugin,
} from "./mobileReaderQa";

describe("reader QA switches", () => {
  test("chrome is forced only by an explicit 1", () => {
    expect(resolveMobileReaderQaChrome("1")).toBe(true);
    expect(resolveMobileReaderQaChrome(undefined)).toBe(false);
    expect(resolveMobileReaderQaChrome("0")).toBe(false);
    expect(resolveMobileReaderQaChrome("true")).toBe(false);
  });

  test("panel accepts only known panels", () => {
    expect(resolveMobileReaderQaPanel("settings")).toBe("settings");
    expect(resolveMobileReaderQaPanel("ocr")).toBe("ocr");
    expect(resolveMobileReaderQaPanel("chat")).toBe("chat");
    expect(resolveMobileReaderQaPanel("ask")).toBe("ask");
    expect(resolveMobileReaderQaPanel("transcript")).toBe("transcript");
    expect(resolveMobileReaderQaPanel(undefined)).toBeNull();
    expect(resolveMobileReaderQaPanel("popover")).toBeNull();
  });

  test("plugins panel opens the list or one plugin's settings page", () => {
    expect(resolveMobileReaderQaPanel("plugins")).toBe("plugins");
    expect(resolveMobileReaderQaPanel("plugins:japanese-learning")).toBe("plugins");
    expect(resolveMobileReaderQaPanel("plugins:")).toBeNull();
    expect(resolveMobileReaderQaPanel("plugins:Not An Id")).toBeNull();

    expect(resolveMobileReaderQaPlugin("plugins", undefined)).toBeNull();
    expect(resolveMobileReaderQaPlugin("plugins:japanese-learning", undefined)).toBe("japanese-learning");
    expect(resolveMobileReaderQaPlugin("plugins:dual-reader", "japanese-learning")).toBe("dual-reader");
    expect(resolveMobileReaderQaPlugin("plugins", "dual-reader")).toBe("dual-reader");
    // The plugin switch only applies to the plugins panel.
    expect(resolveMobileReaderQaPlugin("settings", "dual-reader")).toBeNull();
    expect(resolveMobileReaderQaPlugin(undefined, "dual-reader")).toBeNull();
    expect(resolveMobileReaderQaPlugin("plugins", "../etc")).toBeNull();
  });

  test("notebook pane accepts only the paged states", () => {
    expect(resolveMobileReaderQaNotebook("trackpad")).toBe("trackpad");
    expect(resolveMobileReaderQaNotebook("filmstrip")).toBe("filmstrip");
    expect(resolveMobileReaderQaNotebook("studyDesk")).toBeNull();
    expect(resolveMobileReaderQaNotebook("continuous")).toBeNull();
    expect(resolveMobileReaderQaNotebook(undefined)).toBeNull();
  });
});
