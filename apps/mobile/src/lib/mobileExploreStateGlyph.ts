/**
 * Which of nemu's state glyphs (design-explore, `ExploreStateGlyph`) stands
 * for the stock symbol a state component was given, so every empty, loading
 * and error state switches over without its call site changing.
 */
export type ExploreStateGlyphKind =
  | "search"
  | "listing"
  | "source"
  | "offline"
  | "chapters"
  | "globe"
  | "error";

/** The glyph for an Ionicons name, or null to keep the symbol. */
export function exploreStateGlyphForIcon(icon: string): ExploreStateGlyphKind | null {
  if (icon.startsWith("search")) return "search";
  if (icon.startsWith("albums") || icon.startsWith("library") || icon.startsWith("grid")) return "listing";
  if (icon.startsWith("globe")) return "globe";
  if (icon.startsWith("reader") || icon.startsWith("document")) return "chapters";
  if (icon.startsWith("cloud-offline") || icon.startsWith("wifi")) return "offline";
  if (icon.startsWith("alert") || icon.startsWith("warning")) return "error";
  if (icon.startsWith("hardware-chip") || icon.startsWith("home") || icon.startsWith("extension")) return "source";
  return null;
}
