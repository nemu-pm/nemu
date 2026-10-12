/**
 * Mobile dual-reader per-page overlay — renders the aligned secondary SkImage
 * on top of the primary manga page. Native parity counterpart to web's
 * `DualReadOverlay` (`src/lib/plugins/builtin/dual-reader/components.tsx:3036`).
 *
 * Same states as web: single / split / merge / missing, spinner while the
 * image resolves, "unavailable for this chapter" banner when the lookup is ready
 * but no secondary chapter maps, and a spinner when the lookup isn't ready.
 *
 * Alignment geometry is computed via the pure `computeAlignmentLayout`
 * (ported from web's `updateAlignmentLayout`) using the shared core layout
 * helpers, then drawn as a single Skia `<Image>` into the dest rect
 * `{ x: left+translateX, y: top+translateY, w: width*scale, h: height*scale }`
 * — the Skia equivalent of web's `transform: translate(tx,ty) scale(s)` with
 * `transformOrigin: top-left`. When no alignment is available, the secondary is
 * drawn aspect-fit (`fit="contain"`) over the full frame, matching web's
 * `object-contain` full-frame img.
 *
 * Page resolution + decode live in `useDuoSecondaryPage` (pure logic in
 * `mobileDuoSecondaryTarget.ts`), shared with the Duo bilingual side-by-side
 * pane so the overlay and the pane can never disagree about which page pairs.
 *
 * DEVICE-GATED: the Skia `<Canvas>`/`<Image>` render + on-device alignment are
 * verified in T7.4 (user simulator). The geometry math is unit-tested in
 * `mobileDualReaderOverlayLayout.test.ts`.
 */
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { NemuText } from "@/design-system";
import { Canvas, Image as SkiaImage } from "@shopify/react-native-skia";
import type { SkImage } from "@shopify/react-native-skia";
import type { MobileStrings } from "@/lib/mobileI18n";
import type { ReadingMode } from "@/data/schema";
import type { MobileImageSize } from "@/lib/mobileJapaneseLearningOverlay";
import { useMobileDualReaderStore } from "@/lib/mobileDualReaderStore";
import { useDuoSecondaryPage } from "@/components/duo/useDuoSecondaryPage";
import { mobileDuoSecondaryDestRect } from "@/lib/mobileDuoSecondaryTarget";

export type MobileDualReaderOverlayProps = {
  isGlobal: boolean;
  readingMode: ReadingMode;
  frameSize: MobileImageSize;
  primaryNaturalSize: MobileImageSize | null;
  chapterId: string | null;
  localIndex: number | null;
  strings: MobileStrings;
};

export function MobileDualReaderOverlay({
  isGlobal,
  readingMode,
  frameSize,
  primaryNaturalSize,
  chapterId,
  localIndex,
  strings,
}: MobileDualReaderOverlayProps) {
  const activeSide = useMobileDualReaderStore((s) => s.activeSide);
  const peekActive = useMobileDualReaderStore((s) => s.peekActive);
  const enabled = useMobileDualReaderStore((s) => s.enabled);

  const effectiveSide = peekActive
    ? activeSide === "primary"
      ? "secondary"
      : "primary"
    : activeSide;
  const showSecondary = enabled && effectiveSide === "secondary";

  // Chapter/page mapping, render plan, alignment, cache key and the on-demand
  // decode are shared with the Duo bilingual pane (`useDuoSecondaryPage`).
  const {
    status,
    secondaryChapterId,
    lookupReady,
    alignment,
    applyAlignment,
    handle,
  } = useDuoSecondaryPage({ chapterId, localIndex, load: showSecondary });
  const isMissing = status === "missing";

  if (!enabled && !isGlobal) return null;
  if (!showSecondary || !chapterId || localIndex == null) return null;

  // --- Render the secondary layer ---
  if (isMissing) return null;

  if (handle?.image) {
    const sk = handle.image as SkImage;
    const secondaryNatural = { width: sk.width(), height: sk.height() };
    const { rect: dest, aligned } = mobileDuoSecondaryDestRect({
      container: { width: frameSize.width, height: frameSize.height },
      secondaryNatural,
      primaryNatural: primaryNaturalSize,
      alignment,
      applyAlignment,
    });
    const isScrolling = readingMode === "scrolling";
    return (
      <View
        style={[
          styles.overlay,
          isScrolling ? styles.overlayScroll : styles.overlayPaged,
        ]}
        pointerEvents="none"
      >
        <Canvas style={StyleSheet.absoluteFill}>
          <SkiaImage
            image={sk}
            x={dest.x}
            y={dest.y}
            width={dest.width}
            height={dest.height}
            fit={aligned ? "fill" : "contain"}
          />
        </Canvas>
      </View>
    );
  }

  // No image yet.
  if (secondaryChapterId) {
    // Spinner while the image resolves.
    return (
      <View style={[styles.spinner, { backgroundColor: "rgba(0,0,0,0.6)" }]} pointerEvents="none">
        <ActivityIndicator size="small" color="#ffffff" />
      </View>
    );
  }

  if (lookupReady && isGlobal) {
    return (
      <View style={styles.bannerWrap} pointerEvents="none">
        <View style={[styles.banner, { backgroundColor: "rgba(0,0,0,0.7)" }]}>
          <NemuText style={styles.bannerTitle}>
            {strings.reader.dualReadOverlayUnavailableTitle}
          </NemuText>
          <NemuText style={styles.bannerHint}>
            {strings.reader.dualReadOverlayUnavailableHint}
          </NemuText>
        </View>
      </View>
    );
  }

  // Lookup not ready: spinner.
  return (
    <View style={[styles.spinner, { backgroundColor: "rgba(0,0,0,0.6)" }]} pointerEvents="none">
      <ActivityIndicator size="small" color="#ffffff" />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    overflow: "hidden",
  },
  overlayPaged: {
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
  },
  overlayScroll: {
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  spinner: {
    position: "absolute",
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  bannerWrap: {
    position: "absolute",
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  banner: {
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    maxWidth: 260,
    alignItems: "center",
  },
  bannerTitle: {
    fontSize: 14,
    textAlign: "center",
    color: "#ffffff",
  },
  bannerHint: {
    marginTop: 8,
    fontSize: 12,
    textAlign: "center",
    color: "rgba(255,255,255,0.8)",
  },
});
