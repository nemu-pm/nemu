package android.text

import android.graphics.Canvas
import android.graphics.TextPaint

/**
 * Android StaticLayout shim - for multi-line text layout.
 * Used by TextInterceptor to render text to images.
 */
@Suppress("DEPRECATION")
class StaticLayout : Layout {
    private val text: CharSequence
    private val paint: TextPaint
    private val width: Int
    private val alignment: Alignment
    private val spacingMult: Float
    private val spacingAdd: Float
    private val lines: List<String>

    /**
     * Primary constructor (deprecated but still used).
     */
    @Deprecated("Use Builder instead")
    constructor(
        source: CharSequence,
        paint: TextPaint,
        width: Int,
        alignment: Alignment,
        spacingMult: Float,
        spacingAdd: Float,
        includePad: Boolean
    ) : super(source, paint, width, alignment, spacingMult, spacingAdd) {
        this.text = source
        this.paint = paint
        this.width = width
        this.alignment = alignment
        this.spacingMult = spacingMult
        this.spacingAdd = spacingAdd
        this.lines = wrapText(source.toString(), paint, width)
    }

    override val height: Int
        get() = (lines.size * paint.textSize * spacingMult + spacingAdd * (lines.size - 1)).toInt()

    override val lineCount: Int
        get() = lines.size

    override fun getLineTop(line: Int): Int {
        return (line * paint.textSize * spacingMult).toInt()
    }

    override fun getLineBottom(line: Int): Int {
        return ((line + 1) * paint.textSize * spacingMult).toInt()
    }

    override fun draw(canvas: Canvas) {
        // Drawing text on bitmap is complex without proper text rendering
        // For now, this is a no-op placeholder
        // Full implementation would need font rasterization
    }

    fun draw(canvas: Canvas, x: Float, y: Float) {
        canvas.save()
        canvas.translate(x, y)
        draw(canvas)
        canvas.restore()
    }

    private fun wrapText(text: String, paint: TextPaint, maxWidth: Int): List<String> {
        val result = mutableListOf<String>()
        val words = text.split(" ")
        var currentLine = StringBuilder()

        for (word in words) {
            val testLine = if (currentLine.isEmpty()) word else "$currentLine $word"
            val testWidth = paint.measureText(testLine)

            if (testWidth > maxWidth && currentLine.isNotEmpty()) {
                result.add(currentLine.toString())
                currentLine = StringBuilder(word)
            } else {
                currentLine = StringBuilder(testLine)
            }
        }

        if (currentLine.isNotEmpty()) {
            result.add(currentLine.toString())
        }

        return result.ifEmpty { listOf("") }
    }

    /**
     * Builder for StaticLayout (modern API).
     */
    class Builder private constructor(
        private val source: CharSequence,
        private val start: Int,
        private val end: Int,
        private val paint: TextPaint,
        private val width: Int
    ) {
        private var alignment: Alignment = Alignment.ALIGN_NORMAL
        private var spacingMult: Float = 1.0f
        private var spacingAdd: Float = 0f
        private var includePad: Boolean = true

        fun setAlignment(alignment: Alignment): Builder {
            this.alignment = alignment
            return this
        }

        fun setLineSpacing(spacingAdd: Float, spacingMult: Float): Builder {
            this.spacingAdd = spacingAdd
            this.spacingMult = spacingMult
            return this
        }

        fun setIncludePad(includePad: Boolean): Builder {
            this.includePad = includePad
            return this
        }

        @Suppress("DEPRECATION")
        fun build(): StaticLayout {
            return StaticLayout(
                source.subSequence(start, end),
                paint,
                width,
                alignment,
                spacingMult,
                spacingAdd,
                includePad
            )
        }

        companion object {
            fun obtain(source: CharSequence, start: Int, end: Int, paint: TextPaint, width: Int): Builder {
                return Builder(source, start, end, paint, width)
            }
        }
    }
}

/**
 * Base Layout class.
 */
abstract class Layout(
    protected val source: CharSequence,
    protected val layoutPaint: TextPaint,
    protected val layoutWidth: Int,
    protected val layoutAlignment: Alignment,
    protected val layoutSpacingMult: Float,
    protected val layoutSpacingAdd: Float
) {
    enum class Alignment {
        ALIGN_NORMAL,
        ALIGN_CENTER,
        ALIGN_OPPOSITE
    }

    abstract val height: Int
    abstract val lineCount: Int
    abstract fun getLineTop(line: Int): Int
    abstract fun getLineBottom(line: Int): Int
    abstract fun draw(canvas: Canvas)

    fun getText(): CharSequence = source
    fun getPaint(): TextPaint = layoutPaint
    fun getWidth(): Int = layoutWidth
    fun getAlignment(): Alignment = layoutAlignment
}

