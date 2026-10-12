package pm.nemu.mobile.windowlayout

import kotlin.math.max
import kotlin.math.min

/**
 * Pure mapping from Jetpack WindowManager `FoldingFeature`s (window pixels) to
 * the JS `WindowReservedRegion` contract (observer-local dp). No Android types,
 * so it runs under plain JUnit.
 */
internal object NemuFoldGeometry {
  /** A `FoldingFeature` flattened to primitives; bounds are window pixels. */
  data class Feature(
    val left: Int,
    val top: Int,
    val right: Int,
    val bottom: Int,
    val halfOpened: Boolean,
    val separating: Boolean,
  )

  /** The observer view's rectangle in window pixels. */
  data class ViewFrame(val left: Int, val top: Int, val width: Int, val height: Int)

  data class Region(
    val id: String,
    val active: Boolean,
    val x: Double,
    val y: Double,
    val width: Double,
    val height: Double,
  ) {
    fun toMap(): Map<String, Any> =
      mapOf("id" to id, "active" to active, "x" to x, "y" to y, "width" to width, "height" to height)
  }

  data class Insets(val top: Double, val left: Double, val bottom: Double, val right: Double) {
    fun toMap(): Map<String, Any> = mapOf("top" to top, "left" to left, "bottom" to bottom, "right" to right)
  }

  /**
   * HALF_OPENED (book / tabletop) or a separating hinge (dual-screen, FULL
   * occlusion) is an active division — content must not straddle it. A FLAT
   * non-separating fold is reported inactive, like iOS's inactive division on a
   * fully open inner display. Features that do not touch the view are dropped.
   * Bounds stay physical: WindowManager reports no interaction margin.
   */
  fun divisions(features: List<Feature>, view: ViewFrame, density: Float): List<Region> {
    if (density <= 0f || view.width <= 0 || view.height <= 0) return emptyList()
    val viewRight = view.left + view.width
    val viewBottom = view.top + view.height
    return features.mapIndexedNotNull { index, feature ->
      // Inclusive test: a zero-width fold line is still a real division.
      val touches = feature.right >= view.left && feature.left <= viewRight &&
        feature.bottom >= view.top && feature.top <= viewBottom
      if (!touches) return@mapIndexedNotNull null
      Region(
        id = "fold-$index",
        active = feature.halfOpened || feature.separating,
        x = (feature.left - view.left) / density.toDouble(),
        y = (feature.top - view.top) / density.toDouble(),
        width = (feature.right - feature.left) / density.toDouble(),
        height = (feature.bottom - feature.top) / density.toDouble(),
      )
    }
  }

  /** `closed` has no Android equivalent: a closed foldable reports no fold on its outer display. */
  fun hingeStatus(features: List<Feature>): String? = when {
    features.isEmpty() -> null
    features.any { it.halfOpened } -> "partiallyOpen"
    else -> "fullyOpen"
  }

  /** Window-edge insets (system bars + cutout, window px) clipped to the view, in dp. */
  fun viewInsets(
    windowInsetLeft: Int,
    windowInsetTop: Int,
    windowInsetRight: Int,
    windowInsetBottom: Int,
    windowWidth: Int,
    windowHeight: Int,
    view: ViewFrame,
    density: Float,
  ): Insets {
    if (density <= 0f) return Insets(0.0, 0.0, 0.0, 0.0)
    fun clip(inset: Int, distanceFromEdge: Int, extent: Int) =
      min(max(0, inset - distanceFromEdge), max(0, extent)) / density.toDouble()
    return Insets(
      top = clip(windowInsetTop, view.top, view.height),
      left = clip(windowInsetLeft, view.left, view.width),
      bottom = clip(windowInsetBottom, windowHeight - view.top - view.height, view.height),
      right = clip(windowInsetRight, windowWidth - view.left - view.width, view.width),
    )
  }
}
