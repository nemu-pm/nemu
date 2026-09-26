package pm.nemu.mobile.aidoku

import java.util.Locale

/**
 * Localized language names for the source-language filter and chapter
 * language labels.
 *
 * The Android app runs the community JavaScriptCore build without ICU, so
 * there is no `Intl` global (and no `Intl.DisplayNames`) on the JS side. iOS's
 * system JSC has it, and prints "Abkhazian" / "阿布哈西亚语" / "アブハズ語"
 * for `ab` depending on the app language; Android fell back to the raw code
 * ("AB"). `java.util.Locale` is backed by ICU on Android and gives the same
 * CLDR names, localized into the requested display language.
 */
internal object NemuLanguageDisplayNames {
  /** One filter sheet lists every registry language; keep a sane ceiling. */
  internal const val MAX_CODES = 512

  /** BCP 47 tags a registry can realistically carry (`zh-Hant-TW`, …). */
  private const val MAX_TAG_LENGTH = 35

  /**
   * `code -> name` for every code [displayName] can name, localized into
   * [displayLanguage]. Codes without a known name are omitted so the caller
   * keeps its own fallback.
   */
  fun displayNames(codes: List<String>, displayLanguage: String): Map<String, String> {
    val displayLocale = displayLocale(displayLanguage)
    val names = LinkedHashMap<String, String>()
    for (code in codes.take(MAX_CODES)) {
      if (names.containsKey(code)) continue
      displayName(code, displayLocale)?.let { names[code] = it }
    }
    return names
  }

  fun displayName(code: String, displayLocale: Locale): String? {
    val tag = code.trim().replace('_', '-')
    if (tag.isEmpty() || tag.length > MAX_TAG_LENGTH) return null
    val locale = Locale.forLanguageTag(tag)
    val language = locale.language
    if (language.isNullOrEmpty()) return null
    val name = locale.getDisplayName(displayLocale).trim()
    // An unknown subtag (`zz`, Aidoku's `multi`) is echoed back verbatim.
    if (name.isEmpty() || name.equals(tag, ignoreCase = true) || name.equals(language, ignoreCase = true)) {
      return null
    }
    return name
  }

  /** The app language (`en` / `zh` / `ja`); anything unusable reads as English. */
  fun displayLocale(displayLanguage: String): Locale {
    val tag = displayLanguage.trim().replace('_', '-')
    if (tag.isEmpty() || tag.length > MAX_TAG_LENGTH) return Locale.ENGLISH
    val locale = Locale.forLanguageTag(tag)
    return if (locale.language.isNullOrEmpty()) Locale.ENGLISH else locale
  }
}
