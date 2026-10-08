import { describe, expect, test } from "bun:test";
import {
  createMobileDustParticles,
  getMobileDustFrame,
  getMobileDustGrid,
  MOBILE_DUST,
  MOBILE_DUST_DURATION_S,
  MOBILE_DUST_STRIDE,
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

  test("the front sweeps from the leading edge, squares stay whole until released", () => {
    const { columns, rows, cell } = getMobileDustGrid(118, 177);
    const particles = createMobileDustParticles(columns, rows, cell, 7);
    const release = (column: number, row: number) => particles[(row * columns + column) * MOBILE_DUST_STRIDE + 4]!;
    let leftMean = 0;
    let rightMean = 0;
    for (let row = 0; row < rows; row += 1) {
      leftMean += release(0, row) / rows;
      rightMean += release(columns - 1, row) / rows;
    }
    expect(rightMean - leftMean).toBeGreaterThan(MOBILE_DUST.sweep * 0.7);
    // Before its release a square is drawn intact where it was.
    expect(getMobileDustFrame(particles, columns - 1, 0)).toEqual({ x: 0, y: 0, scale: 1, rotation: 0 });
    // Mirrored for a right-to-left sweep.
    const mirrored = createMobileDustParticles(columns, rows, cell, 7, -1);
    const releaseMirrored = (column: number) => mirrored[column * MOBILE_DUST_STRIDE + 4]!;
    expect(releaseMirrored(0)).toBeGreaterThan(releaseMirrored(columns - 1));
  });

  test("released dust rises and is gone by the end of the run", () => {
    const { columns, rows, cell } = getMobileDustGrid(118, 177);
    const particles = createMobileDustParticles(columns, rows, cell, 3);
    const count = columns * rows;
    let rise = 0;
    for (let index = 0; index < count; index += 1) {
      const frame = getMobileDustFrame(particles, index, MOBILE_DUST.sweep + MOBILE_DUST.jitter + 0.4);
      rise += frame.y / count;
      expect(getMobileDustFrame(particles, index, MOBILE_DUST_DURATION_S).scale).toBe(0);
    }
    expect(rise).toBeLessThan(-25);
    // Clearly visible travel at normal speed: half a second after release a
    // square has moved tens of points, not a hairline.
    const frame = getMobileDustFrame(particles, 0, particles[4]! + 0.5);
    expect(Math.hypot(frame.x, frame.y)).toBeGreaterThan(30);
  });

  test("motion starts from rest and squares shrink only late in life", () => {
    const particles = createMobileDustParticles(1, 1, 2, 11);
    const release = particles[4]!;
    const life = particles[5]!;
    const early = getMobileDustFrame(particles, 0, release + 0.004);
    expect(Math.hypot(early.x, early.y)).toBeLessThan(0.1);
    expect(getMobileDustFrame(particles, 0, release + life * 0.4).scale).toBe(1);
    expect(getMobileDustFrame(particles, 0, release + life * 0.9).scale).toBeLessThan(0.1);
  });

  test("the same seed gives the same run", () => {
    expect(createMobileDustParticles(10, 12, 3, 5)).toEqual(createMobileDustParticles(10, 12, 3, 5));
  });
});
