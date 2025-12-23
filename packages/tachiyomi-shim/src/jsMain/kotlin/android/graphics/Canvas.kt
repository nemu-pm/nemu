package android.graphics

/**
 * Android Canvas shim for Kotlin/JS.
 * Draws onto a Bitmap using raw pixel operations.
 */
class Canvas(private val bitmap: Bitmap) {
    private var translateX: Int = 0
    private var translateY: Int = 0
    private val saveStack = mutableListOf<SaveState>()

    private data class SaveState(val translateX: Int, val translateY: Int)

    /**
     * Get the backing bitmap.
     */
    fun getBitmap(): Bitmap = bitmap

    /**
     * Get canvas width.
     */
    val width: Int get() = bitmap.width

    /**
     * Get canvas height.
     */
    val height: Int get() = bitmap.height

    /**
     * Fill the entire canvas with a color.
     */
    fun drawColor(color: Int) {
        bitmap.fill(color)
    }

    /**
     * Draw a bitmap onto this canvas.
     * The entire source bitmap is drawn at (left, top).
     */
    fun drawBitmap(src: Bitmap, left: Float, top: Float, paint: Paint?) {
        drawBitmap(
            src,
            Rect(0, 0, src.width, src.height),
            Rect(left.toInt() + translateX, top.toInt() + translateY, 
                 left.toInt() + translateX + src.width, top.toInt() + translateY + src.height),
            paint
        )
    }

    /**
     * Draw a region of the source bitmap to a region on this canvas.
     * This is the primary method used by image descrambling extensions.
     */
    fun drawBitmap(src: Bitmap, srcRect: Rect, dstRect: Rect, paint: Paint?) {
        // Apply translation
        val dstLeft = dstRect.left + translateX
        val dstTop = dstRect.top + translateY
        val dstRight = dstRect.right + translateX
        val dstBottom = dstRect.bottom + translateY

        bitmap.copyRegion(
            src,
            srcRect.left, srcRect.top, srcRect.right, srcRect.bottom,
            dstLeft, dstTop, dstRight, dstBottom
        )
    }

    /**
     * Draw a bitmap with a transformation matrix (simplified - just extracts translation).
     */
    fun drawBitmap(src: Bitmap, matrix: Matrix?, paint: Paint?) {
        val tx = matrix?.getTranslateX()?.toInt() ?: 0
        val ty = matrix?.getTranslateY()?.toInt() ?: 0
        drawBitmap(
            src,
            Rect(0, 0, src.width, src.height),
            Rect(tx + translateX, ty + translateY, 
                 tx + translateX + src.width, ty + translateY + src.height),
            paint
        )
    }

    /**
     * Draw a rectangle filled with paint color.
     */
    fun drawRect(rect: Rect, paint: Paint) {
        drawRect(rect.left.toFloat(), rect.top.toFloat(), rect.right.toFloat(), rect.bottom.toFloat(), paint)
    }

    /**
     * Draw a rectangle filled with paint color.
     */
    fun drawRect(left: Float, top: Float, right: Float, bottom: Float, paint: Paint) {
        val color = paint.color
        val l = (left.toInt() + translateX).coerceIn(0, bitmap.width)
        val t = (top.toInt() + translateY).coerceIn(0, bitmap.height)
        val r = (right.toInt() + translateX).coerceIn(0, bitmap.width)
        val b = (bottom.toInt() + translateY).coerceIn(0, bitmap.height)

        for (y in t until b) {
            for (x in l until r) {
                bitmap.setPixel(x, y, color)
            }
        }
    }

    /**
     * Save the current canvas state.
     */
    fun save(): Int {
        saveStack.add(SaveState(translateX, translateY))
        return saveStack.size - 1
    }

    /**
     * Restore the most recently saved canvas state.
     */
    fun restore() {
        if (saveStack.isNotEmpty()) {
            val state = saveStack.removeAt(saveStack.lastIndex)
            translateX = state.translateX
            translateY = state.translateY
        }
    }

