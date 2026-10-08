import { describe, expect, test } from "bun:test";
import {
  createMobileConfetti,
  getMobileConfettiFrame,
  MOBILE_CONFETTI,
  MOBILE_CONFETTI_DURATION_S,
  MOBILE_CONFETTI_TERMINAL,
} from "./mobileExploreConfetti";

describe("mobile confetti", () => {
  test("pieces rise, then fall, never faster than the terminal fall, and are gone by the end", () => {
    const pieces = createMobileConfetti(4, 3);
    expect(pieces).toHaveLength(MOBILE_CONFETTI.count);
    for (const piece of pieces) {
      expect(piece.vy).toBeLessThan(0);
      expect(getMobileConfettiFrame(piece, piece.life * 0.95).y).toBeGreaterThan(getMobileConfettiFrame(piece, 0.2).y);
      expect(getMobileConfettiFrame(piece, MOBILE_CONFETTI_DURATION_S).opacity).toBe(0);
      const dt = 0.01;
      for (let t = 0.9; t + dt < piece.life; t += 0.1) {
        const speed = (getMobileConfettiFrame(piece, t + dt).y - getMobileConfettiFrame(piece, t).y) / dt;
        expect(speed).toBeLessThanOrEqual(MOBILE_CONFETTI_TERMINAL * 1.02);
      }
    }
  });

  test("pieces turn over in depth and sway as they fall, opaque for most of the flight", () => {
    const pieces = createMobileConfetti(5, 2);
    const turned = pieces.filter((piece) => {
      const turns = Array.from({ length: 40 }, (_, i) => getMobileConfettiFrame(piece, (piece.life * i) / 41).turn);
      return turns.some((turn) => turn > 0.5) && turns.some((turn) => turn < -0.5);
    });
    expect(turned.length / pieces.length).toBeGreaterThan(0.9);
    const [piece] = createMobileConfetti(9, 1);
    expect(getMobileConfettiFrame(piece!, piece!.life * 0.5).opacity).toBe(1);
    expect(createMobileConfetti(2, 4)).toEqual(createMobileConfetti(2, 4));
  });
});
