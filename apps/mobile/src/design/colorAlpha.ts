const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Returns `hex` as an rgba() string with the given alpha. Scroll-edge fades
 * must derive from the theme background token so palette changes can never
 * produce a color seam at the fade edge.
 */
export function nemuColorWithAlpha(hex: string, alpha: number): string {
  if (!HEX_COLOR_PATTERN.test(hex)) return hex;

  let value = hex.slice(1);
  if (value.length === 3) {
    value = value
      .split("")
      .map((char) => char + char)
      .join("");
  }

  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  const boundedAlpha = Math.min(1, Math.max(0, alpha));

  return `rgba(${red},${green},${blue},${boundedAlpha})`;
}
