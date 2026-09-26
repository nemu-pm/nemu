import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  getMobileFontScaleLayoutKey,
  getMobileMangaDetailHeroLayout,
  isMobileLargeTextLayout,
} from "./mobileDynamicTypeLayout";

describe("getMobileFontScaleLayoutKey", () => {
  test("changes whenever the text size changes, so page bodies remount and re-measure", () => {
    expect(getMobileFontScaleLayoutKey(1)).toBe("font-scale-100");
    expect(getMobileFontScaleLayoutKey(3.1)).not.toBe(getMobileFontScaleLayoutKey(1));
    expect(getMobileFontScaleLayoutKey(1.118)).not.toBe(getMobileFontScaleLayoutKey(1.235));
  });

  test("is stable for the same scale and tolerates bad input", () => {
    expect(getMobileFontScaleLayoutKey(1.235)).toBe(getMobileFontScaleLayoutKey(1.235));
    expect(getMobileFontScaleLayoutKey(Number.NaN)).toBe("font-scale-100");
    expect(getMobileFontScaleLayoutKey(0)).toBe("font-scale-100");
  });

  test("both page scaffolds key their content on it", () => {
    const scaffold = readFileSync(
      path.join(import.meta.dir, "../design-system/components/PageScaffold.tsx"),
      "utf8",
    );
    expect(scaffold.match(/getMobileFontScaleLayoutKey\(/g)?.length).toBeGreaterThanOrEqual(1);
    expect(scaffold).toContain("key={fontScaleLayoutKey}");
    expect(scaffold.match(/= useMobileFontScaleLayoutKey\(\);/g)?.length).toBe(2);
  });
});

describe("getMobileMangaDetailHeroLayout", () => {
  test("default sizes keep the side-by-side hero with capped lines", () => {
    expect(
      getMobileMangaDetailHeroLayout({
        fontScale: 1,
        compact: false,
        requestedActionsPlacement: "copy",
      }),
    ).toEqual({
      stacked: false,
      actionsPlacement: "copy",
      titleLines: 3,
      primaryActionLines: 1,
    });
  });

  test("accessibility sizes stack the hero and let title and Continue wrap", () => {
    for (const fontScale of [1.353, 1.647, 3.1]) {
      expect(isMobileLargeTextLayout(fontScale)).toBe(true);
      expect(
        getMobileMangaDetailHeroLayout({
          fontScale,
          compact: false,
          requestedActionsPlacement: "copy",
        }),
      ).toEqual({
        stacked: true,
        actionsPlacement: "below",
        titleLines: undefined,
        primaryActionLines: undefined,
      });
    }
    expect(isMobileLargeTextLayout(1.235)).toBe(false);
  });
});
