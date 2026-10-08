import { mobileDustRandom } from "./mobileExploreDust";

/**
 * The burst when a title joins the library (design-explore): paper confetti
 * in the cover's colours thrown up from the In Library pill. Each piece is a
 * flat bit of paper: it turns over in depth (its height follows the cosine of
 * the flip, and its back face is a shade darker), spins in the plane, and air
 * drag slows it to a gentle terminal fall while it sways from side to side,
 * the way paper does once it has lost its launch speed. Pieces come in three
 * depths (smaller and dimmer far ones, larger near ones) so the cloud has
 * volume. Closed-form like the dust, so a frame can be drawn for any time.
 */

export const MOBILE_CONFETTI = {
  count: 90,
  /** Pieces leave within this cone around straight up (rad, each side). */
  spread: 1.05,
  /** Launch speed range (pt/s). */
  speed: [420, 900] as const,
  /** Gravity (pt/s²), down. */
  gravity: 1100,
  /** Air drag (1/s): velocity relaxes toward the terminal fall as e^(−drag·t). */
  drag: 3.2,
  /** Lifetime range (s); pieces fade over their last fifth. */
  life: [1.7, 2.5] as const,
  /** Piece size range (pt) at the middle depth. */
  length: [8, 15] as const,
  width: [4.5, 8] as const,
  /** In-plane spin (rad/s, either way) and the turn in depth (turns per second). */
  spin: 6,
  flip: [1.4, 4.2] as const,
  /** Side-to-side sway once the launch has bled off (pt, Hz). */
  sway: [6, 20] as const,
  swayRate: [0.9, 2] as const,
  /** Size by depth: far, middle, near. */
  depth: [0.72, 1, 1.28] as const,
  /** Shares of shapes: long strips, squares, the rest small discs. */
  strips: 0.55,
  squares: 0.3,
} as const;

export const MOBILE_CONFETTI_DURATION_S = MOBILE_CONFETTI.life[1];

/** Terminal fall speed (pt/s): gravity balanced by drag. */
export const MOBILE_CONFETTI_TERMINAL = MOBILE_CONFETTI.gravity / MOBILE_CONFETTI.drag;

export type MobileConfettiShape = "strip" | "square" | "disc";

export type MobileConfettiPiece = {
  /** Launch velocity (pt/s). */
  vx: number;
  vy: number;
  life: number;
  length: number;
  width: number;
  shape: MobileConfettiShape;
  /** In-plane angle at launch and spin (rad, rad/s). */
  angle: number;
  spin: number;
  /** Turns over in depth per second, and where in the turn it starts. */
  flip: number;
  phase: number;
  sway: number;
  swayRate: number;
  swayPhase: number;
  /** 0 far, 1 middle, 2 near. */
  depth: 0 | 1 | 2;
  /** Index into the colour list. */
  color: number;
  /** Launch spot along the pill (−0.5…0.5 of its width). */
  origin: number;
};

export function createMobileConfetti(seed: number, colorCount: number): MobileConfettiPiece[] {
  const random = mobileDustRandom(seed);
  const range = (pair: readonly [number, number]) => pair[0] + random() * (pair[1] - pair[0]);
  const pieces: MobileConfettiPiece[] = [];
  for (let index = 0; index < MOBILE_CONFETTI.count; index += 1) {
    const direction = -Math.PI / 2 + (random() * 2 - 1) * MOBILE_CONFETTI.spread;
    const speed = range(MOBILE_CONFETTI.speed);
    const pick = random();
    const shape: MobileConfettiShape =
      pick < MOBILE_CONFETTI.strips ? "strip" : pick < MOBILE_CONFETTI.strips + MOBILE_CONFETTI.squares ? "square" : "disc";
    const depth = (Math.floor(random() * 3) % 3) as 0 | 1 | 2;
    const scale = MOBILE_CONFETTI.depth[depth];
    const width = range(MOBILE_CONFETTI.width) * scale;
    const length = shape === "strip" ? range(MOBILE_CONFETTI.length) * scale : width;
    pieces.push({
      // Far pieces leave a little slower, near ones faster (parallax).
      vx: Math.cos(direction) * speed * (0.85 + 0.15 * depth),
      vy: Math.sin(direction) * speed * (0.85 + 0.15 * depth),
      life: range(MOBILE_CONFETTI.life),
      length,
      width,
      shape,
      angle: random() * Math.PI * 2,
      spin: (random() * 2 - 1) * MOBILE_CONFETTI.spin,
      flip: range(MOBILE_CONFETTI.flip) * (random() < 0.5 ? -1 : 1),
      phase: random() * Math.PI * 2,
      sway: range(MOBILE_CONFETTI.sway),
      swayRate: range(MOBILE_CONFETTI.swayRate),
      swayPhase: random() * Math.PI * 2,
      depth,
      color: Math.floor(random() * Math.max(1, colorCount)),
      origin: random() - 0.5,
    });
  }
  // Far pieces first, so near ones are drawn over them.
  return pieces.sort((a, b) => a.depth - b.depth);
}

export type MobileConfettiFrame = {
  x: number;
  y: number;
  /** In-plane rotation (rad). */
  rotation: number;
  /** Height as the piece turns in depth: 1 face-on, 0 edge-on, negative showing its back. */
  turn: number;
  opacity: number;
};

/** Position of a piece `t` seconds after launch, relative to its launch spot. */
export function getMobileConfettiFrame(piece: MobileConfettiPiece, t: number): MobileConfettiFrame {
  if (t >= piece.life) return { x: 0, y: 0, rotation: 0, turn: 0, opacity: 0 };
  const k = MOBILE_CONFETTI.drag;
  const decay = Math.exp(-k * t);
  const travel = (1 - decay) / k;
  // Linear drag with gravity: the velocity relaxes from the launch toward
  // the terminal fall; the sway grows as the launch speed bleeds off.
  const x = piece.vx * travel + piece.sway * Math.sin(piece.swayPhase + Math.PI * 2 * piece.swayRate * t) * (1 - decay);
  const y = MOBILE_CONFETTI_TERMINAL * t + (piece.vy - MOBILE_CONFETTI_TERMINAL) * travel;
  const age = t / piece.life;
  return {
    x,
    y,
    rotation: piece.angle + piece.spin * t,
    turn: Math.cos(piece.phase + Math.PI * 2 * piece.flip * t),
    opacity: age < 0.8 ? 1 : 1 - (age - 0.8) / 0.2,
  };
}
