package android.app

import android.content.Context
import android.content.SharedPreferences
import android.content.InMemorySharedPreferences

open class Application : Context() {
    override fun getSharedPreferences(name: String, mode: Int): SharedPreferences {
        return InMemorySharedPreferences.getInstance(name)
    }
}
