/**
 * DuoBilingualSecondaryPane — the aligned secondary (dual-reader) page drawn
 * inside its own pane of the bilingual book.
 *
 * Props:
 * - `chapterId`, `localIndex`: the PRIMARY chapter id and the primary page's
 *   chapter-local index (`page.index`). The secondary page is derived from the
 *   dual-reader store exactly like the per-page overlay (seed pair → chapter,
 *   drift → page, aligner render plans for split/merge/missing).
 * - `primaryNaturalSize`: the primary image's intrinsic size, when known
 *   (`readerImageSizes.get(pageIdentity)`). With a confident alignment the
 *   secondary is placed where the primary would sit if aspect-fit in this pane,
 *   so equal panes line up panel for panel; otherwise the secondary is
 *   aspect-fit and centred.
 * - `width`, `height`: pane size in points (the pane rect from
 *   `mobileDuoBilingualEligibility`).
 * - `backgroundColor` / `foregroundColor`: stage colour and the colour for the
 *   spinner and status text (defaults suit the black reader stage).
 * - `strings`: mobile strings (`strings.duo.*`, `strings.reader.dualReadOverlay*`).
 *
 * States: idle (nothing), notReady / loading (spinner), unavailable ("Unavailable
 * for this chapter." + realign hint — the overlay's own copy), missing ("No
 * matching page"), ready (Skia image). Non-interactive: taps fall through to
 * whatever is under the pane.
 */
import { memo } from "react";
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Canvas, Image as SkiaImage, type SkImage } from "@shopify/react-native-skia";
import { NemuText } from "@/design-system";
import { formatMobileString, type MobileStrings } from "@/lib/mobileI18n";
import {
  mobileDuoSecondaryDestRect,
  mobileDuoSecondaryPageNumber,
} from "@/lib/mobileDuoSecondaryTarget";
import { useDuoSecondaryPage } from "./useDuoSecondaryPage";

export type DuoBilingualSecondaryPaneProps = {
  chapterId: string | null;
  localIndex: number | null;
  primaryNaturalSize: { width: number; height: number } | null;
  width: number;
  height: number;
  backgroundColor: string;
  foregroundColor?: string;
  strings: MobileStrings;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const DEFAULT_FOREGROUND = "rgba(255,255,255,0.72)";

export const DuoBilingualSecondaryPane = memo(function DuoBilingualSecondaryPane({
  chapterId,
  localIndex,
  primaryNaturalSize,
  width,
  height,
  backgroundColor,
  foregroundColor = DEFAULT_FOREGROUND,
  strings,
  style,
  testID,
}: DuoBilingualSecondaryPaneProps) {
  const target = useDuoSecondaryPage({ chapterId, localIndex, load: true });
  const frame = [styles.pane, { width, height, backgroundColor }, style];

  if (!target.enabled || target.status === "idle" || width <= 0 || height <= 0) {
    return <View pointerEvents="none" style={frame} testID={testID} />;
  }

  if (target.status === "ready" && target.handle?.image) {
    const image = target.handle.image as SkImage;
    const { rect, aligned } = mobileDuoSecondaryDestRect({
      container: { width, height },
      secondaryNatural: { width: image.width(), height: image.height() },
      primaryNatural: primaryNaturalSize,
      alignment: target.alignment,
      applyAlignment: target.applyAlignment,
    });
    const pageNumber = mobileDuoSecondaryPageNumber(target);
    return (
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={pageNumber != null
          ? formatMobileString(strings.duo.bilingualSecondaryPageAccessibility, { page: pageNumber })
          : undefined}
        pointerEvents="none"
        style={frame}
        testID={testID}
      >
        <Canvas style={StyleSheet.absoluteFill}>
          <SkiaImage
            image={image}
            x={rect.x}
            y={rect.y}
            width={rect.width}
            height={rect.height}
            fit={aligned ? "fill" : "contain"}
          />
        </Canvas>
      </View>
    );
  }

  if (target.status === "unavailable" || target.status === "missing") {
    const unavailable = target.status === "unavailable";
    return (
      <View pointerEvents="none" style={[frame, styles.center]} testID={testID}>
        <NemuText
          color={foregroundColor}
          style={styles.statusTitle}
          variant="rowSubtitle"
        >
          {unavailable ? strings.reader.dualReadOverlayUnavailableTitle : strings.duo.bilingualNoMatchingPage}
        </NemuText>
        {unavailable ? (
          <NemuText color={foregroundColor} style={styles.statusHint} variant="caption">
            {strings.reader.dualReadOverlayUnavailableHint}
          </NemuText>
        ) : null}
      </View>
    );
  }

  // notReady / loading
  return (
    <View
      accessible
      accessibilityLabel={strings.duo.bilingualLoadingSecondary}
      accessibilityRole="progressbar"
      pointerEvents="none"
      style={[frame, styles.center]}
      testID={testID}
    >
      <ActivityIndicator size="small" color={foregroundColor} />
    </View>
  );
});

const styles = StyleSheet.create({
  pane: {
    overflow: "hidden",
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  statusTitle: {
    textAlign: "center",
  },
  statusHint: {
    marginTop: 6,
    textAlign: "center",
    opacity: 0.8,
  },
});
