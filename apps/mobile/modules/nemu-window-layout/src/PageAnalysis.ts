import { requireOptionalNativeModule } from "expo-modules-core";
import { Platform } from "react-native";

/** What the native analyzer measures on one page file (see `NemuPageAnalysis.swift`). */
export type NativePageAnalysis = {
  /** Pixel size of the image, orientation applied. */
  width: number;
  height: number;
  /** Blank margin at the left / right edge, as a fraction of the width. */
  marginL: number;
  marginR: number;
  /** Mean brightness (0–1) of the outermost columns, in 48 bins top to bottom. */
  edgeL: number[];
  edgeR: number[];
  /** Mean colour of the page's outer border, `#rrggbb`. */
  edgeColor: string;
  /** Share of pixels whose colour differs from the page's median tint (0 = black and white). */
  chroma?: number;
};

type NativeModule = {
  analyzePage?: (uri: string) => Promise<NativePageAnalysis | null>;
};

const nativeModule = Platform.OS === "ios"
  ? requireOptionalNativeModule<NativeModule>("NemuWindowLayout")
  : null;

/** Whether this binary can analyze pages (iOS builds with the analyzer). */
export function pageAnalysisAvailable(): boolean {
  return typeof nativeModule?.analyzePage === "function";
}

/**
 * Measures one local page file off the main thread. `null` on Android, web,
 * older binaries and files the analyzer cannot read.
 */
export async function analyzePageFile(uri: string): Promise<NativePageAnalysis | null> {
  if (!nativeModule?.analyzePage) return null;
  try {
    return (await nativeModule.analyzePage(uri)) ?? null;
  } catch {
    return null;
  }
}
