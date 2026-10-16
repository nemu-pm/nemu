import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  concentricMobileExploreRadius,
  MOBILE_EXPLORE_GROUP_SHAPE,
  MOBILE_EXPLORE_RADIUS,
  MOBILE_SHEET_GROUP_RADIUS,
} from "./mobileExploreRadius";

describe("design-explore corner scale", () => {
  test("a nested corner is its container's radius less the inset between them, square when the inset swallows it", () => {
    expect(concentricMobileExploreRadius(MOBILE_EXPLORE_RADIUS.card, 16)).toBe(10);
    expect(concentricMobileExploreRadius(MOBILE_EXPLORE_RADIUS.group, 18)).toBe(2);
    expect(concentricMobileExploreRadius(MOBILE_EXPLORE_RADIUS.group, 24)).toBe(0);
    expect(concentricMobileExploreRadius(10, -4)).toBe(10);
  });

  test("a grouped card has one shape on a page and in a sheet: the group corner, continuous", () => {
    expect(MOBILE_EXPLORE_GROUP_SHAPE).toEqual({ borderRadius: MOBILE_EXPLORE_RADIUS.group, borderCurve: "continuous" });
    expect(MOBILE_SHEET_GROUP_RADIUS).toBe(MOBILE_EXPLORE_GROUP_SHAPE.borderRadius);
  });

  test("every settings card surface takes the shared group shape in the new design", () => {
    const read = (path: string) => readFileSync(join(import.meta.dir, "..", path), "utf8");
    const settings = read("screens/SettingsScreen.tsx");
    // Both the plain and the pressable surface (menu rows, About) end on the group shape.
    expect(settings.match(/mobileDesignExploreFlag \? styles\.exploreSurface : null/g)?.length).toBe(2);
    expect(settings).toContain("exploreSurface: MOBILE_EXPLORE_GROUP_SHAPE");
    const cloud = read("components/MobileCloudSyncCard.tsx");
    // The signed-in card; a build without sync shows no card at all.
    expect(cloud.match(/mobileDesignExploreFlag \? styles\.exploreShell : null/g)?.length).toBe(1);
    for (const path of [
      "components/MobileStorageBreakdown.tsx",
      "components/MobileSourceSettingsCard.tsx",
      "components/MobileAgentStatusCard.tsx",
      "components/MobileSettingsSkeleton.tsx",
      "components/explore/ExploreSettingsGroup.tsx",
      "components/explore/ExploreSettingsActionGroup.tsx",
    ]) {
      expect(read(path)).toContain("MOBILE_EXPLORE_GROUP_SHAPE");
    }
  });
});
