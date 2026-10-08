import { describe, expect, test } from "bun:test";
import { concentricMobileExploreRadius, MOBILE_EXPLORE_RADIUS } from "./mobileExploreRadius";

describe("design-explore corner scale", () => {
  test("a nested corner is its container's radius less the inset between them, square when the inset swallows it", () => {
    expect(concentricMobileExploreRadius(MOBILE_EXPLORE_RADIUS.card, 16)).toBe(10);
    expect(concentricMobileExploreRadius(MOBILE_EXPLORE_RADIUS.group, 18)).toBe(2);
    expect(concentricMobileExploreRadius(MOBILE_EXPLORE_RADIUS.group, 24)).toBe(0);
    expect(concentricMobileExploreRadius(10, -4)).toBe(10);
  });
});
