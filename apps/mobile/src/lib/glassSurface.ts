export type GlassSurfaceRenderMode = "blur-view" | "native-view";

export function getGlassSurfaceRenderMode(
  platform: string,
): GlassSurfaceRenderMode {
  return platform === "android" ? "native-view" : "blur-view";
}
