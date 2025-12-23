package java.util

/**
 * Java TimeZone shim.
 */
abstract class TimeZone {
    abstract fun getID(): String
    abstract fun getOffset(time: Long): Int
    
    companion object {
        private val UTC = object : TimeZone() {
            override fun getID(): String = "UTC"
            override fun getOffset(time: Long): Int = 0
        }
        
        fun getDefault(): TimeZone = UTC
        
        fun getTimeZone(id: String): TimeZone {
            return when (id.uppercase()) {
                "UTC", "GMT" -> UTC
                else -> object : TimeZone() {
                    override fun getID(): String = id
                    override fun getOffset(time: Long): Int = 0 // Simplified
                }
            }
        }
    }
}

