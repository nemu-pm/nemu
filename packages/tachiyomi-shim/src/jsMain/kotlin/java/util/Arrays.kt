package java.util

/**
 * Java Arrays utility class shim for Kotlin/JS.
 */
object Arrays {
    /**
     * Copy a range of elements from an array.
     */
    fun copyOfRange(original: ByteArray, from: Int, to: Int): ByteArray {
        return original.copyOfRange(from, to)
    }
    
    /**
     * Fill an array with a value.
     */
    fun fill(a: ByteArray, value: Byte) {
        a.fill(value)
    }
    
    /**
     * Fill a range of an array with a value.
     */
    fun fill(a: ByteArray, fromIndex: Int, toIndex: Int, value: Byte) {
        for (i in fromIndex until toIndex) {
            a[i] = value
        }
    }
    
    // Int array overloads
    fun copyOfRange(original: IntArray, from: Int, to: Int): IntArray {
        return original.copyOfRange(from, to)
    }
    
    fun fill(a: IntArray, value: Int) {
        a.fill(value)
    }
    
    // Generic overloads
    fun <T> copyOfRange(original: Array<T>, from: Int, to: Int): Array<T> {
        @Suppress("UNCHECKED_CAST")
        return original.copyOfRange(from, to) as Array<T>
    }
    
    fun <T> fill(a: Array<T>, value: T) {
        a.fill(value)
    }
}

