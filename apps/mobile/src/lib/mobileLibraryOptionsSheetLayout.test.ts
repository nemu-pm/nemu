import { describe, expect, test } from "bun:test";
import {
  MOBILE_LIBRARY_OPTIONS_SHEET_METRICS as M,
  getMobileLibraryOptionsNativeSheetHeight,
} from "./mobileLibraryOptionsSheetLayout";

describe("getMobileLibraryOptionsNativeSheetHeight", () => {
  test("fits the chrome, rows, section gap and footer", () => {
    const height = getMobileLibraryOptionsNativeSheetHeight({ sections: [1, 1], footerLines: 2, maxHeight: 900 });
    expect(height).toBe(M.chrome + M.formTop + 2 * M.row + M.sectionGap + 2 * M.footerLine + M.footerPadding + M.bottom);
  });

  test("grows rows and footer with Dynamic Type", () => {
    const base = getMobileLibraryOptionsNativeSheetHeight({ sections: [2], footerLines: 2, maxHeight: 900 });
    const large = getMobileLibraryOptionsNativeSheetHeight({ sections: [2], footerLines: 2, fontScale: 1.5, maxHeight: 900 });
    expect(large).toBeGreaterThan(base);
  });

  test("never taller than the room it has, never shorter than 240", () => {
    expect(getMobileLibraryOptionsNativeSheetHeight({ sections: [2], footerLines: 2, fontScale: 3, maxHeight: 400 })).toBe(400);
    expect(getMobileLibraryOptionsNativeSheetHeight({ sections: [8], footerLines: 0, maxHeight: 100 })).toBe(240);
  });
});
