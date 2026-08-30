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
 * DEVICE-GATED: the Skia `<Canvas>`/`<Image>` render + on-device alignment are
 * verified in T7.4 (user simulator). The geometry math is unit-tested in
 * `mobileDualReaderOverlayLayout.test.ts`.
 */
import { useEffect, useMemo } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Canvas, Image as SkiaImage } from "@shopify/react-native-skia";
import type { SkImage } from "@shopify/react-native-skia";
import {
  ALIGNMENT_CONFIDENCE_MIN_DEFAULT,
  clampIndex,
  mapSecondaryChapterForPrimary,
  mapSecondaryPageIndex,
} from "@nemu/core/dual-reader";
import type { MobileStrings } from "@/lib/mobileI18n";
import type { ReadingMode } from "@/data/schema";
import type { MobileImageSize } from "@/lib/mobileJapaneseLearningOverlay";
import {
  adaptMobileDualReadStore,
  ensureSecondaryCompositeImage,
  ensureSecondaryImage,
  fetchMobilePageBytes,
  makeSecondaryCompositeKey,
  makeSecondarySingleKey,
} from "@/lib/mobileDualReaderSecondaryImages";
import {
  getMobileDualReadStore,
  useMobileDualReaderStore,
} from "@/lib/mobileDualReaderStore";
import { getMobileDualReaderRenderer } from "@/lib/mobileDualReaderSkiaAdapter";
import {
  alignmentLayoutToDestRect,
  computeAlignmentLayout,
  computeContainRect,
} from "@/lib/mobileDualReaderOverlayLayout";

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
  const renderer = getMobileDualReaderRenderer();
  const enabled = useMobileDualReaderStore((s) => s.enabled);
  const runtimeSuspended = useMobileDualReaderStore((s) => s.runtimeSuspended);
  const activeSide = useMobileDualReaderStore((s) => s.activeSide);
  const peekActive = useMobileDualReaderStore((s) => s.peekActive);
  const seedPair = useMobileDualReaderStore((s) => s.seedPair);
  const driftDeltaByChapter = useMobileDualReaderStore((s) => s.driftDeltaByChapter);
  const primaryChapters = useMobileDualReaderStore((s) => s.primaryChapters);
  const secondaryChapters = useMobileDualReaderStore((s) => s.secondaryChapters);
  const secondarySource = useMobileDualReaderStore((s) => s.secondarySource);
  const secondaryPagesByChapter = useMobileDualReaderStore((s) => s.secondaryPagesByChapter);
  const secondaryImageUrls = useMobileDualReaderStore((s) => s.secondaryImageUrls);
  const secondaryRenderPlansByChapter = useMobileDualReaderStore(
    (s) => s.secondaryRenderPlansByChapter,
  );
  const secondaryAlignmentByChapter = useMobileDualReaderStore(
    (s) => s.secondaryAlignmentByChapter,
  );

  const effectiveSide = peekActive
    ? activeSide === "primary"
      ? "secondary"
      : "primary"
    : activeSide;
  const showSecondary = enabled && effectiveSide === "secondary";

  const primaryChapter = useMemo(() => {
    if (!chapterId) return null;
    return primaryChapters.find((c) => c.id === chapterId) ?? null;
  }, [chapterId, primaryChapters]);

  const secondaryChapterId = useMemo(() => {
    if (!primaryChapter || !seedPair || secondaryChapters.length === 0) return null;
    return mapSecondaryChapterForPrimary({
      primaryChapter,
      primaryAll: primaryChapters,
      secondaryAll: secondaryChapters,
      seedPair,
    });
  }, [primaryChapter, primaryChapters, secondaryChapters, seedPair]);

  const mappedIndex = useMemo(() => {
    if (localIndex == null || !chapterId) return null;
    const driftDelta = driftDeltaByChapter[chapterId] ?? 0;
    return mapSecondaryPageIndex({ primaryIndex: localIndex, driftDelta });
  }, [localIndex, chapterId, driftDeltaByChapter]);

  const renderPlan = useMemo(() => {
    if (!chapterId || localIndex == null || !secondaryChapterId) return null;
    const plan = secondaryRenderPlansByChapter[chapterId]?.[localIndex];
    if (!plan) return null;
    if (plan.secondaryChapterId !== secondaryChapterId) return null;
    const driftDelta = driftDeltaByChapter[chapterId] ?? 0;
    if (plan.driftDelta !== driftDelta) return null;
    return plan;
  }, [chapterId, localIndex, secondaryChapterId, secondaryRenderPlansByChapter, driftDeltaByChapter]);

  const alignment = useMemo(() => {
    if (!chapterId || localIndex == null || !secondaryChapterId) return null;
    const entry = secondaryAlignmentByChapter[chapterId];
    if (!entry || entry.secondaryChapterId !== secondaryChapterId) return null;
    return entry.byPage[localIndex] ?? null;
  }, [chapterId, localIndex, secondaryChapterId, secondaryAlignmentByChapter]);

  const secondaryPages = secondaryChapterId
    ? secondaryPagesByChapter[secondaryChapterId]
    : undefined;
  const clampedIndex =
    secondaryPages && mappedIndex != null
      ? clampIndex(mappedIndex, secondaryPages.length)
      : null;

  const imageKey = useMemo(() => {
    if (renderPlan) {
      if (renderPlan.kind === "missing") return null;
      if (renderPlan.kind === "single") {
        return makeSecondarySingleKey(renderPlan.secondaryChapterId, renderPlan.secondaryIndex);
      }
      if (renderPlan.kind === "split") {
        return makeSecondaryCompositeKey(renderPlan);
      }
      return makeSecondaryCompositeKey(renderPlan); // merge
    }
    return secondaryChapterId && clampedIndex != null
      ? makeSecondarySingleKey(secondaryChapterId, clampedIndex)
      : null;
  }, [renderPlan, secondaryChapterId, clampedIndex]);

  const handle = imageKey ? secondaryImageUrls.get(imageKey) : undefined;
  const isMissing = renderPlan?.kind === "missing";
  const lookupReady = Boolean(
    primaryChapter && seedPair && secondaryChapters.length > 0,
  );
  const applyAlignment = Boolean(
    alignment && alignment.confidence >= ALIGNMENT_CONFIDENCE_MIN_DEFAULT,
  );

  // Resolve the secondary image on demand (mirror web's effect at :3296-3309).
  useEffect(() => {
    if (
      runtimeSuspended ||
      !showSecondary ||
      !secondarySource ||
      !secondaryChapterId ||
      handle?.image
    ) {
      return;
    }
    const controller = new AbortController();
    const store = adaptMobileDualReadStore(getMobileDualReadStore());
    const fetcher = (
      page: Parameters<typeof fetchMobilePageBytes>[0],
      options?: { signal?: AbortSignal },
    ) => fetchMobilePageBytes(page, { signal: options?.signal });
    if (renderPlan) {
      if (renderPlan.kind === "missing") return () => controller.abort();
      const pages = secondaryPages ?? [];
      if (pages.length === 0) return () => controller.abort();
      void ensureSecondaryCompositeImage({
        renderer,
        fetchBytes: fetcher,
        store,
        pages,
        plan: renderPlan,
        signal: controller.signal,
      });
      return () => controller.abort();
    }
    if (mappedIndex == null || !secondaryPages) {
      return () => controller.abort();
    }
    void ensureSecondaryImage({
      renderer,
      fetchBytes: fetcher,
      store,
      pages: secondaryPages,
      chapterId: secondaryChapterId,
      index: mappedIndex,
      signal: controller.signal,
    });
    return () => controller.abort();
  }, [
    runtimeSuspended,
    showSecondary,
    secondarySource,
    secondaryChapterId,
    imageKey,
    handle?.image,
    renderPlan,
    mappedIndex,
    secondaryPages,
    renderer,
  ]);

  if (!enabled && !isGlobal) return null;
  if (!showSecondary || !chapterId || localIndex == null) return null;

  // --- Render the secondary layer ---
  if (isMissing) return null;

  if (handle?.image) {
    const sk = handle.image as SkImage;
    const secondaryNatural = { width: sk.width(), height: sk.height() };
    const container = { width: frameSize.width, height: frameSize.height };
    const aligned =
      applyAlignment && alignment && primaryNaturalSize
        ? computeAlignmentLayout({
            container,
            primaryNatural: {
              width: primaryNaturalSize.width,
              height: primaryNaturalSize.height,
            },
            secondaryNatural,
            alignment,
          })
        : null;
    const dest =
      aligned != null
        ? alignmentLayoutToDestRect(aligned)
        : computeContainRect({ container, natural: secondaryNatural });
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
            fit={aligned != null ? "fill" : "contain"}
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
          <Text style={styles.bannerTitle}>
            {strings.reader.dualReadOverlayUnavailableTitle}
          </Text>
          <Text style={styles.bannerHint}>
            {strings.reader.dualReadOverlayUnavailableHint}
          </Text>
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
