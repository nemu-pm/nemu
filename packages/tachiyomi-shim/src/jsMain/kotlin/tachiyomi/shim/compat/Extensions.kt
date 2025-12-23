@file:Suppress("NOTHING_TO_INLINE", "EXTENSION_SHADOWED_BY_MEMBER")

package tachiyomi.shim.compat

import java.lang.Class as JClass
import java.util.Locale

// String extensions with Locale parameter (shadowing stdlib)
inline fun String.uppercase(locale: Locale): String = this.uppercase()
inline fun String.lowercase(locale: Locale): String = this.lowercase()

// Char extensions with Locale parameter  
inline fun Char.uppercase(locale: Locale): String = this.uppercaseChar().toString()
inline fun Char.lowercase(locale: Locale): String = this.lowercaseChar().toString()

// Char.titlecase with Locale parameter
// titlecase is essentially uppercase for the first char of a word
inline fun Char.titlecase(locale: Locale): String = this.uppercaseChar().toString()

// KClass.java extension to get fake Class with classLoader
val <T : Any> kotlin.reflect.KClass<T>.java: JClass<T>
    get() = JClass()

// javaClass property for any object (emulates Kotlin JVM behavior)
val <T : Any> T.javaClass: JClass<T>
    @Suppress("UNCHECKED_CAST")
    get() = JClass()

// String constructor shims for JVM compatibility
// These emulate Java's String constructors

/**
 * Create a String from a ByteArray (equivalent to Java's new String(byte[]))
 */
@Suppress("FunctionName")
fun String(bytes: ByteArray): String = bytes.decodeToString()

/**
 * Create a String from a CharArray (equivalent to Java's new String(char[]))
 */
@Suppress("FunctionName")
fun String(chars: CharArray): String = chars.concatToString()

