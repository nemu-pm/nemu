import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useState } from "react";
import type { ImageSourcePropType } from "react-native";
import { mobileReaderGlyphKey, type MobileReaderChromeGlyph } from "@/lib/mobileReaderBarIcons";

type GlyphImage = ImageSourcePropType;

// Rendered once per glyph and size for the app's lifetime: the images are
// template masks (the bar tints them), so the colour never matters.
const rendered = new Map<string, GlyphImage>();
const pending = new Map<string, Promise<GlyphImage | null>>();

function renderGlyph(glyph: MobileReaderChromeGlyph): Promise<GlyphImage | null> {
  const key = mobileReaderGlyphKey(glyph);
  const done = rendered.get(key);
  if (done) return Promise.resolve(done);
  let job = pending.get(key);
  if (!job) {
    job = Ionicons.getImageSource(glyph.name, glyph.size, "#ffffff")
      .then((source) => {
        if (source) rendered.set(key, source);
        return source ?? null;
      })
      .catch(() => null)
      .finally(() => pending.delete(key));
    pending.set(key, job);
  }
  return job;
}

/** Start rendering glyphs ahead of time (e.g. when the reader opens). */
export function preloadReaderBarIconImages(glyphs: readonly MobileReaderChromeGlyph[]): void {
  for (const glyph of glyphs) void renderGlyph(glyph);
}

/**
 * Template images of the reader's Ionicons for native toolbar items (the
 * iPhone Duo vertical bar). Returns null until every glyph is ready, so the
 * bar never shows a mix of placeholder and final glyphs.
 */
export function useReaderBarIconImages<K extends string>(
  glyphs: Record<K, MobileReaderChromeGlyph>,
  enabled: boolean,
): Record<K, GlyphImage> | null {
  const signature = Object.values<MobileReaderChromeGlyph>(glyphs).map(mobileReaderGlyphKey).join("|");
  const collect = (): Record<K, GlyphImage> | null => {
    const out = {} as Record<K, GlyphImage>;
    for (const [id, glyph] of Object.entries(glyphs) as [K, MobileReaderChromeGlyph][]) {
      const image = rendered.get(mobileReaderGlyphKey(glyph));
      if (!image) return null;
      out[id] = image;
    }
    return out;
  };
  // Bumped when a render finishes; the images themselves live in the cache.
  const [, setVersion] = useState(0);
  useEffect(() => {
    if (!enabled || collect()) return;
    let live = true;
    void Promise.all(Object.values<MobileReaderChromeGlyph>(glyphs).map(renderGlyph)).then(() => {
      if (live) setVersion((version) => version + 1);
    });
    return () => {
      live = false;
    };
    // `signature` captures every glyph; the record itself is rebuilt each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, signature]);
  return enabled ? collect() : null;
}
