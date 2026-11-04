import { describe, expect, test } from "bun:test";
import { MOBILE_NATIVE_FORM_ROW as ROW, getMobileNativeFormSheetHeight } from "./mobileNativeFormSheetLayout";

describe("getMobileNativeFormSheetHeight", () => {
  const base = { sheetWidth: 600, maxHeight: 2000, minHeight: 0 };

  test("every row and section counts", () => {
    const one = getMobileNativeFormSheetHeight({ ...base, sections: [{ rows: [ROW] }] });
    const two = getMobileNativeFormSheetHeight({ ...base, sections: [{ rows: [ROW, ROW] }] });
    const split = getMobileNativeFormSheetHeight({ ...base, sections: [{ rows: [ROW] }, { rows: [ROW] }] });
    expect(two - one).toBe(ROW);
    expect(split).toBeGreaterThan(two);
  });

  test("a footer wraps at the sheet's width; Dynamic Type grows the sheet", () => {
    const footer = "Enter the credentials for this source. They are saved only after the source accepts them.";
    const wide = getMobileNativeFormSheetHeight({ ...base, sections: [{ rows: [ROW], footer }] });
    const narrow = getMobileNativeFormSheetHeight({ ...base, sheetWidth: 320, sections: [{ rows: [ROW], footer }] });
    const large = getMobileNativeFormSheetHeight({ ...base, fontScale: 1.5, sections: [{ rows: [ROW], footer }] });
    expect(narrow).toBeGreaterThan(wide);
    expect(large).toBeGreaterThan(wide);
  });

  test("kept between the floor and the room it has", () => {
    const rows = Array.from({ length: 40 }, () => ROW);
    expect(getMobileNativeFormSheetHeight({ sheetWidth: 600, maxHeight: 500, sections: [{ rows }] })).toBe(500);
    expect(getMobileNativeFormSheetHeight({ sheetWidth: 600, maxHeight: 900, sections: [{ rows: [ROW] }] })).toBe(240);
  });

  test("a tight top drops the band above the first group", () => {
    const loose = getMobileNativeFormSheetHeight({ ...base, sections: [{ rows: [ROW] }] });
    const tight = getMobileNativeFormSheetHeight({ ...base, tightTop: true, sections: [{ rows: [ROW] }] });
    expect(loose - tight).toBe(50);
  });
});
