import { describe, expect, test } from "bun:test";
import { getMobileExploreSkeletonCardHeight } from "./mobileExploreSkeleton";

describe("library skeleton card", () => {
  test("stands as tall as the card that replaces it", () => {
    // The Air's resting tall card: 252 × 466.
    expect(getMobileExploreSkeletonCardHeight(252, "tall")).toBe(466);
    expect(getMobileExploreSkeletonCardHeight(400, "wide")).toBe(200);
    expect(getMobileExploreSkeletonCardHeight(0, "tall")).toBe(0);
  });
});
