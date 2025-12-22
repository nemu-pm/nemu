package org.jsoup.parser

/**
 * Jsoup Parser stub - MangaDex only uses unescapeEntities.
 */
object Parser {
    /**
     * Unescape HTML entities in a string.
     */
    fun unescapeEntities(string: String, inAttribute: Boolean): String {
        return string
            .replace("&amp;", "&")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&quot;", "\"")
            .replace("&apos;", "'")
            .replace("&#39;", "'")
            .replace("&nbsp;", " ")
            .replace("&hearts;", "♥")
            .replace("&copy;", "©")
            .replace("&reg;", "®")
            .replace("&trade;", "™")
            .replace("&mdash;", "—")
            .replace("&ndash;", "–")
            .replace("&hellip;", "…")
            .replace("&lsquo;", "'")
            .replace("&rsquo;", "'")
            .replace("&ldquo;", """)
            .replace("&rdquo;", """)
            .replace(Regex("&#(\\d+);")) { match ->
                val code = match.groupValues[1].toIntOrNull() ?: return@replace match.value
                code.toChar().toString()
            }
            .replace(Regex("&#x([0-9a-fA-F]+);")) { match ->
                val code = match.groupValues[1].toIntOrNull(16) ?: return@replace match.value
                code.toChar().toString()
            }
    }
}

