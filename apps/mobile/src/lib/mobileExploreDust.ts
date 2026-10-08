/**
 * Particle maths for the "turns to dust" moment when a title leaves the
 * library (design-explore). The removed cover is cut into a grid of small
 * squares; a release front sweeps across it from the leading edge, and each
 * square, once released, drifts off on its own path (a random direction plus
 * a light upward, trailing wind), shrinking away near the end of its life.
 * Squares the front has not reached yet stay in place, so the cover looks
 * intact until the sweep passes.
 *
 * Motion is closed-form (no per-frame integration), so a frame can be drawn
 * for any time and the renderer stays a plain loop over typed arrays.
 */

/** Values per particle in the packed array. */
export const MOBILE_DUST_STRIDE = 7;
const BASE_X = 0;
const BASE_Y = 1;
const VELOCITY_X = 2;
const VELOCITY_Y = 3;
const RELEASE = 4;
const LIFE = 5;
const SPIN = 6;

export const MOBILE_DUST = {
  /** Upper bound on squares, whatever the cover's size (keeps a frame cheap). */
  maxParticles: 2600,
  /** Smallest square edge, in points. */
  minCell: 2,
  /** The release front crosses the cover in this time (s). */
  sweep: 0.62,
  /** Random extra wait per square, so the front is ragged rather than a ruled line (s). */
  jitter: 0.14,
  /** Launch speed range (pt/s), in a random direction. */
  speed: [70, 170] as const,
  /** Steady wind added to every square (pt/s): trailing and rising. */
  wind: { x: 46, y: -40 },
  /** Constant acceleration (pt/s²): the dust lifts as it goes. */
  lift: { x: 24, y: -230 },
  /** A released square reaches full speed over about this time (s). */
  ramp: 0.12,
  /** Lifetime range after release (s). */
  life: [0.75, 1.4] as const,
  /** Squares start shrinking after this share of their life. */
  shrinkFrom: 0.5,
  /** Spin range (rad/s), either way. */
  spin: 4,
} as const;

/** How long a run lasts from the first frame to the last square gone (s). */
export const MOBILE_DUST_DURATION_S =
  MOBILE_DUST.sweep + MOBILE_DUST.jitter + MOBILE_DUST.life[1];

/**
 * The square grid for a view of this size: as fine as `minCell` allows,
 * coarser when that would exceed `maxParticles`.
 */
export function getMobileDustGrid(
  width: number,
  height: number,
  maxParticles: number = MOBILE_DUST.maxParticles,
): { columns: number; rows: number; cell: number } {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const cell = Math.max(MOBILE_DUST.minCell, Math.sqrt((w * h) / Math.max(1, maxParticles)));
  // Round up so the squares cover the whole view (the last ones overhang a little).
  const columns = Math.max(1, Math.ceil(w / cell));
  const rows = Math.max(1, Math.ceil(h / cell));
  return { columns, rows, cell };
}

/** Small deterministic generator (mulberry32), so a run is reproducible in tests. */
export function mobileDustRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * One packed particle per square: base position (its top-left corner in the
 * view), launch velocity, release time, lifetime and spin. `direction` 1 sweeps
 * from the left edge (the reading direction of the page), -1 from the right.
 */
export function createMobileDustParticles(
  columns: number,
  rows: number,
  cell: number,
  seed = 1,
  direction: 1 | -1 = 1,
): Float32Array {
  const random = mobileDustRandom(seed);
  const particles = new Float32Array(columns * rows * MOBILE_DUST_STRIDE);
  const [minSpeed, maxSpeed] = MOBILE_DUST.speed;
  const [minLife, maxLife] = MOBILE_DUST.life;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const index = (row * columns + column) * MOBILE_DUST_STRIDE;
      const across = columns > 1 ? column / (columns - 1) : 0;
      const up = rows > 1 ? 1 - row / (rows - 1) : 0;
      const from = direction === 1 ? across : 1 - across;
      const angle = random() * Math.PI * 2;
      const speed = minSpeed + random() * (maxSpeed - minSpeed);
      particles[index + BASE_X] = column * cell;
      particles[index + BASE_Y] = row * cell;
      particles[index + VELOCITY_X] = Math.cos(angle) * speed + MOBILE_DUST.wind.x * direction;
      particles[index + VELOCITY_Y] = Math.sin(angle) * speed + MOBILE_DUST.wind.y;
      // Mostly across, a little from the bottom up, so the front leans.
      particles[index + RELEASE] =
        MOBILE_DUST.sweep * (0.86 * from + 0.14 * up) + random() * MOBILE_DUST.jitter;
      particles[index + LIFE] = minLife + random() * (maxLife - minLife);
      particles[index + SPIN] = (random() * 2 - 1) * MOBILE_DUST.spin;
    }
  }
  return particles;
}
