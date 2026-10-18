import { StyleSheet, View } from "react-native";
import { useNemuTheme } from "@/design-system";
import type { MobileMangaDetailWash } from "@/components/MobileMangaDetailPaneContext";
import { buildMobileCoverTintPalette } from "@/lib/mobileCoverTint";
import { ExploreGradient } from "./ExploreGradient";
import { MobileCoverMeshBackground } from "./MobileCoverMeshBackground";

/** How far the wash reaches past the window (under the bar, past the bounce). */
const OVERSCAN = 1000;
/** The living page fades into the plain page colour over this band past the hero column (pt). */
const MESH_FADE = 160;

/**
 * The two-column detail page's backdrop: the cover's colour from edge to
 * edge of the window, behind the hero column, the chapter column and a
 * vertical system bar alike. The living page drifts behind the hero column
 * once the page has landed and fades into the plain page colour past it, so
 * the chapter rows keep the contrast they have on the phone. Before the hero
 * has published its colours (loading), the plain tinted page of no cover.
 */
export function MobileMangaDetailColumnsWash({
  wash,
  heroWidth,
}: {
  wash: MobileMangaDetailWash | null;
  /** The hero column's width from the leading edge. */
  heroWidth: number;
}) {
  const { scheme } = useNemuTheme();
  const palette = buildMobileCoverTintPalette(wash?.tint ?? null, scheme);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.overscan, { backgroundColor: palette.page }]} />
      {wash?.mesh ? (
        <View style={[styles.mesh, { width: heroWidth + MESH_FADE }]}>
          <MobileCoverMeshBackground
            main={wash.tint}
            regions={wash.regions}
            scheme={scheme}
            // The window's height is the canvas: no seam above or below.
            topBlend={0}
            bottomBlend={0}
            landingKey="landed"
            style={StyleSheet.absoluteFill}
          />
          <ExploreGradient
            direction="right"
            colors={[palette.pageClear, palette.page]}
            style={styles.meshFade}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  mesh: {
    position: "absolute",
    top: 0,
    bottom: 0,
    start: 0,
  },
  meshFade: {
    position: "absolute",
    top: 0,
    bottom: 0,
    end: 0,
    width: MESH_FADE,
  },
  overscan: {
    position: "absolute",
    top: -OVERSCAN,
    bottom: -OVERSCAN,
    left: -OVERSCAN,
    right: -OVERSCAN,
  },
});
