package android.content

/**
 * SharedPreferences shim using in-memory storage.
 * The JS runtime will sync this with localStorage.
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

class InMemorySharedPreferences(private val name: String) : SharedPreferences {
    private val data = mutableMapOf<String, Any?>()
    
    override fun getString(key: String, defValue: String?): String? {
        return data[key] as? String ?: defValue
    }
    
    override fun getStringSet(key: String, defValues: Set<String>?): Set<String>? {
        @Suppress("UNCHECKED_CAST")
        return data[key] as? Set<String> ?: defValues
    }
    
    override fun getInt(key: String, defValue: Int): Int {
        return (data[key] as? Number)?.toInt() ?: defValue
    }
    
    override fun getLong(key: String, defValue: Long): Long {
        return (data[key] as? Number)?.toLong() ?: defValue
    }
    
    override fun getFloat(key: String, defValue: Float): Float {
        return (data[key] as? Number)?.toFloat() ?: defValue
    }
    
    override fun getBoolean(key: String, defValue: Boolean): Boolean {
        return data[key] as? Boolean ?: defValue
    }
    
    override fun contains(key: String): Boolean = data.containsKey(key)
    
    override fun getAll(): Map<String, *> = data.toMap()
    
    override fun edit(): SharedPreferences.Editor = EditorImpl()
    
    private inner class EditorImpl : SharedPreferences.Editor {
        private val changes = mutableMapOf<String, Any?>()
        private val removals = mutableSetOf<String>()
        private var clearAll = false
        
        override fun putString(key: String, value: String?): SharedPreferences.Editor {
            changes[key] = value
            return this
        }
        
        override fun putStringSet(key: String, values: Set<String>?): SharedPreferences.Editor {
            changes[key] = values?.toSet()
            return this
        }
        
        override fun putInt(key: String, value: Int): SharedPreferences.Editor {
            changes[key] = value
            return this
        }
        
        override fun putLong(key: String, value: Long): SharedPreferences.Editor {
            changes[key] = value
            return this
        }
        
        override fun putFloat(key: String, value: Float): SharedPreferences.Editor {
            changes[key] = value
            return this
        }
        
        override fun putBoolean(key: String, value: Boolean): SharedPreferences.Editor {
            changes[key] = value
            return this
        }
        
        override fun remove(key: String): SharedPreferences.Editor {
            removals.add(key)
            return this
        }
        
        override fun clear(): SharedPreferences.Editor {
            clearAll = true
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
                data.clear()
            }
            removals.forEach { data.remove(it) }
            data.putAll(changes)
        }
    }
    
    companion object {
        private val instances = mutableMapOf<String, InMemorySharedPreferences>()
        
        fun getInstance(name: String): SharedPreferences {
            return instances.getOrPut(name) { InMemorySharedPreferences(name) }
        }
    }
}

open class Context {
    companion object {
        const val MODE_PRIVATE = 0
    }
    
    open fun getSharedPreferences(name: String, mode: Int): SharedPreferences {
        return InMemorySharedPreferences.getInstance(name)
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
