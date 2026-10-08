import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  concentricMobileExploreRadii,
  concentricMobileExploreRadius,
  MOBILE_EXPLORE_RADIUS,
  MOBILE_SHEET_BODY_INSET,
  MOBILE_SHEET_GROUP_RADIUS,
  MOBILE_SETTINGS_GROUP_INSET,
  MOBILE_SETTINGS_CONTROL_RADIUS,
} from "./mobileExploreRadius";

describe("design-explore corner scale", () => {
  test("a nested corner is its container's radius less the inset between them, square when the inset swallows it", () => {
    expect(concentricMobileExploreRadius(MOBILE_EXPLORE_RADIUS.card, 16)).toBe(10);
    expect(concentricMobileExploreRadius(MOBILE_EXPLORE_RADIUS.group, 18)).toBe(2);
    expect(concentricMobileExploreRadius(MOBILE_EXPLORE_RADIUS.group, 24)).toBe(0);
    expect(concentricMobileExploreRadius(10, -4)).toBe(10);
  });

  test("concentricity holds all the way down: sheet → group → row → control", () => {
    // A sheet's group sits 16pt in from the sheet's edge and lands on the scale's group step.
    expect(MOBILE_SHEET_GROUP_RADIUS).toBe(MOBILE_EXPLORE_RADIUS.group);
    expect(MOBILE_EXPLORE_RADIUS.sheet - MOBILE_SHEET_BODY_INSET).toBe(MOBILE_EXPLORE_RADIUS.group);
    // Each level is the previous less its inset: sheet 36, group 20, a row highlight 6pt in = 14 (the row step), a control 6pt in = 8.
    expect(concentricMobileExploreRadii(MOBILE_EXPLORE_RADIUS.sheet, [MOBILE_SHEET_BODY_INSET, 6, 6])).toEqual([36, 20, 14, 8]);
    expect(concentricMobileExploreRadii(MOBILE_EXPLORE_RADIUS.sheet, [MOBILE_SHEET_BODY_INSET, 6, 6])[2]).toBe(MOBILE_EXPLORE_RADIUS.row);
    // Never negative, however deep.
    for (const radius of concentricMobileExploreRadii(MOBILE_EXPLORE_RADIUS.card, [10, 10, 10, 10])) {
      expect(radius).toBeGreaterThanOrEqual(0);
    }
  });

  test("custom settings fields and metadata marks share their group's inset corner", () => {
    expect(MOBILE_SETTINGS_GROUP_INSET).toBe(14);
    expect(MOBILE_SETTINGS_CONTROL_RADIUS).toBe(6);
    expect(MOBILE_SETTINGS_CONTROL_RADIUS + MOBILE_SETTINGS_GROUP_INSET).toBe(MOBILE_SHEET_GROUP_RADIUS);
    const source = readFileSync(path.join(import.meta.dir, "../components/MobileSourceSettingsCard.tsx"), "utf8");
    expect(source).toContain("padding: MOBILE_SETTINGS_GROUP_INSET");
    expect(source.match(/mobileDesignExploreFlag \? MOBILE_SETTINGS_CONTROL_RADIUS : radius.md/g)?.length).toBe(4);
    const metadata = readFileSync(path.join(import.meta.dir, "../components/MobileMetadataEditorExploreForm.tsx"), "utf8");
    expect(metadata).toContain("const ROW_INSET = MOBILE_SETTINGS_GROUP_INSET");
    expect(metadata).toContain("const MARK_RADIUS = MOBILE_SETTINGS_CONTROL_RADIUS");
  });

  test("the explore surfaces use the scale, not loose numbers", () => {
    const dir = path.join(import.meta.dir, "../components/explore");
    const loose: string[] = [];
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".tsx")) continue;
      readFileSync(path.join(dir, file), "utf8")
        .split("\n")
        .forEach((line, index) => {
          // Round dots are written as half their size (`8 / 2`), corners from the scale.
          if (/borderRadius: \d+(\.\d+)?,/.test(line)) loose.push(`${file}:${index + 1}`);
        });
    }
    expect(loose).toEqual([]);
  });
});
