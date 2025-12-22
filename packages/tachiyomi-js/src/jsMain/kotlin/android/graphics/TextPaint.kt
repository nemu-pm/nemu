package android.graphics

/**
 * Android TextPaint shim - extends Paint with text-specific properties.
 * Used by TextInterceptor and other text-rendering code.
 */
class TextPaint(flags: Int = 0) : Paint(flags) {
    var density: Float = 1.0f
    var baselineShift: Int = 0
    var bgColor: Int = 0
    var linkColor: Int = 0
    var drawableState: IntArray? = null

    fun set(src: TextPaint) {
        color = src.color
        alpha = src.alpha
        style = src.style
        strokeWidth = src.strokeWidth
        isAntiAlias = src.isAntiAlias
        textSize = src.textSize
        typeface = src.typeface
        density = src.density
        baselineShift = src.baselineShift
        bgColor = src.bgColor
        linkColor = src.linkColor
    }

    /**
     * Measure the width of text.
     */
    fun measureText(text: String): Float {
        // Approximate: average char width based on text size
        return text.length * textSize * 0.5f
    }

    fun measureText(text: CharSequence, start: Int, end: Int): Float {
        return measureText(text.subSequence(start, end).toString())
    }

    /**
     * Get font metrics.
     */
    fun getFontMetrics(): FontMetrics {
        return FontMetrics().apply {
            ascent = -textSize * 0.8f
            descent = textSize * 0.2f
            top = -textSize * 0.9f
            bottom = textSize * 0.3f
            leading = textSize * 0.1f
        }
    }

    fun getFontMetricsInt(): FontMetricsInt {
        return FontMetricsInt().apply {
            ascent = (-textSize * 0.8f).toInt()
            descent = (textSize * 0.2f).toInt()
            top = (-textSize * 0.9f).toInt()
            bottom = (textSize * 0.3f).toInt()
            leading = (textSize * 0.1f).toInt()
        }
    }

    class FontMetrics {
        var ascent: Float = 0f
        var descent: Float = 0f
        var top: Float = 0f
        var bottom: Float = 0f
        var leading: Float = 0f
    }

    class FontMetricsInt {
        var ascent: Int = 0
        var descent: Int = 0
        var top: Int = 0
        var bottom: Int = 0
        var leading: Int = 0
    }
}

