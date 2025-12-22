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

// KClass.java extension to get fake Class with classLoader
val <T : Any> kotlin.reflect.KClass<T>.java: JClass<T>
    get() = JClass()

