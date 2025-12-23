package androidx.preference

import android.content.Context
import kotlinx.serialization.json.*

/**
 * Preference shims that capture schema for host UI rendering.
 * When setupPreferenceScreen is called, preferences are collected
 * and the schema can be exported via PreferenceRegistry.
 */

/**
 * Global registry for preference schemas.
 * Host can call getSchema() after extension setup to get the schema JSON.
 */
object PreferenceRegistry {
    private val schemas = mutableMapOf<String, MutableList<JsonObject>>()
    private var currentScreen: String? = null
    
    fun beginScreen(name: String) {
        currentScreen = name
        schemas.getOrPut(name) { mutableListOf() }
    }
    
    fun addPreference(def: JsonObject) {
        val screen = currentScreen ?: "default"
        schemas.getOrPut(screen) { mutableListOf() }.add(def)
    }
    
    fun getSchemaJson(screen: String = "default"): String {
        val list = schemas[screen] ?: emptyList()
        return Json.encodeToString(JsonArray.serializer(), JsonArray(list))
    }
    
    fun getAllSchemasJson(): String {
        val all = schemas.values.flatten()
        return Json.encodeToString(JsonArray.serializer(), JsonArray(all))
    }
    
    fun clear() {
        schemas.clear()
        currentScreen = null
    }
}

open class PreferenceScreen(val context: Context) {
    private val preferences = mutableListOf<Preference>()
    
    init {
        PreferenceRegistry.beginScreen("default")
    }
    
    fun addPreference(preference: Preference) {
        preferences.add(preference)
        preference.registerSchema()
    }
}

open class Preference(val context: Context) {
    var key: String = ""
    var title: CharSequence? = null
    var summary: CharSequence? = null
    var isEnabled: Boolean = true
    var dialogTitle: CharSequence? = null
    var dialogMessage: CharSequence? = null
    
    private var changeListener: OnPreferenceChangeListener? = null
    private var clickListener: OnPreferenceClickListener? = null
    
    open fun setOnPreferenceChangeListener(listener: OnPreferenceChangeListener?) {
        changeListener = listener
    }
    
    open fun setOnPreferenceChangeListener(block: (Preference, Any?) -> Boolean) {
        changeListener = object : OnPreferenceChangeListener {
            override fun onPreferenceChange(preference: Preference, newValue: Any?) = block(preference, newValue)
        }
    }
    
    open fun setOnPreferenceClickListener(listener: OnPreferenceClickListener?) {
        clickListener = listener
    }
    
    open fun registerSchema() {
        // Base class doesn't register - subclasses override
    }
    
    interface OnPreferenceChangeListener {
        fun onPreferenceChange(preference: Preference, newValue: Any?): Boolean
    }
    
    interface OnPreferenceClickListener {
        fun onPreferenceClick(preference: Preference): Boolean
    }
}

open class ListPreference(context: Context) : Preference(context) {
    var entries: Array<out CharSequence> = emptyArray()
    var entryValues: Array<out CharSequence> = emptyArray()
    var value: String? = null
    private var defaultValue: String? = null
    
    fun setDefaultValue(value: Any?) {
        this.defaultValue = value?.toString()
        this.value = this.defaultValue
    }
    
    fun findIndexOfValue(value: String): Int {
        return entryValues.indexOfFirst { it.toString() == value }
    }
    
    override fun registerSchema() {
        if (key.isNotEmpty()) {
            PreferenceRegistry.addPreference(buildJsonObject {
                put("type", "select")
                put("key", key)
                put("title", title?.toString() ?: key)
                summary?.let { put("summary", it.toString()) }
                put("values", JsonArray(entryValues.map { JsonPrimitive(it.toString()) }))
                put("titles", JsonArray(entries.map { JsonPrimitive(it.toString()) }))
                defaultValue?.let { put("default", it) }
            })
        }
    }
}

open class MultiSelectListPreference(context: Context) : Preference(context) {
    var entries: Array<out CharSequence> = emptyArray()
    var entryValues: Array<out CharSequence> = emptyArray()
    var values: Set<String>? = null
    private var defaultValues: Set<String>? = null
    
    fun setDefaultValue(value: Any?) {
        @Suppress("UNCHECKED_CAST")
        this.defaultValues = value as? Set<String>
        this.values = this.defaultValues
    }
    
    override fun registerSchema() {
        if (key.isNotEmpty()) {
            PreferenceRegistry.addPreference(buildJsonObject {
                put("type", "multi-select")
                put("key", key)
                put("title", title?.toString() ?: key)
                summary?.let { put("summary", it.toString()) }
                put("values", JsonArray(entryValues.map { JsonPrimitive(it.toString()) }))
                put("titles", JsonArray(entries.map { JsonPrimitive(it.toString()) }))
                defaultValues?.let { put("default", JsonArray(it.map { JsonPrimitive(it) })) }
            })
        }
    }
}

open class EditTextPreference(context: Context) : Preference(context) {
    var text: String? = null
    private var defaultText: String? = null
    
    fun setDefaultValue(value: Any?) {
        this.defaultText = value?.toString()
        this.text = this.defaultText
    }
    
    fun setOnBindEditTextListener(listener: (android.widget.EditText) -> Unit) {
        // No-op - no real EditText in JS
    }
    
    override fun registerSchema() {
        if (key.isNotEmpty()) {
            PreferenceRegistry.addPreference(buildJsonObject {
                put("type", "text")
                put("key", key)
                put("title", title?.toString() ?: key)
                summary?.let { put("summary", it.toString()) }
                defaultText?.let { put("default", it) }
            })
        }
    }
}

open class SwitchPreferenceCompat(context: Context) : Preference(context) {
    var isChecked: Boolean = false
    private var defaultChecked: Boolean = false
    
    fun setDefaultValue(value: Any?) {
        this.defaultChecked = value as? Boolean ?: false
        this.isChecked = this.defaultChecked
    }
    
    override fun registerSchema() {
        if (key.isNotEmpty()) {
            PreferenceRegistry.addPreference(buildJsonObject {
                put("type", "switch")
                put("key", key)
                put("title", title?.toString() ?: key)
                summary?.let { put("summary", it.toString()) }
                put("default", defaultChecked)
            })
        }
    }
}

open class CheckBoxPreference(context: Context) : Preference(context) {
    var isChecked: Boolean = false
    private var defaultChecked: Boolean = false
    
    fun setDefaultValue(value: Any?) {
        this.defaultChecked = value as? Boolean ?: false
        this.isChecked = this.defaultChecked
    }
    
    override fun registerSchema() {
        if (key.isNotEmpty()) {
            PreferenceRegistry.addPreference(buildJsonObject {
                put("type", "switch")
                put("key", key)
                put("title", title?.toString() ?: key)
                summary?.let { put("summary", it.toString()) }
                put("default", defaultChecked)
            })
        }
    }
}

// Category preference for grouping
open class PreferenceCategory(context: Context) : Preference(context) {
    // Categories are used for visual grouping only
    override fun registerSchema() {
        // Don't register - just a visual separator
    }
}
