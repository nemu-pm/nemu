package java.util

/**
 * Java Locale shim.
 */
class Locale private constructor(
    private val language: String,
    private val country: String = "",
    private val variant: String = ""
) {
    fun getLanguage(): String = language
    fun getCountry(): String = country
    fun getVariant(): String = variant
    
    fun getDisplayName(locale: Locale): String {
        // Simple display name - in production this would use Intl API
        return when {
            country.isNotEmpty() -> "$language-$country"
            else -> language
        }
    }
    
    fun toLanguageTag(): String {
        return when {
            country.isNotEmpty() && variant.isNotEmpty() -> "$language-$country-$variant"
            country.isNotEmpty() -> "$language-$country"
            else -> language
        }
    }
    
    override fun toString(): String = toLanguageTag()
    
    override fun equals(other: Any?): Boolean {
        if (other !is Locale) return false
        return language == other.language && country == other.country && variant == other.variant
    }
    
    override fun hashCode(): Int {
        var result = language.hashCode()
        result = 31 * result + country.hashCode()
        result = 31 * result + variant.hashCode()
        return result
    }
    
    companion object {
        val US = Locale("en", "US")
        val UK = Locale("en", "GB")
        val ENGLISH = Locale("en")
        val FRENCH = Locale("fr")
        val GERMAN = Locale("de")
        val ITALIAN = Locale("it")
        val JAPANESE = Locale("ja")
        val JAPAN = Locale("ja", "JP")
        val KOREAN = Locale("ko")
        val KOREA = Locale("ko", "KR")
        val CHINESE = Locale("zh")
        val SIMPLIFIED_CHINESE = Locale("zh", "CN")
        val TRADITIONAL_CHINESE = Locale("zh", "TW")
        val ROOT = Locale("")
        
        fun getDefault(): Locale = US
        
        fun forLanguageTag(languageTag: String): Locale {
            val parts = languageTag.split("-", "_")
            return when (parts.size) {
                1 -> Locale(parts[0].lowercase())
                2 -> Locale(parts[0].lowercase(), parts[1].uppercase())
                else -> Locale(parts[0].lowercase(), parts[1].uppercase(), parts.drop(2).joinToString("-"))
            }
        }
        
        operator fun invoke(language: String): Locale = Locale(language)
        operator fun invoke(language: String, country: String): Locale = Locale(language, country)
        operator fun invoke(language: String, country: String, variant: String): Locale = Locale(language, country, variant)
    }
}
