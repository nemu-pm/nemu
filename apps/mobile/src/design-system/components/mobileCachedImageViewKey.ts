/**
 * The React key of `MobileCachedImage`'s inner native `<Image>`: the URI it
 * paints (the resolved cache file, or the source URI where one is shown
 * directly) plus the local repair generation.
 *
 * A different image always gets a native image view of its own instead of
 * re-pointing one that already holds another image's bitmap. On the iPhone
 * Duo (iOS 27.1) the two "Sources in your library" rows, remounted from their
 * language groups into the library section about 3s after launch, each showed
 * the other's icon while JS paired every row with its own URI and cache file
 * (r19). A new key is a new React element, not a new native view: Fabric
 * hands the element a recycled RCTImageComponentView, and the swap itself was
 * a late image response from the view's previous request (fixed natively in
 * patches/react-native@0.88.0.patch). The URI only changes when the image does — a new source, a repaired
 * file, nothing → the first resolved file (nothing painted yet) — so an image
 * that keeps its source (a reader page, a cover) is never remounted.
 */
export function getMobileCachedImageViewKey(
  source: { uri?: string | null } | null | undefined,
  repairGeneration: number,
): string {
  return `${source?.uri ?? ""}#${repairGeneration}`;
}
