export type GlassSurfaceRenderMode = "blur-view" | "native-view";

/** SwiftUI `glassEffect` shapes `GlassSurface` can resolve to. */
export type GlassSurfaceGlassShape = "capsule" | "roundedRectangle";

/**
 * Tint alpha for the Liquid Glass path. The material already supplies the
 * blur/refraction, so the tint is only a hint of the app background — a heavier
 * fill (the `tabGlass` 0.74/0.8 the BlurView path needs) reads as a flat bar.
 */
export const GLASS_SURFACE_LIQUID_TINT_ALPHA = 0.35;

export function getGlassSurfaceRenderMode(
  platform: string,
): GlassSurfaceRenderMode {
  return platform === "android" ? "native-view" : "blur-view";
}

/**
 * A corner radius at or past half the surface height is a pill, and SwiftUI's
 * `capsule` tracks that shape exactly as the surface grows. Anything shorter
 * keeps its own rounded rectangle so cards do not get over-rounded.
 */
export function resolveGlassSurfaceShape({
  cornerRadius,
  height,
}: {
  cornerRadius: number;
  height?: number | null;
}): GlassSurfaceGlassShape {
  if (
    Number.isFinite(cornerRadius) &&
    typeof height === "number" &&
    Number.isFinite(height) &&
    height > 0 &&
    cornerRadius * 2 >= height
  ) {
    return "capsule";
  }
  return "roundedRectangle";
}

/**
 * Derives the Liquid Glass tint from a token color. Hex tokens (`#f8fafe`) are
 * expanded to `rgba()` at the tint alpha; colors that already carry their own
 * alpha are passed through untouched.
 */
export function glassSurfaceLiquidTint(
  color: string,
  alpha: number = GLASS_SURFACE_LIQUID_TINT_ALPHA,
): string {
  const hex = color.trim();
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
  if (!match) return hex;

  const digits = match[1];
  const pairs =
    digits.length === 3
      ? Array.from(digits, (digit) => `${digit}${digit}`)
      : [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 6)];
  const [r, g, b] = pairs.map((pair) => Number.parseInt(pair, 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
