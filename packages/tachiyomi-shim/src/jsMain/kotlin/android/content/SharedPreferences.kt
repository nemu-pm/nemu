package android.content

/**
 * SharedPreferences shim with external bridge for host persistence.
 * Host provides __prefs_* functions to persist values.
 */
interface SharedPreferences {
    fun getString(key: String, defValue: String?): String?
    fun getStringSet(key: String, defValues: Set<String>?): Set<String>?
    fun getInt(key: String, defValue: Int): Int
    fun getLong(key: String, defValue: Long): Long
    fun getFloat(key: String, defValue: Float): Float
    fun getBoolean(key: String, defValue: Boolean): Boolean
    fun contains(key: String): Boolean
    fun edit(): Editor
    fun getAll(): Map<String, *>
    
    interface Editor {
        fun putString(key: String, value: String?): Editor
        fun putStringSet(key: String, values: Set<String>?): Editor
        fun putInt(key: String, value: Int): Editor
        fun putLong(key: String, value: Long): Editor
        fun putFloat(key: String, value: Float): Editor
        fun putBoolean(key: String, value: Boolean): Editor
        fun remove(key: String): Editor
        fun clear(): Editor
        fun commit(): Boolean
        fun apply()
    }
}

// External bridge functions - host provides implementations
private fun prefsGet(name: String, key: String): dynamic {
    return js("(typeof __prefs_get === 'function' ? __prefs_get(name, key) : undefined)")
}

private fun prefsSet(name: String, key: String, value: dynamic) {
    js("if (typeof __prefs_set === 'function') __prefs_set(name, key, value)")
}

private fun prefsRemove(name: String, key: String) {
    js("if (typeof __prefs_remove === 'function') __prefs_remove(name, key)")
}

private fun prefsClear(name: String) {
    js("if (typeof __prefs_clear === 'function') __prefs_clear(name)")
}

private fun prefsGetAll(name: String): dynamic {
    return js("(typeof __prefs_getAll === 'function' ? __prefs_getAll(name) : {})")
}

/**
 * SharedPreferences implementation that bridges to host via external functions.
 * Falls back to in-memory storage if bridge not available.
 */
class BridgedSharedPreferences(private val name: String) : SharedPreferences {
    // Local cache for faster reads within same session
    private val cache = mutableMapOf<String, Any?>()
    private var cacheInitialized = false
    
    private fun initCache() {
        if (cacheInitialized) return
        cacheInitialized = true
        try {
            val all = prefsGetAll(name)
            if (all != null && all != undefined) {
                val keys = js("Object.keys(all)") as Array<String>
                for (key in keys) {
                    cache[key] = all[key]
                }
            }
        } catch (e: Throwable) {
            // Bridge not available, use empty cache
        }
    }
    
    private fun getValue(key: String): Any? {
        initCache()
        // Check cache first
        if (cache.containsKey(key)) {
            return cache[key]
        }
        // Try bridge
        try {
            val value = prefsGet(name, key)
            if (value != undefined) {
                cache[key] = value
                return value
            }
        } catch (e: Throwable) {
            // Bridge not available
        }
        return null
    }
    
    override fun getString(key: String, defValue: String?): String? {
        val value = getValue(key)
        return value as? String ?: defValue
    }
    
    override fun getStringSet(key: String, defValues: Set<String>?): Set<String>? {
        val value = getValue(key)
        if (value == null) return defValues
        // JS arrays need conversion
        return try {
            @Suppress("UNCHECKED_CAST")
            when (value) {
                is Set<*> -> value as Set<String>
                is Array<*> -> (value as Array<String>).toSet()
                else -> {
                    val arr = value.unsafeCast<Array<String>>()
                    arr.toSet()
                }
            }
        } catch (e: Throwable) {
            defValues
        }
    }
    
    override fun getInt(key: String, defValue: Int): Int {
        val value = getValue(key)
        return (value as? Number)?.toInt() ?: defValue
    }
    
    override fun getLong(key: String, defValue: Long): Long {
        val value = getValue(key)
        return (value as? Number)?.toLong() ?: defValue
    }
    
    override fun getFloat(key: String, defValue: Float): Float {
        val value = getValue(key)
        return (value as? Number)?.toFloat() ?: defValue
    }
    
    override fun getBoolean(key: String, defValue: Boolean): Boolean {
        val value = getValue(key)
        return value as? Boolean ?: defValue
    }
    
    override fun contains(key: String): Boolean {
        initCache()
        return cache.containsKey(key) || getValue(key) != null
    }
    
    override fun getAll(): Map<String, *> {
        initCache()
        return cache.toMap()
    }
    
    override fun edit(): SharedPreferences.Editor = EditorImpl()
    
    private inner class EditorImpl : SharedPreferences.Editor {
        private val changes = mutableMapOf<String, Any?>()
        private val removals = mutableSetOf<String>()
        private var clearAll = false
        
        override fun putString(key: String, value: String?): SharedPreferences.Editor {
            changes[key] = value
            removals.remove(key)
            return this
        }
        
        override fun putStringSet(key: String, values: Set<String>?): SharedPreferences.Editor {
            // Store as array for JS compatibility
            changes[key] = values?.toTypedArray()
            removals.remove(key)
            return this
        }
        
        override fun putInt(key: String, value: Int): SharedPreferences.Editor {
            changes[key] = value
            removals.remove(key)
            return this
        }
        
        override fun putLong(key: String, value: Long): SharedPreferences.Editor {
            changes[key] = value
            removals.remove(key)
            return this
        }
        
        override fun putFloat(key: String, value: Float): SharedPreferences.Editor {
            changes[key] = value
            removals.remove(key)
            return this
        }
        
        override fun putBoolean(key: String, value: Boolean): SharedPreferences.Editor {
            changes[key] = value
            removals.remove(key)
            return this
        }
        
        override fun remove(key: String): SharedPreferences.Editor {
            removals.add(key)
            changes.remove(key)
            return this
        }
        
        override fun clear(): SharedPreferences.Editor {
            clearAll = true
            changes.clear()
            removals.clear()
            return this
        }
        
        override fun commit(): Boolean {
            applyChanges()
            return true
        }
        
        override fun apply() {
            applyChanges()
        }
        
        private fun applyChanges() {
            if (clearAll) {
                cache.clear()
                try { prefsClear(name) } catch (e: Throwable) {}
            }
            
            for (key in removals) {
                cache.remove(key)
                try { prefsRemove(name, key) } catch (e: Throwable) {}
            }
            
            for ((key, value) in changes) {
                cache[key] = value
                try { prefsSet(name, key, value) } catch (e: Throwable) {}
            }
        }
    }
    
    companion object {
        private val instances = mutableMapOf<String, BridgedSharedPreferences>()
        
        fun getInstance(name: String): SharedPreferences {
            return instances.getOrPut(name) { BridgedSharedPreferences(name) }
        }
    }
}

/**
 * Legacy alias for backwards compatibility.
 */
typealias InMemorySharedPreferences = BridgedSharedPreferences

open class Context {
    companion object {
        const val MODE_PRIVATE = 0
    }
    
    open fun getSharedPreferences(name: String, mode: Int): SharedPreferences {
        return BridgedSharedPreferences.getInstance(name)
    }
}

/**
 * Android's SharedPreferences.edit {} extension function
 */
inline fun SharedPreferences.edit(
    commit: Boolean = false,
    action: SharedPreferences.Editor.() -> Unit
) {
    val editor = edit()
    action(editor)
    if (commit) {
        editor.commit()
    } else {
        editor.apply()
    }
}
