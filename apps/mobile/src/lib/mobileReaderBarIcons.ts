import type Ionicons from "@expo/vector-icons/Ionicons";

type IoniconName = keyof typeof Ionicons.glyphMap;

/**
 * The reader chrome's glyphs, shared by the horizontal capsules (Ionicons
 * drawn by React Native) and the iPhone Duo system vertical bar (the same
 * Ionicons rendered to template images for `Stack.Toolbar.Button`), so the
 * two chromes can never drift apart. Sizes are the capsule's point sizes.
 */
export const MOBILE_READER_CHROME_GLYPHS = {
  back: { name: "chevron-back-outline", size: 22 },
  detectText: { name: "scan-outline", size: 18 },
  nemuChat: { name: "chatbubbles-outline", size: 18 },
  settings: { name: "settings-outline", size: 20 },
} as const satisfies Record<string, MobileReaderChromeGlyph>;

/** A plugin action's glyph (the plugin's own Ionicon) at the capsule's action size. */
export function mobileReaderPluginGlyph(icon: IoniconName): MobileReaderChromeGlyph {
  return { name: icon, size: MOBILE_READER_CHROME_GLYPHS.detectText.size };
}

export type MobileReaderChromeGlyph = { name: IoniconName; size: number };

/** Stable cache key for a rendered glyph image. */
export function mobileReaderGlyphKey(glyph: MobileReaderChromeGlyph): string {
  return `${glyph.name}@${glyph.size}`;
}
