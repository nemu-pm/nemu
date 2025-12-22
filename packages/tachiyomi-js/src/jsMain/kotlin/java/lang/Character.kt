package java.lang

/**
 * Character utility class shim.
 */
object Character {
    /**
     * Returns the numeric value of the character in the specified radix.
     * Returns -1 if the character is not a valid digit in the radix.
     */
    fun digit(c: Char, radix: Int): Int {
        val code = c.code
        return when {
            code in '0'.code..'9'.code -> {
                val value = code - '0'.code
                if (value < radix) value else -1
            }
            code in 'a'.code..'z'.code -> {
                val value = code - 'a'.code + 10
                if (value < radix) value else -1
            }
            code in 'A'.code..'Z'.code -> {
                val value = code - 'A'.code + 10
                if (value < radix) value else -1
            }
            else -> -1
        }
    }
    
    fun isDigit(c: Char): Boolean = c in '0'..'9'
    
    fun isLetter(c: Char): Boolean = c in 'a'..'z' || c in 'A'..'Z'
    
    fun isLetterOrDigit(c: Char): Boolean = isLetter(c) || isDigit(c)
    
    fun isWhitespace(c: Char): Boolean = c == ' ' || c == '\t' || c == '\n' || c == '\r'
    
    fun toLowerCase(c: Char): Char = c.lowercaseChar()
    
    fun toUpperCase(c: Char): Char = c.uppercaseChar()
}