    /**
     * Translate subsequent drawing operations.
     */
    fun translate(dx: Float, dy: Float) {
        translateX += dx.toInt()
        translateY += dy.toInt()
    }

    /**
     * Scale (not implemented - most extensions don't need it).
     */
    fun scale(sx: Float, sy: Float) {
        // No-op for now - extensions doing descrambling use same-size regions
    }

    /**
     * Rotate (not implemented).
     */
    fun rotate(degrees: Float) {
        // No-op for now
    }

    /**
     * Clip to rectangle (simplified - just validates bounds in draw ops).
     */
    fun clipRect(rect: Rect): Boolean {
        // No-op - bounds checking happens in draw operations
        return true
    }

    fun clipRect(left: Int, top: Int, right: Int, bottom: Int): Boolean {
        return true
    }
}

/**
 * Simple Paint class for drawing operations.
 */
open class Paint(flags: Int = 0) {
    var color: Int = Color.BLACK
    var alpha: Int = 255
    var style: Style = Style.FILL
    var strokeWidth: Float = 1f
    var isAntiAlias: Boolean = (flags and ANTI_ALIAS_FLAG) != 0
    var textSize: Float = 12f
    var typeface: Typeface? = null

    enum class Style {
        FILL,
        STROKE,
        FILL_AND_STROKE
    }

    companion object {
        const val ANTI_ALIAS_FLAG = 1
        const val FILTER_BITMAP_FLAG = 2
        const val DITHER_FLAG = 4
    }
}

/**
 * Simple Typeface stub.
 */
class Typeface private constructor(val family: String, val style: Int) {
    companion object {
        const val NORMAL = 0
        const val BOLD = 1
        const val ITALIC = 2
        const val BOLD_ITALIC = 3

        val DEFAULT = Typeface("sans-serif", NORMAL)
        val DEFAULT_BOLD = Typeface("sans-serif", BOLD)
        val SANS_SERIF = Typeface("sans-serif", NORMAL)
        val SERIF = Typeface("serif", NORMAL)
        val MONOSPACE = Typeface("monospace", NORMAL)

        fun create(family: String?, style: Int): Typeface {
            return Typeface(family ?: "sans-serif", style)
        }

        fun create(family: Typeface?, style: Int): Typeface {
            return Typeface(family?.family ?: "sans-serif", style)
        }
    }
}

/**
 * Simple Matrix class for transformations.
 */
class Matrix {
    private var values = floatArrayOf(
        1f, 0f, 0f,  // scale X, skew X, translate X
        0f, 1f, 0f,  // skew Y, scale Y, translate Y
        0f, 0f, 1f   // perspective
    )

    fun reset() {
        values = floatArrayOf(1f, 0f, 0f, 0f, 1f, 0f, 0f, 0f, 1f)
    }

    fun setTranslate(dx: Float, dy: Float) {
        reset()
        values[2] = dx
        values[5] = dy
    }

    fun setScale(sx: Float, sy: Float) {
        reset()
        values[0] = sx
        values[4] = sy
    }

    fun setRotate(degrees: Float) {
        reset()
        val radians = degrees * (kotlin.math.PI / 180.0).toFloat()
        val cos = kotlin.math.cos(radians.toDouble()).toFloat()
        val sin = kotlin.math.sin(radians.toDouble()).toFloat()
        values[0] = cos
        values[1] = -sin
        values[3] = sin
        values[4] = cos
    }

    fun preTranslate(dx: Float, dy: Float) {
        values[2] += dx
        values[5] += dy
    }

    fun postTranslate(dx: Float, dy: Float) {
        values[2] += dx
        values[5] += dy
    }

    fun getTranslateX(): Float = values[2]
    fun getTranslateY(): Float = values[5]

    fun getValues(out: FloatArray) {
        values.copyInto(out, 0, 0, minOf(9, out.size))
    }

    fun setValues(values: FloatArray) {
        values.copyInto(this.values, 0, 0, minOf(9, values.size))
    }
}

