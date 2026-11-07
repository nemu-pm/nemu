const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const RGB_COLOR_PATTERN = /^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*(?:,\s*(\d*\.?\d+)\s*)?\)$/i;

/**
 * Returns `hex` as an rgba() string with the given alpha. Scroll-edge fades
 * must derive from the theme background token so palette changes can never
 * produce a color seam at the fade edge. An rgb()/rgba() colour (the cover
 * tint's palette) keeps its channels and scales its own alpha, so a track
 * drawn from it stays faint instead of coming back opaque.
 */
export function nemuColorWithAlpha(hex: string, alpha: number): string {
  const boundedAlpha = Math.min(1, Math.max(0, alpha));
  const rgb = RGB_COLOR_PATTERN.exec(hex);
  if (rgb) {
    const own = rgb[4] === undefined ? 1 : Math.min(1, Math.max(0, Number(rgb[4])));
    return `rgba(${rgb[1]},${rgb[2]},${rgb[3]},${Math.round(own * boundedAlpha * 1000) / 1000})`;
  }
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

  return `rgba(${red},${green},${blue},${boundedAlpha})`;
}
