package androidx.preference

import android.content.Context

/**
 * Stub preference classes - preferences UI is not used in WASM.
 * Extensions call setupPreferenceScreen but we just ignore it.
 */

open class PreferenceScreen(val context: Context) {
    private val preferences = mutableListOf<Preference>()
    
    fun addPreference(preference: Preference) {
        preferences.add(preference)
    }
}

open class Preference(val context: Context) {
    var key: String = ""
    var title: CharSequence? = null
    var summary: CharSequence? = null
    var isEnabled: Boolean = true
    
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
    
    interface OnPreferenceChangeListener {
        fun onPreferenceChange(preference: Preference, newValue: Any?): Boolean
    }
    
    interface OnPreferenceClickListener {
        fun onPreferenceClick(preference: Preference): Boolean
    }
}

open class ListPreference(context: Context) : Preference(context) {
    var entries: Array<out CharSequence> = emptyArray()
        set(value) { field = value }
    var entryValues: Array<out CharSequence> = emptyArray()
        set(value) { field = value }
    var value: String? = null
    
    fun setDefaultValue(value: Any?) {
        this.value = value?.toString()
    }
    
    fun findIndexOfValue(value: String): Int {
        return entryValues.indexOfFirst { it.toString() == value }
    }
}

open class MultiSelectListPreference(context: Context) : Preference(context) {
    var entries: Array<out CharSequence> = emptyArray()
        set(value) { field = value }
    var entryValues: Array<out CharSequence> = emptyArray()
        set(value) { field = value }
    var values: Set<String>? = null
    
    fun setDefaultValue(value: Any?) {
        @Suppress("UNCHECKED_CAST")
        this.values = value as? Set<String>
    }
}

open class EditTextPreference(context: Context) : Preference(context) {
    var text: String? = null
    
    fun setDefaultValue(value: Any?) {
        this.text = value?.toString()
    }
    
    fun setOnBindEditTextListener(listener: (android.widget.EditText) -> Unit) {
        // No-op in WASM
    }
}

open class SwitchPreferenceCompat(context: Context) : Preference(context) {
    var isChecked: Boolean = false
    
    fun setDefaultValue(value: Any?) {
        this.isChecked = value as? Boolean ?: false
    }
}

open class CheckBoxPreference(context: Context) : Preference(context) {
    var isChecked: Boolean = false
    
    fun setDefaultValue(value: Any?) {
        this.isChecked = value as? Boolean ?: false
    }
}
