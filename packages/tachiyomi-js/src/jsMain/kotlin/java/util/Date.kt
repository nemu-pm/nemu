package java.util

/**
 * Java Date shim for Kotlin/JS.
 */
class Date {
    val time: Long
    
    constructor() {
        time = currentTimeMillis()
    }
    
    constructor(time: Long) {
        this.time = time
    }
    
    fun getTime(): Long = time
    
    override fun toString(): String = "Date($time)"
    
    override fun equals(other: Any?): Boolean {
        if (other !is Date) return false
        return time == other.time
    }
    
    override fun hashCode(): Int = time.hashCode()
    
    companion object {
        fun currentTimeMillis(): Long {
            // Use Kotlin/JS Date.now()
            return kotlin.js.Date.now().toLong()
        }
    }
}
