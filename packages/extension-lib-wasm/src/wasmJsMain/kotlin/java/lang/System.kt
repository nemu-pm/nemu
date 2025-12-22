package java.lang

import java.util.Date

object System {
    fun currentTimeMillis(): Long = Date.currentTimeMillis()
    
    fun getProperty(key: String): String? {
        return when (key) {
            "http.agent" -> "Mozilla/5.0 (WASM)"
            else -> null
        }
    }
    
    fun getProperty(key: String, def: String): String = getProperty(key) ?: def
}

