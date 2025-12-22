package android.widget

import android.text.Editable
import android.text.TextWatcher

/**
 * Stub widget classes - UI widgets are not used in WASM.
 */

open class View {
    var rootView: View = this
    var isEnabled: Boolean = true
    
    fun <T : View> findViewById(id: Int): T? = null
}

open class EditText : View() {
    var text: Editable = EditableImpl("")
    var error: CharSequence? = null
    
    private val textWatchers = mutableListOf<TextWatcher>()
    
    fun addTextChangedListener(watcher: TextWatcher) {
        textWatchers.add(watcher)
    }
    
    fun removeTextChangedListener(watcher: TextWatcher) {
        textWatchers.remove(watcher)
    }
}

open class Button : View()

open class TextView : View() {
    var text: CharSequence = ""
}

private class EditableImpl(private var content: String) : Editable {
    override val length: Int get() = content.length
    override fun get(index: Int): Char = content[index]
    override fun subSequence(startIndex: Int, endIndex: Int): CharSequence = content.subSequence(startIndex, endIndex)
    override fun toString(): String = content
}

// Android R class stub
object R {
    object id {
        const val button1 = 0x01020019
        const val edit = 0x01020001
    }
    object string {
        const val ok = 0x01040000
        const val cancel = 0x01040001
    }
}

