/**
 * How a short label with a number in it turns over like an odometer
 * (design-explore): "130 new" → "129 new", "Ch.1" → "Ch.2", "99+" → "100".
 *
 * The label's first number is the one that turns. Its digits are lined up by
 * place (ones under ones), and each place spins through every digit between
 * the old and the new value, as a mechanical counter would: 99 → 100 turns
 * the ones and the tens over once and brings a hundreds digit in. A place
 * whose digit did not change still turns if a lower place carried into it
 * (129 → 131: the tens move 2 → 3). Long jumps are capped, so a column never
 * spins for more than about one and a half turns. Text around the number
 * stays put; a label without a number (or whose text around the number
 * changed) has no plan and simply swaps.
 */

export type MobileOdometerColumn = {
  /** Place value: 0 ones, 1 tens… */
  place: number;
  /**
   * Digits the column shows from top to bottom while it turns: the first is
   * on screen before, the last after. One entry: the column does not move.
   * `null` is an empty slot (a digit appearing or going away).
   */
  strip: Array<number | null>;
  /** 1: the strip moves up (the number grew), -1: down. */
  direction: 1 | -1;
};

export type MobileOdometerPlan = {
  prefix: string;
  suffix: string;
  /** Most significant place first, as the columns sit on screen. */
  columns: MobileOdometerColumn[];
};

/** A column turns over at most this many digits (one and a half turns). */
export const MOBILE_ODOMETER_MAX_STEPS = 15;

const NUMBER = /\d+/;

function splitNumber(value: string): { prefix: string; digits: string; suffix: string } | null {
  const match = NUMBER.exec(value);
  if (!match) return null;
  return {
    prefix: value.slice(0, match.index),
    digits: match[0],
    suffix: value.slice(match.index + match[0].length),
  };
}

/**
 * The turn from `previous` to `next`, or null when there is nothing to turn
 * (same text, no number, or the words around the number changed).
 */
export function getMobileOdometerPlan(previous: string, next: string): MobileOdometerPlan | null {
  if (previous === next) return null;
  const a = splitNumber(previous);
  const b = splitNumber(next);
  if (!a || !b || a.prefix !== b.prefix || a.suffix !== b.suffix) return null;
  const from = Number(a.digits);
  const to = Number(b.digits);
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from === to) return null;
  const direction: 1 | -1 = to > from ? 1 : -1;
  const places = Math.max(a.digits.length, b.digits.length);
  const columns: MobileOdometerColumn[] = [];
  for (let place = places - 1; place >= 0; place -= 1) {
    const unit = 10 ** place;
    const fromHere = Math.floor(from / unit);
    const toHere = Math.floor(to / unit);
    // A digit exists at this place before / after (no leading zeros).
    const hadDigit = place < a.digits.length;
    const hasDigit = place < b.digits.length;
    const fromDigit = hadDigit ? fromHere % 10 : null;
    const toDigit = hasDigit ? toHere % 10 : null;
    let steps = Math.abs(toHere - fromHere);
    if (steps === 0) {
      columns.push({ place, strip: [toDigit], direction });
      continue;
    }
    // Long jumps: keep the last turn and a half, ending on the right digit.
    if (steps > MOBILE_ODOMETER_MAX_STEPS) {
      steps = MOBILE_ODOMETER_MAX_STEPS - ((MOBILE_ODOMETER_MAX_STEPS - steps) % 10 + 10) % 10;
    }
    const strip: Array<number | null> = [];
    const start = toHere - direction * steps;
    for (let step = 0; step <= steps; step += 1) {
      const value = start + direction * step;
      strip.push((((value % 10) + 10) % 10) as number);
    }
    // Leading places that appear or vanish start or end on an empty slot.
    if (!hadDigit) strip[0] = null;
    else strip[0] = fromDigit;
    if (!hasDigit) strip[strip.length - 1] = null;
    else strip[strip.length - 1] = toDigit;
    columns.push({ place, strip, direction });
  }
  return { prefix: b.prefix, suffix: b.suffix, columns };
}

/**
 * Timing of one column's turn (ms): longer strips spin longer, and higher
 * places start a little later and run a little longer, so the counter reads
 * as one mechanism with the ones leading.
 */
export function getMobileOdometerTiming(
  column: MobileOdometerColumn,
): { delay: number; duration: number } {
  const steps = column.strip.length - 1;
  if (steps <= 0) return { delay: 0, duration: 0 };
  return {
    delay: column.place * 70,
    duration: Math.round(520 + Math.min(steps, MOBILE_ODOMETER_MAX_STEPS) * 46 + column.place * 60),
  };
}
