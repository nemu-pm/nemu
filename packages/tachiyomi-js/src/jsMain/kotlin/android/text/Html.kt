package android.text

/**
 * Android Html shim for Kotlin/JS.
 * Basic HTML to plain text conversion.
 */
object Html {
    const val FROM_HTML_MODE_LEGACY = 0
    const val FROM_HTML_MODE_COMPACT = 63
    
    /**
     * Convert HTML string to Spanned (simplified to String for JS).
     */
    fun fromHtml(source: String, flags: Int): CharSequence {
        return fromHtml(source)
    }
    
    /**
     * Convert HTML string to plain text (deprecated API).
     */
    @Deprecated("Use fromHtml(String, int) instead")
    fun fromHtml(source: String): CharSequence {
        // Simple HTML to text conversion
        var text = source
        
        // Handle common entities
        text = text.replace("&nbsp;", " ")
        text = text.replace("&lt;", "<")
        text = text.replace("&gt;", ">")
        text = text.replace("&amp;", "&")
        text = text.replace("&quot;", "\"")
        text = text.replace("&apos;", "'")
        text = text.replace("&#39;", "'")
        
        // Handle numeric entities
        val numericEntityRegex = Regex("&#(\\d+);")
        text = numericEntityRegex.replace(text) { match ->
            val code = match.groupValues[1].toIntOrNull() ?: 0
            if (code in 1..65535) code.toChar().toString() else ""
        }
        
        // Handle hex entities
        val hexEntityRegex = Regex("&#x([0-9a-fA-F]+);")
        text = hexEntityRegex.replace(text) { match ->
            val code = match.groupValues[1].toIntOrNull(16) ?: 0
            if (code in 1..65535) code.toChar().toString() else ""
        }
        
        // Add newlines for block elements
        text = text.replace(Regex("<br\\s*/?>", RegexOption.IGNORE_CASE), "\n")
        text = text.replace(Regex("</p>", RegexOption.IGNORE_CASE), "\n\n")
        text = text.replace(Regex("</div>", RegexOption.IGNORE_CASE), "\n")
        text = text.replace(Regex("</li>", RegexOption.IGNORE_CASE), "\n")
        text = text.replace(Regex("</h[1-6]>", RegexOption.IGNORE_CASE), "\n\n")
        
        // Strip remaining tags
        text = text.replace(Regex("<[^>]+>"), "")
        
        // Normalize whitespace
        text = text.replace(Regex("[ \\t]+"), " ")
        text = text.replace(Regex("\\n[ \\t]+"), "\n")
        text = text.replace(Regex("[ \\t]+\\n"), "\n")
        text = text.replace(Regex("\\n{3,}"), "\n\n")
        
        return text.trim()
    }
    
    /**
     * Escape HTML special characters.
     */
    fun escapeHtml(text: CharSequence): String {
        return text.toString()
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace("\"", "&quot;")
            .replace("'", "&#39;")
    }
}

