package java.lang

/**
 * Stub for java.lang.Class to support `::class.java.classLoader` pattern.
 */
class Class<T> {
    val classLoader: ClassLoader = ClassLoader()
    val name: String = "Unknown"
    val simpleName: String = "Unknown"
    val canonicalName: String? = "Unknown"
}

/**
 * Stub ClassLoader - does nothing in WASM environment.
 */
class ClassLoader {
    fun getResourceAsStream(name: String): java.io.InputStream? = null
}

