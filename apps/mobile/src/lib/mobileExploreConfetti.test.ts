import { describe, expect, test } from "bun:test";
import {
  createMobileConfetti,
  getMobileConfettiFrame,
  MOBILE_CONFETTI,
  MOBILE_CONFETTI_DURATION_S,
  MOBILE_CONFETTI_TERMINAL,
} from "./mobileExploreConfetti";

describe("mobile confetti", () => {
  test("pieces go up first, then fall back, and are gone by the end", () => {
    const pieces = createMobileConfetti(4, 3);
    expect(pieces).toHaveLength(MOBILE_CONFETTI.count);
    let peakMean = 0;
    for (const piece of pieces) {
      expect(piece.vy).toBeLessThan(0);
      expect(piece.color).toBeLessThan(3);
      const early = getMobileConfettiFrame(piece, 0.2);
      peakMean += early.y / pieces.length;
      const late = getMobileConfettiFrame(piece, piece.life * 0.95);
      expect(late.y).toBeGreaterThan(early.y);
      expect(getMobileConfettiFrame(piece, MOBILE_CONFETTI_DURATION_S).opacity).toBe(0);
    }
    // Clearly visible: the cloud rises well above the pill.
    expect(peakMean).toBeLessThan(-60);
  });

  test("paper falls gently: never faster than the terminal fall once the launch has bled off", () => {
    for (const piece of createMobileConfetti(11, 2)) {
      const dt = 0.01;
      for (let t = 0.9; t + dt < piece.life; t += 0.1) {
        const speed = (getMobileConfettiFrame(piece, t + dt).y - getMobileConfettiFrame(piece, t).y) / dt;
        expect(speed).toBeLessThanOrEqual(MOBILE_CONFETTI_TERMINAL * 1.02);
      }
    }
    // A fall a person can follow: a few hundred points a second, not a drop.
    expect(MOBILE_CONFETTI_TERMINAL).toBeGreaterThan(250);
    expect(MOBILE_CONFETTI_TERMINAL).toBeLessThan(450);
  });

  test("pieces turn over in depth (both faces show) and sway as they fall", () => {
    const pieces = createMobileConfetti(5, 2);
    let turned = 0;
    let swayed = 0;
    for (const piece of pieces) {
      const turns = Array.from({ length: 40 }, (_, i) => getMobileConfettiFrame(piece, (piece.life * i) / 41).turn);
      if (turns.some((turn) => turn > 0.5) && turns.some((turn) => turn < -0.5)) turned += 1;
      const late = getMobileConfettiFrame(piece, 1.2).x - piece.vx * (1 - Math.exp(-MOBILE_CONFETTI.drag * 1.2)) / MOBILE_CONFETTI.drag;
      if (Math.abs(late) > 2) swayed += 1;
    }
    expect(turned / pieces.length).toBeGreaterThan(0.9);
    expect(swayed / pieces.length).toBeGreaterThan(0.6);
  });

  test("three depths, drawn far to near, with varied sizes and shapes", () => {
    const pieces = createMobileConfetti(7, 4);
    expect(new Set(pieces.map((piece) => piece.depth)).size).toBe(3);
    expect(new Set(pieces.map((piece) => piece.shape)).size).toBe(3);
    for (let i = 1; i < pieces.length; i += 1) expect(pieces[i]!.depth).toBeGreaterThanOrEqual(pieces[i - 1]!.depth);
    const sizes = pieces.map((piece) => piece.width);
    expect(Math.max(...sizes) / Math.min(...sizes)).toBeGreaterThan(2);
  });

  test("fully opaque for most of the flight, fading only at the end", () => {
    const [piece] = createMobileConfetti(9, 1);
    expect(getMobileConfettiFrame(piece!, piece!.life * 0.5).opacity).toBe(1);
    expect(getMobileConfettiFrame(piece!, piece!.life * 0.95).opacity).toBeLessThan(0.5);
  });

  test("the same seed gives the same burst", () => {
    expect(createMobileConfetti(2, 4)).toEqual(createMobileConfetti(2, 4));
  });
});
