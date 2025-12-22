package android.text

/**
 * Stub text classes for Android compatibility.
 */

interface Editable : CharSequence {
    override val length: Int
    override fun get(index: Int): Char
    override fun subSequence(startIndex: Int, endIndex: Int): CharSequence
}

interface TextWatcher {
    fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int)
    fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int)
    fun afterTextChanged(editable: Editable?)
}

