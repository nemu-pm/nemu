import { describe, expect, test } from "bun:test";
import { resolveMobileReaderQaChrome, resolveMobileReaderQaNotebook, resolveMobileReaderQaPanel } from "./mobileReaderQa";

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

  test("notebook pane accepts only the paged states", () => {
    expect(resolveMobileReaderQaNotebook("trackpad")).toBe("trackpad");
    expect(resolveMobileReaderQaNotebook("filmstrip")).toBe("filmstrip");
    expect(resolveMobileReaderQaNotebook("studyDesk")).toBe("studyDesk");
    expect(resolveMobileReaderQaNotebook("continuous")).toBeNull();
    expect(resolveMobileReaderQaNotebook(undefined)).toBeNull();
  });
});
