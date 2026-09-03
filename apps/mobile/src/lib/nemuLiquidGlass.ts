/**
 * iOS reports `Platform.Version` as a string ("26.5"), so a numeric comparison
 * against the whole value is unreliable. Parse the major component instead.
 */
export function supportsNemuLiquidGlassButtonStyle(
  version: string | number | null | undefined,
): boolean {
  const major = Number.parseInt(String(version ?? "").split(".")[0] ?? "", 10);
  return Number.isFinite(major) && major >= 26;
}
