package java.text

import java.util.Locale

abstract class Collator : Comparator<String> {
    companion object {
        fun getInstance(): Collator = DefaultCollator()
        fun getInstance(locale: Locale): Collator = DefaultCollator()
    }
}

private class DefaultCollator : Collator() {
    override fun compare(a: String, b: String): Int {
        return a.compareTo(b, ignoreCase = true)
    }
}

