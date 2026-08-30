export type NemuShadowStyleOptions = {
  color: string;
  offsetX?: number;
  offsetY: number;
  radius: number;
  opacity?: number;
  elevation?: number;
  spread?: number;
};

export type NemuShadowPlatform = string;

const HEX_COLOR_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const RGB_COLOR_RE = /^rgba?\(([^)]+)\)$/i;

function toFiniteNumber(value: string): number | null {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeCssAlpha(alpha: number): number {
  return Math.max(0, Math.min(1, alpha));
}

function formatCssNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
}

function applyCssAlpha(color: string, opacity: number): string {
  const normalizedOpacity = normalizeCssAlpha(opacity);
  if (normalizedOpacity === 1) return color;

  const hexMatch = color.match(HEX_COLOR_RE);
  if (hexMatch) {
    const raw = hexMatch[1];
    const expanded =
      raw.length === 3
        ? raw
            .split("")
            .map((part) => `${part}${part}`)
            .join("")
        : raw;
    const red = Number.parseInt(expanded.slice(0, 2), 16);
    const green = Number.parseInt(expanded.slice(2, 4), 16);
    const blue = Number.parseInt(expanded.slice(4, 6), 16);
    return `rgba(${red},${green},${blue},${formatCssNumber(normalizedOpacity)})`;
  }

  const rgbMatch = color.match(RGB_COLOR_RE);
  if (rgbMatch) {
    const parts = rgbMatch[1].split(",").map((part) => part.trim());
    if (parts.length >= 3) {
      const red = toFiniteNumber(parts[0]);
      const green = toFiniteNumber(parts[1]);
      const blue = toFiniteNumber(parts[2]);
      const alpha = parts[3] ? toFiniteNumber(parts[3]) : 1;
      if (red !== null && green !== null && blue !== null && alpha !== null) {
        return `rgba(${red},${green},${blue},${formatCssNumber(
          normalizeCssAlpha(alpha * normalizedOpacity),
        )})`;
      }
    }
  }

  return `color-mix(in srgb, ${color} ${formatCssNumber(
    normalizedOpacity * 100,
  )}%, transparent)`;
}

export function createNemuShadowStyleForPlatform(
  options: NemuShadowStyleOptions,
  platform: NemuShadowPlatform,
) {
  const offsetX = options.offsetX ?? 0;
  const opacity = options.opacity ?? 1;

  if (platform === "web") {
    const spread =
      options.spread === undefined ? "" : ` ${formatCssNumber(options.spread)}px`;
    return {
      boxShadow: `${formatCssNumber(offsetX)}px ${formatCssNumber(
        options.offsetY,
      )}px ${formatCssNumber(options.radius)}px${spread} ${applyCssAlpha(
        options.color,
        opacity,
      )}`,
    };
  }

  return {
    shadowColor: options.color,
    shadowOffset: { width: offsetX, height: options.offsetY },
    shadowOpacity: opacity,
    shadowRadius: options.radius,
    elevation: options.elevation,
  };
}
