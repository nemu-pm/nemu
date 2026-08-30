export const IOS_LIQUID_GLASS_MIN_VERSION = 26;

/**
 * Glass tints aligned with web `.reader-ui-panel` in `src/index.css`:
 * light `oklch(0.98 0 0 / 0.88)`, dark `oklch(0.14 0 0 / 0.85)`.
 * The native `glassEffect` material adds blur/saturation on top; these alphas
 * keep chrome legible over black letterboxing without painting a flat opaque bar.
 */
export const READER_CHROME_GLASS_TINT = {
  dark: "rgba(36, 36, 36, 0.84)",
  light: "rgba(250, 250, 250, 0.88)",
} as const;

export const READER_CHROME_GLASS_BORDER = {
  dark: "rgba(255, 255, 255, 0.18)",
  light: "rgba(0, 0, 0, 0.12)",
} as const;

export const READER_CHROME_GLASS_SHADOW = {
  dark: "rgba(0, 0, 0, 0.55)",
  light: "rgba(0, 0, 0, 0.22)",
} as const;

export function supportsIosLiquidGlass(
  platformOS: string,
  platformVersion: string | number,
): boolean {
  if (platformOS !== "ios") {
    return false;
  }

  const version =
    typeof platformVersion === "string"
      ? Number.parseInt(platformVersion, 10)
      : platformVersion;

  return Number.isFinite(version) && version >= IOS_LIQUID_GLASS_MIN_VERSION;
}

/**
 * Keep each reader chrome surface in the React Native view tree in landscape.
 * Two independent SwiftUI hosts can retain opposite interface transforms while
 * iOS rotates the reader, leaving the header and scrubber 180 degrees apart.
 * The plain panel already matches the web/default reader chrome and rotates as
 * one surface with the rest of the React Native hierarchy.
 */
export function shouldUseIosReaderLiquidGlass({
  platformOS,
  platformVersion,
  width,
  height,
}: {
  platformOS: string;
  platformVersion: string | number;
  width: number;
  height: number;
}): boolean {
  return (
    supportsIosLiquidGlass(platformOS, platformVersion) &&
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width > 0 &&
    height > 0 &&
    width <= height
  );
}

export function readerChromeGlassTint(scheme: "light" | "dark"): string {
  return READER_CHROME_GLASS_TINT[scheme];
}

export function readerChromeGlassBorderColor(
  scheme: "light" | "dark",
  fallbackBorderColor: string,
): string {
  return scheme === "dark"
    ? READER_CHROME_GLASS_BORDER.dark
    : fallbackBorderColor || READER_CHROME_GLASS_BORDER.light;
}

export function readerChromeGlassShadowColor(scheme: "light" | "dark"): string {
  return READER_CHROME_GLASS_SHADOW[scheme];
}
