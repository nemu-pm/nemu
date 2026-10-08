import { describe, expect, test } from "bun:test";
import { getMobileExploreCoverPlaceholderSize } from "./mobileExploreCoverPlaceholder";

describe("getMobileExploreCoverPlaceholderSize", () => {
  test("drops the title where it could not be read", () => {
    expect(getMobileExploreCoverPlaceholderSize(20)).toBe("mini");
    expect(getMobileExploreCoverPlaceholderSize(26)).toBe("mini");
    expect(getMobileExploreCoverPlaceholderSize(Number.NaN)).toBe("mini");
  });

  test("compact titles on small covers, full ones on shelf/card covers", () => {
    expect(getMobileExploreCoverPlaceholderSize(58)).toBe("compact");
    expect(getMobileExploreCoverPlaceholderSize(95)).toBe("compact");
    expect(getMobileExploreCoverPlaceholderSize(118)).toBe("regular");
  });

  test("a display title on hero-sized covers", () => {
    expect(getMobileExploreCoverPlaceholderSize(179)).toBe("regular");
    expect(getMobileExploreCoverPlaceholderSize(210)).toBe("large");
    expect(getMobileExploreCoverPlaceholderSize(302)).toBe("large");
  });
});
