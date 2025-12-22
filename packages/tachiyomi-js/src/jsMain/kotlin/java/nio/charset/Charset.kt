package java.nio.charset

/**
 * Charset shim for Kotlin/JS.
 */
abstract class Charset(val name: String) {
    override fun toString() = name
}

object Charsets {
    val UTF_8: Charset = object : Charset("UTF-8") {}
    val ISO_8859_1: Charset = object : Charset("ISO-8859-1") {}
    val US_ASCII: Charset = object : Charset("US-ASCII") {}
}

// Extension function to convert ByteArray to String with charset
fun ByteArray.toString(charset: Charset): String {
    return when (charset.name) {
        "UTF-8" -> this.decodeToString()
        "ISO-8859-1" -> this.map { (it.toInt() and 0xFF).toChar() }.joinToString("")
        "US-ASCII" -> this.map { (it.toInt() and 0x7F).toChar() }.joinToString("")
        else -> this.decodeToString()
    }
}

// Extension function to convert String to ByteArray with charset
fun String.toByteArray(charset: Charset): ByteArray {
    return when (charset.name) {
        "UTF-8" -> this.encodeToByteArray()
        "ISO-8859-1" -> ByteArray(this.length) { this[it].code.toByte() }
        "US-ASCII" -> ByteArray(this.length) { (this[it].code and 0x7F).toByte() }
        else -> this.encodeToByteArray()
    }
}

