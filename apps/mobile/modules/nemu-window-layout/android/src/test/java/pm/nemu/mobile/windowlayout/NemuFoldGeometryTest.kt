package pm.nemu.mobile.windowlayout

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NemuFoldGeometryTest {
  private val fullWindow = NemuFoldGeometry.ViewFrame(0, 0, 2208, 1840)

  @Test
  fun halfOpenedVerticalFoldIsAnActiveDivisionInLocalDp() {
    // Pixel Fold inner display, book posture: zero-width vertical fold at x=1104px.
    val book = NemuFoldGeometry.Feature(1104, 0, 1104, 1840, halfOpened = true, separating = true)
    val regions = NemuFoldGeometry.divisions(listOf(book), fullWindow, 2.625f)
    assertEquals(1, regions.size)
    val r = regions[0]
    assertTrue(r.active)
    assertEquals(1104 / 2.625, r.x, 1e-9)
    assertEquals(0.0, r.y, 1e-9)
    assertEquals(0.0, r.width, 1e-9)
    assertEquals(1840 / 2.625, r.height, 1e-9)
    assertEquals("partiallyOpen", NemuFoldGeometry.hingeStatus(listOf(book)))
  }

  @Test
  fun flatNonSeparatingFoldIsInactive() {
    val flat = NemuFoldGeometry.Feature(1104, 0, 1104, 1840, halfOpened = false, separating = false)
    val regions = NemuFoldGeometry.divisions(listOf(flat), fullWindow, 2.625f)
    assertEquals(false, regions.single().active)
    assertEquals("fullyOpen", NemuFoldGeometry.hingeStatus(listOf(flat)))
  }

  @Test
  fun separatingFlatHingeStaysActive() {
    // Dual-screen hinge: FLAT but isSeparating (FULL occlusion) — never straddle it.
    val hinge = NemuFoldGeometry.Feature(1350, 0, 1434, 1800, halfOpened = false, separating = true)
    assertTrue(NemuFoldGeometry.divisions(listOf(hinge), NemuFoldGeometry.ViewFrame(0, 0, 2784, 1800), 2f).single().active)
  }

  @Test
  fun tabletopFoldIsRelativeToAnOffsetView() {
    // Horizontal fold at y=920px; observer starts 100px down and 40px right.
    val tabletop = NemuFoldGeometry.Feature(0, 920, 2208, 920, halfOpened = true, separating = true)
    val view = NemuFoldGeometry.ViewFrame(40, 100, 2000, 1500)
    val r = NemuFoldGeometry.divisions(listOf(tabletop), view, 2f).single()
    assertEquals(-20.0, r.x, 1e-9)
    assertEquals(410.0, r.y, 1e-9)
    assertEquals(1104.0, r.width, 1e-9)
    assertEquals(0.0, r.height, 1e-9)
  }

  @Test
  fun featuresOutsideTheViewAndInvalidInputsAreDropped() {
    val fold = NemuFoldGeometry.Feature(1104, 0, 1104, 1840, halfOpened = true, separating = true)
    val rightHalf = NemuFoldGeometry.ViewFrame(1200, 0, 1008, 1840)
    assertTrue(NemuFoldGeometry.divisions(listOf(fold), rightHalf, 2.625f).isEmpty())
    assertTrue(NemuFoldGeometry.divisions(listOf(fold), NemuFoldGeometry.ViewFrame(0, 0, 0, 0), 2.625f).isEmpty())
    assertTrue(NemuFoldGeometry.divisions(listOf(fold), fullWindow, 0f).isEmpty())
    assertNull(NemuFoldGeometry.hingeStatus(emptyList()))
  }

  @Test
  fun insetsAreClippedToTheView() {
    // Status bar 120px, nav bar 60px; the view starts 200px down, so no top inset.
    val view = NemuFoldGeometry.ViewFrame(0, 200, 1080, 1720)
    val insets = NemuFoldGeometry.viewInsets(0, 120, 0, 60, 1080, 2400, view, 2f)
    assertEquals(0.0, insets.top, 1e-9)
    assertEquals(0.0, insets.left, 1e-9)
    // Bottom edge of the view is 480px above the window bottom: nav bar does not reach it.
    assertEquals(0.0, insets.bottom, 1e-9)
    val full = NemuFoldGeometry.viewInsets(0, 120, 30, 60, 1080, 2400, NemuFoldGeometry.ViewFrame(0, 0, 1080, 2400), 2f)
    assertEquals(60.0, full.top, 1e-9)
    assertEquals(15.0, full.right, 1e-9)
    assertEquals(30.0, full.bottom, 1e-9)
  }
}
