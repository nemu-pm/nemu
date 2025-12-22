package android.graphics

import java.io.OutputStream

/**
 * Android Bitmap shim for Kotlin/JS.
 * Backed by raw RGBA pixel data for sync operations in web workers.
 */
class Bitmap private constructor(
    val width: Int,
    val height: Int,
    private val pixels: IntArray // ARGB format (same as Android)
) {
    /**
     * Get pixel at (x, y) in ARGB format.
     */
    fun getPixel(x: Int, y: Int): Int {
        if (x < 0 || x >= width || y < 0 || y >= height) return 0
        return pixels[y * width + x]
    }

    /**
     * Set pixel at (x, y) in ARGB format.
     */
    fun setPixel(x: Int, y: Int, color: Int) {
        if (x < 0 || x >= width || y < 0 || y >= height) return
        pixels[y * width + x] = color
    }

    /**
     * Get pixels into array.
     */
    fun getPixels(pixels: IntArray, offset: Int, stride: Int, x: Int, y: Int, width: Int, height: Int) {
        for (row in 0 until height) {
            for (col in 0 until width) {
                val srcIdx = (y + row) * this.width + (x + col)
                val dstIdx = offset + row * stride + col
                if (srcIdx < this.pixels.size && dstIdx < pixels.size) {
                    pixels[dstIdx] = this.pixels[srcIdx]
                }
            }
        }
    }

    /**
     * Set pixels from array.
     */
    fun setPixels(pixels: IntArray, offset: Int, stride: Int, x: Int, y: Int, width: Int, height: Int) {
        for (row in 0 until height) {
            for (col in 0 until width) {
                val srcIdx = offset + row * stride + col
                val dstIdx = (y + row) * this.width + (x + col)
                if (srcIdx < pixels.size && dstIdx < this.pixels.size) {
                    this.pixels[dstIdx] = pixels[srcIdx]
                }
            }
        }
    }

    /**
     * Internal access to raw pixel buffer.
     */
    internal fun getPixelBuffer(): IntArray = pixels

    /**
     * Copy a region of another bitmap into this bitmap.
     * Used internally by Canvas.drawBitmap.
     */
    internal fun copyRegion(
        src: Bitmap,
        srcLeft: Int, srcTop: Int, srcRight: Int, srcBottom: Int,
        dstLeft: Int, dstTop: Int, dstRight: Int, dstBottom: Int
    ) {
        val srcWidth = srcRight - srcLeft
        val srcHeight = srcBottom - srcTop
        val dstWidth = dstRight - dstLeft
        val dstHeight = dstBottom - dstTop

        // Simple copy (no scaling) - extensions typically use same-size regions
        for (row in 0 until minOf(srcHeight, dstHeight)) {
            for (col in 0 until minOf(srcWidth, dstWidth)) {
                val srcX = srcLeft + col
                val srcY = srcTop + row
                val dstX = dstLeft + col
                val dstY = dstTop + row

                if (srcX in 0 until src.width && srcY in 0 until src.height &&
                    dstX in 0 until width && dstY in 0 until height
                ) {
                    pixels[dstY * width + dstX] = src.pixels[srcY * src.width + srcX]
                }
            }
        }
    }

    /**
     * Fill entire bitmap with a color.
     */
    internal fun fill(color: Int) {
        pixels.fill(color)
    }

    /**
     * Compress bitmap to PNG or JPEG format.
     * Uses JS jpeg-js library via ImageBridge for reliable encoding.
     */
    fun compress(format: CompressFormat, quality: Int, stream: OutputStream): Boolean {
        return try {
            val bytes = when (format) {
                CompressFormat.JPEG -> ImageBridge.encodeJpeg(pixels, width, height, quality)
                CompressFormat.PNG -> ImageBridge.encodePng(pixels, width, height)
                CompressFormat.WEBP, CompressFormat.WEBP_LOSSY, CompressFormat.WEBP_LOSSLESS -> {
                    // Fall back to PNG for WebP
                    ImageBridge.encodePng(pixels, width, height)
                }
            }
            stream.write(bytes)
            true
        } catch (e: Exception) {
            println("[Bitmap] compress error: ${e.message}")
            false
        }
    }

    /**
     * Recycle bitmap (no-op in JS, but keeps API compatibility).
     */
    fun recycle() {
        // No-op - GC handles cleanup
    }

    /**
     * Check if bitmap is recycled.
     */
    val isRecycled: Boolean = false

    enum class Config {
        ALPHA_8,
        RGB_565,
        ARGB_4444,
        ARGB_8888,
        RGBA_F16,
        HARDWARE
    }

    enum class CompressFormat {
        JPEG,
        PNG,
        WEBP,
        WEBP_LOSSY,
        WEBP_LOSSLESS
    }

    companion object {
        /**
         * Create a mutable bitmap with the specified width and height.
         */
        fun createBitmap(width: Int, height: Int, config: Config): Bitmap {
            val pixels = IntArray(width * height) { 0 } // Transparent black
            return Bitmap(width, height, pixels)
        }

        /**
         * Create a bitmap from existing pixel data (used by BitmapFactory).
         */
        internal fun createFromPixels(width: Int, height: Int, pixels: IntArray): Bitmap {
            return Bitmap(width, height, pixels)
        }

        /**
         * Create a copy of an existing bitmap.
         */
        fun createBitmap(src: Bitmap): Bitmap {
            return Bitmap(src.width, src.height, src.pixels.copyOf())
        }

        /**
         * Create a bitmap from a region of another bitmap.
         */
        fun createBitmap(src: Bitmap, x: Int, y: Int, width: Int, height: Int): Bitmap {
            val pixels = IntArray(width * height)
            for (row in 0 until height) {
                for (col in 0 until width) {
                    val srcX = x + col
                    val srcY = y + row
                    if (srcX in 0 until src.width && srcY in 0 until src.height) {
                        pixels[row * width + col] = src.pixels[srcY * src.width + srcX]
                    }
                }
            }
            return Bitmap(width, height, pixels)
        }
    }
}

