package android.text

/**
 * Stub text classes for Android compatibility.
 */

// Simplified Editable - doesn't extend CharSequence to avoid Kotlin/JS bridge issues
abstract class Editable {
    abstract val length: Int
    abstract operator fun get(index: Int): Char
    abstract fun subSequence(startIndex: Int, endIndex: Int): CharSequence
    abstract override fun toString(): String
}

interface TextWatcher {
    fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int)
    fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int)
    fun afterTextChanged(editable: Editable?)
}
