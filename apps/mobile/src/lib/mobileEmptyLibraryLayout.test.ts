import { describe, expect, test } from "bun:test";
import { getMobileEmptyLibraryLayout } from "./mobileEmptyLibraryLayout";

describe("getMobileEmptyLibraryLayout", () => {
  test("keeps the established vertical treatment on a short landscape phone", () => {
    const layout = getMobileEmptyLibraryLayout({
      width: 780,
    });

    expect(layout).toEqual({
      portraitMaxWidth: 390,
      rootMinHeight: 560,
    });
  });

  test("never lets the portrait overflow a narrow portrait viewport", () => {
    const layout = getMobileEmptyLibraryLayout({
      width: 320,
    });

    expect(layout.portraitMaxWidth).toBe(264);
  });

  test("keeps the established portrait treatment on a normal phone", () => {
    const layout = getMobileEmptyLibraryLayout({
      width: 390,
    });

    expect(layout).toEqual({
      portraitMaxWidth: 334,
      rootMinHeight: 560,
    });
  });
});
