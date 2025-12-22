package java.util

/**
 * Simplified Calendar implementation.
 */
abstract class Calendar {
    protected var timeInMillis: Long = Date.currentTimeMillis()
    
    fun getTimeInMillis(): Long = timeInMillis
    fun setTimeInMillis(millis: Long) { timeInMillis = millis }
    
    fun getTime(): Date = Date(timeInMillis)
    fun setTime(date: Date) { timeInMillis = date.time }
    
    abstract fun get(field: Int): Int
    abstract fun set(field: Int, value: Int)
    
    companion object {
        const val YEAR = 1
        const val MONTH = 2
        const val DAY_OF_MONTH = 5
        const val HOUR_OF_DAY = 11
        const val MINUTE = 12
        const val SECOND = 13
        const val MILLISECOND = 14
        
        fun getInstance(): Calendar = GregorianCalendar()
        fun getInstance(locale: Locale): Calendar = GregorianCalendar()
        fun getInstance(zone: TimeZone): Calendar = GregorianCalendar()
        fun getInstance(zone: TimeZone, locale: Locale): Calendar = GregorianCalendar()
    }
}

class GregorianCalendar : Calendar() {
    private var year = 1970
    private var month = 0
    private var day = 1
    private var hour = 0
    private var minute = 0
    private var second = 0
    private var millis = 0
    
    init {
        computeFromMillis()
    }
    
    private fun computeFromMillis() {
        var remaining = timeInMillis
        millis = (remaining % 1000).toInt()
        remaining /= 1000
        second = (remaining % 60).toInt()
        remaining /= 60
        minute = (remaining % 60).toInt()
        remaining /= 60
        hour = (remaining % 24).toInt()
        remaining /= 24
        
        var days = remaining.toInt()
        year = 1970
        while (days >= daysInYear(year)) {
            days -= daysInYear(year)
            year++
        }
        
        month = 0
        while (days >= daysInMonth(year, month)) {
            days -= daysInMonth(year, month)
            month++
        }
        day = days + 1
    }
    
    private fun daysInYear(year: Int): Int = if (isLeapYear(year)) 366 else 365
    
    private fun daysInMonth(year: Int, month: Int): Int {
        return when (month) {
            1 -> if (isLeapYear(year)) 29 else 28
            3, 5, 8, 10 -> 30
            else -> 31
        }
    }
    
    private fun isLeapYear(year: Int): Boolean {
        return (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0)
    }
    
    override fun get(field: Int): Int {
        return when (field) {
            YEAR -> year
            MONTH -> month
            DAY_OF_MONTH -> day
            HOUR_OF_DAY -> hour
            MINUTE -> minute
            SECOND -> second
            MILLISECOND -> millis
            else -> 0
        }
    }
    
    override fun set(field: Int, value: Int) {
        when (field) {
            YEAR -> year = value
            MONTH -> month = value
            DAY_OF_MONTH -> day = value
            HOUR_OF_DAY -> hour = value
            MINUTE -> minute = value
            SECOND -> second = value
            MILLISECOND -> millis = value
        }
        // Recompute timeInMillis would go here
    }
}

