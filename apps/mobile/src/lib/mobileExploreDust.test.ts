import { describe, expect, test } from "bun:test";
import {
  createMobileDustParticles,
  getMobileDustGrid,
  MOBILE_DUST,
} from "./mobileExploreDust";

describe("mobile dust", () => {
  test("the grid covers the view and stays under the particle cap", () => {
    for (const [width, height] of [
      [118, 177],
      [302, 478],
      [40, 60],
      [1, 1],
    ] as const) {
      const { columns, rows, cell } = getMobileDustGrid(width, height);
      expect(columns * cell).toBeGreaterThanOrEqual(width);
      expect(rows * cell).toBeGreaterThanOrEqual(height);
      expect(cell).toBeGreaterThanOrEqual(MOBILE_DUST.minCell);
      // Rounding up adds at most one row and one column over the cap's share.
      expect(columns * rows).toBeLessThanOrEqual(MOBILE_DUST.maxParticles + columns + rows + 1);
    }
    // A shelf cover gets fine squares; a whole card coarser ones.
    expect(getMobileDustGrid(118, 177).cell).toBeLessThan(getMobileDustGrid(302, 478).cell);
  });

  test("the same seed gives the same run", () => {
    expect(createMobileDustParticles(10, 12, 3, 5)).toEqual(createMobileDustParticles(10, 12, 3, 5));
  });
});
