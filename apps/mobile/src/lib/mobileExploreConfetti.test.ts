import { describe, expect, test } from "bun:test";
import { createMobileConfetti, getMobileConfettiFrame, MOBILE_CONFETTI_DURATION_S, MOBILE_CONFETTI_TERMINAL } from "./mobileExploreConfetti";

describe("mobile confetti", () => {
  test("pieces rise, then fall no faster than the terminal fall, and are gone by the end; the same seed gives the same burst", () => {
    const pieces = createMobileConfetti(4, 3);
    for (const piece of pieces) {
      expect(piece.vy).toBeLessThan(0);
      expect(getMobileConfettiFrame(piece, piece.life * 0.95).y).toBeGreaterThan(getMobileConfettiFrame(piece, 0.2).y);
      expect(getMobileConfettiFrame(piece, MOBILE_CONFETTI_DURATION_S).opacity).toBe(0);
      for (let t = 0.9; t + 0.01 < piece.life; t += 0.1) {
        const speed = (getMobileConfettiFrame(piece, t + 0.01).y - getMobileConfettiFrame(piece, t).y) / 0.01;
        expect(speed).toBeLessThanOrEqual(MOBILE_CONFETTI_TERMINAL * 1.02);
      }
    }
    expect(createMobileConfetti(2, 4)).toEqual(createMobileConfetti(2, 4));
  });
});
