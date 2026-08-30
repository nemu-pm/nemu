export function shouldAnimateNemuPortraitHalo({
  appActive,
  focused,
  platform = "ios",
  reduceMotion,
}: {
  appActive: boolean;
  focused: boolean;
  platform?: string;
  reduceMotion: boolean;
}): boolean {
  // Android's Vulkan path has shown delayed black offscreen surfaces while
  // continuously transforming blurred transparent images. Keep that platform
  // static; iOS and web retain the subtle motion.
  return platform !== "android" && appActive && focused && !reduceMotion;
}

export function getNemuPortraitHaloRenderMode(
  platform: string,
): "blurred-images" | "raster-glow" {
  return platform === "android" ? "raster-glow" : "blurred-images";
}
