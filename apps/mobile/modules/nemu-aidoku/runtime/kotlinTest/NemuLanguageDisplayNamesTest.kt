package pm.nemu.mobile.aidoku

import java.util.Locale
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NemuLanguageDisplayNamesTest {
  @Test
  fun namesCodesInEnglish() {
    val names = NemuLanguageDisplayNames.displayNames(listOf("ab", "af", "am", "ko"), "en")

    assertEquals("Abkhazian", names["ab"])
    assertEquals("Afrikaans", names["af"])
    assertEquals("Amharic", names["am"])
    assertEquals("Korean", names["ko"])
  }

  @Test
  fun localizesIntoTheAppLanguage() {
    val english = NemuLanguageDisplayNames.displayNames(listOf("af"), "en")["af"]
    val chinese = NemuLanguageDisplayNames.displayNames(listOf("af"), "zh")["af"]
    val japanese = NemuLanguageDisplayNames.displayNames(listOf("af"), "ja")["af"]

    assertEquals("Afrikaans", english)
    assertTrue(chinese!!.isNotBlank())
    assertTrue(japanese!!.isNotBlank())
    assertNotEquals(english, chinese)
    assertNotEquals(english, japanese)
    assertNotEquals(chinese, japanese)
  }

  @Test
  fun acceptsRegionAndScriptTagsInEitherSeparatorStyle() {
    val names = NemuLanguageDisplayNames.displayNames(listOf("pt-br", "pt_BR"), "en")

    assertTrue(names["pt-br"]!!.startsWith("Portuguese"))
    assertEquals(names["pt-br"], names["pt_BR"])
  }

  @Test
  fun omitsCodesItCannotName() {
    val names = NemuLanguageDisplayNames.displayNames(
      listOf("zz", "multi", "", "  ", "x".repeat(64), "12"),
      "en"
    )

    assertTrue(names.isEmpty())
  }

  @Test
  fun unusableDisplayLanguageFallsBackToEnglish() {
    assertEquals(Locale.ENGLISH, NemuLanguageDisplayNames.displayLocale(""))
    assertEquals(Locale.ENGLISH, NemuLanguageDisplayNames.displayLocale("x".repeat(64)))
    assertEquals(
      "Afrikaans",
      NemuLanguageDisplayNames.displayNames(listOf("af"), "")["af"]
    )
  }

  @Test
  fun boundsTheBatch() {
    val codes = List(NemuLanguageDisplayNames.MAX_CODES + 10) { index ->
      if (index < NemuLanguageDisplayNames.MAX_CODES) "zz" else "af"
    }

    assertFalse(NemuLanguageDisplayNames.displayNames(codes, "en").containsKey("af"))
    assertNull(NemuLanguageDisplayNames.displayName("zz", Locale.ENGLISH))
  }
}
