package android.graphics

/**
 * Android Color shim - color constants and utilities.
 * Colors are in ARGB format (same as Android).
 */
object Color {
    const val BLACK: Int = 0xFF000000.toInt()
    const val DKGRAY: Int = 0xFF444444.toInt()
    const val GRAY: Int = 0xFF888888.toInt()
    const val LTGRAY: Int = 0xFFCCCCCC.toInt()
    const val WHITE: Int = 0xFFFFFFFF.toInt()
    const val RED: Int = 0xFFFF0000.toInt()
    const val GREEN: Int = 0xFF00FF00.toInt()
    const val BLUE: Int = 0xFF0000FF.toInt()
    const val YELLOW: Int = 0xFFFFFF00.toInt()
    const val CYAN: Int = 0xFF00FFFF.toInt()
    const val MAGENTA: Int = 0xFFFF00FF.toInt()
    const val TRANSPARENT: Int = 0

    fun alpha(color: Int): Int = (color ushr 24) and 0xFF
    fun red(color: Int): Int = (color ushr 16) and 0xFF
    fun green(color: Int): Int = (color ushr 8) and 0xFF
    fun blue(color: Int): Int = color and 0xFF

    fun argb(alpha: Int, red: Int, green: Int, blue: Int): Int {
        return ((alpha and 0xFF) shl 24) or
               ((red and 0xFF) shl 16) or
               ((green and 0xFF) shl 8) or
               (blue and 0xFF)
    }

    fun rgb(red: Int, green: Int, blue: Int): Int {
        return argb(255, red, green, blue)
    }

    fun parseColor(colorString: String): Int {
        val str = colorString.trim()
        if (str.startsWith("#")) {
            val hex = str.substring(1)
            return when (hex.length) {
                6 -> (0xFF000000.toInt()) or hex.toLong(16).toInt()
                8 -> hex.toLong(16).toInt()
                3 -> {
                    val r = hex[0].toString().repeat(2).toInt(16)
                    val g = hex[1].toString().repeat(2).toInt(16)
                    val b = hex[2].toString().repeat(2).toInt(16)
                    rgb(r, g, b)
                }
                else -> BLACK
            }
        }
        return when (str.lowercase()) {
            "black" -> BLACK
            "white" -> WHITE
            "red" -> RED
            "green" -> GREEN
            "blue" -> BLUE
            else -> BLACK
        }
    }
}

