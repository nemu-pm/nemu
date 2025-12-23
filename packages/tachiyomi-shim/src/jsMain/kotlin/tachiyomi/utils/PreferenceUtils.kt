package tachiyomi.utils

import android.content.SharedPreferences
import android.content.InMemorySharedPreferences
import eu.kanade.tachiyomi.source.ConfigurableSource
import eu.kanade.tachiyomi.source.preferenceKey

fun ConfigurableSource.getPreferences(): SharedPreferences {
    return InMemorySharedPreferences.getInstance(preferenceKey())
}

fun ConfigurableSource.getPreferencesLazy(init: SharedPreferences.() -> Unit = {}): Lazy<SharedPreferences> = lazy {
    getPreferences().apply(init)
}

/** Stub for UUID preference sanitization - no-op in JS */
fun SharedPreferences.sanitizeExistingUuidPrefs() {
    // No-op - legacy preference migration not needed in JS
}

