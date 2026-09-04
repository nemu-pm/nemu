export const NEMU_LIQUID_GLASS_MIN_IOS_VERSION = 26;

/**
 * iOS reports `Platform.Version` as a string ("26.5"), so a numeric comparison
 * against the whole value is unreliable. Parse the major component instead.
 */
export function supportsNemuLiquidGlassButtonStyle(
  version: string | number | null | undefined,
): boolean {
  const major = Number.parseInt(String(version ?? "").split(".")[0] ?? "", 10);
  return (
    Number.isFinite(major) && major >= NEMU_LIQUID_GLASS_MIN_IOS_VERSION
  );
}

/**
 * The one gate for system Liquid Glass (`glassEffect`) surfaces: reader chrome,
 * the toast pill, and anything that adopts it later. Android and web never get
 * the SwiftUI material and fall back to their own painted/blurred surface.
 */
export function supportsNemuLiquidGlass(
  platformOS: string,
  platformVersion: string | number | null | undefined,
): boolean {
  return (
    platformOS === "ios" && supportsNemuLiquidGlassButtonStyle(platformVersion)
  );
}
