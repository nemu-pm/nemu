package java.lang.ref

/**
 * SoftReference shim for JS environment.
 * 
 * In JS there's no GC control, so this just holds the value directly.
 * The value will never be cleared automatically (no memory pressure concept in JS).
 */
class SoftReference<T>(private var referent: T?) {
    
    /**
     * Returns this reference object's referent.
     */
    fun get(): T? = referent
    
    /**
     * Clears this reference object.
     */
    fun clear() {
        referent = null
    }
    
    /**
     * Check if the referent has been cleared.
     */
    fun isEnqueued(): Boolean = referent == null
}

/**
 * WeakReference shim - same as SoftReference in JS environment.
 */
class WeakReference<T>(private var referent: T?) {
    fun get(): T? = referent
    fun clear() { referent = null }
    fun isEnqueued(): Boolean = referent == null
}

