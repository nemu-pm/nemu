package pm.nemu.mobile.aidoku

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NemuCloudflareInterstitialScanCacheTest {
  @Test
  fun scansAtMostOncePerParsedDocument() {
    val cache = NemuCloudflareInterstitialScanCache()
    assertNull(cache.known(1))

    // A scan while the document is still loading may not have reached the
    // bootstrap script yet: a negative is not kept.
    cache.record(1, interstitial = false, scanFinal = false)
    assertNull(cache.known(1))

    // A scan over the parsed DOM that found nothing is final for the document.
    cache.record(1, interstitial = false, scanFinal = true)
    assertEquals(false, cache.known(1))

    // The global showing up later (the bootstrap ran after all) still wins.
    cache.record(1, interstitial = true, scanFinal = false)
    assertEquals(true, cache.known(1))
    // ...and a later negative read never withdraws a positive one.
    cache.record(1, interstitial = false, scanFinal = true)
    assertEquals(true, cache.known(1))
  }

  @Test
  fun aNewDocumentForgetsThePreviousOne() {
    val cache = NemuCloudflareInterstitialScanCache()
    cache.record(4, interstitial = true, scanFinal = true)
    assertEquals(true, cache.known(4))
    assertNull(cache.known(5))

    cache.record(5, interstitial = false, scanFinal = true)
    assertEquals(false, cache.known(5))
    // A late answer for the older document does not leak into the new one.
    assertNull(cache.known(4))
  }

  @Test
  fun probeScriptPassesWhatIsAlreadyKnown() {
    val unknown = nemuCloudflareProbeScript(null)
    assertTrue(unknown.startsWith("(function (knownInterstitial) {"))
    assertTrue(unknown.endsWith("})(null);"))
    assertTrue(nemuCloudflareProbeScript(false).endsWith("})(false);"))
    assertTrue(nemuCloudflareProbeScript(true).endsWith("})(true);"))

    // The page global is read first; the `<script>` text scan is the fallback
    // and never runs once a document is known.
    val globalCheck = unknown.indexOf("typeof window._cf_chl_opt !== \"undefined\"")
    val scan = unknown.indexOf("document.scripts")
    assertTrue(globalCheck > 0)
    assertTrue(scan > globalCheck)
    assertTrue(unknown.contains("if (!interstitial && knownInterstitial !== false) {"))
    // Nothing is written into the page's realm.
    assertFalse(unknown.contains("defineProperty"))
    assertFalse(unknown.contains("Symbol"))
    assertFalse(Regex("""window\.[A-Za-z_]+\s*=""").containsMatchIn(unknown))
  }
}
