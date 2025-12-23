package eu.kanade.tachiyomi.source

import android.content.SharedPreferences
import android.content.InMemorySharedPreferences
import androidx.preference.PreferenceScreen

interface ConfigurableSource : Source {
    fun getSourcePreferences(): SharedPreferences {
        return InMemorySharedPreferences.getInstance("source_$id")
    }

    fun setupPreferenceScreen(screen: PreferenceScreen) {
        // No-op by default in WASM
    }
}

fun ConfigurableSource.preferenceKey(): String = "source_$id"

