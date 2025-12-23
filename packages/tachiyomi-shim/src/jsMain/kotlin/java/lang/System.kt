package java.lang

import java.util.Date

object System {
    fun currentTimeMillis(): Long = Date.currentTimeMillis()
    
    fun getProperty(key: String): String? {
        return when (key) {
            "http.agent" -> "Tachiyomi/1.0"
            else -> null
        }
    }
    
    fun getProperty(key: String, def: String): String = getProperty(key) ?: def
}

