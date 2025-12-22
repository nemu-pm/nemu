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
    
    open fun getDisplayName(field: Int, style: Int, locale: Locale): String? {
        if (field == DAY_OF_WEEK) {
            val dayOfWeek = get(DAY_OF_WEEK)
            val names = if (style == SHORT) {
                arrayOf("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat")
            } else {
                arrayOf("Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday")
            }
            return names.getOrNull(dayOfWeek - 1)
        }
        if (field == MONTH) {
            val month = get(MONTH)
            val names = if (style == SHORT) {
                arrayOf("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
            } else {
                arrayOf("January", "February", "March", "April", "May", "June", 
                        "July", "August", "September", "October", "November", "December")
            }
            return names.getOrNull(month)
        }
        return null
    }
    
    companion object {
        const val YEAR = 1
        const val MONTH = 2
        const val DAY_OF_MONTH = 5
        const val DAY_OF_WEEK = 7
        const val HOUR_OF_DAY = 11
        const val MINUTE = 12
        const val SECOND = 13
        const val MILLISECOND = 14
        
        const val SHORT = 1
        const val LONG = 2
        
        const val SUNDAY = 1
        const val MONDAY = 2
        const val TUESDAY = 3
        const val WEDNESDAY = 4
        const val THURSDAY = 5
        const val FRIDAY = 6
        const val SATURDAY = 7
        
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
    private var dayOfWeek = THURSDAY // Jan 1, 1970 was a Thursday
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
        
        var totalDays = remaining.toInt()
        // Jan 1, 1970 was Thursday (5). Day of week: 1=Sun, 7=Sat
        dayOfWeek = ((totalDays + 4) % 7) + 1 // +4 because Jan 1 1970 was Thursday (5-1=4)
        
        var days = totalDays
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
            DAY_OF_WEEK -> dayOfWeek
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

