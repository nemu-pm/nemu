package java.util

/**
 * Simplified Calendar implementation.
 */
abstract class Calendar {
    var timeInMillis: Long = Date.currentTimeMillis()
    
    fun getTimeInMillis(): Long = timeInMillis
    fun setTimeInMillis(millis: Long) { timeInMillis = millis }
    
    fun getTime(): Date = Date(timeInMillis)
    fun setTime(date: Date) { timeInMillis = date.time }
    
    abstract fun get(field: Int): Int
    abstract fun set(field: Int, value: Int)
    abstract fun add(field: Int, amount: Int)
    
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
        const val HOUR = 10
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
    
    private fun computeTimeInMillis() {
        // Calculate days from epoch
        var totalDays = 0L
        for (y in 1970 until year) {
            totalDays += daysInYear(y)
        }
        for (m in 0 until month) {
            totalDays += daysInMonth(year, m)
        }
        totalDays += day - 1
        
        timeInMillis = totalDays * 24 * 60 * 60 * 1000 +
            hour * 60 * 60 * 1000 +
            minute * 60 * 1000 +
            second * 1000 +
            millis
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
            HOUR, HOUR_OF_DAY -> hour
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
            HOUR, HOUR_OF_DAY -> hour = value
            MINUTE -> minute = value
            SECOND -> second = value
            MILLISECOND -> millis = value
        }
        computeTimeInMillis()
    }
    
    override fun add(field: Int, amount: Int) {
        when (field) {
            YEAR -> {
                year += amount
            }
            MONTH -> {
                month += amount
                while (month < 0) {
                    month += 12
                    year--
                }
                while (month > 11) {
                    month -= 12
                    year++
                }
            }
            DAY_OF_MONTH -> {
                day += amount
                while (day < 1) {
                    month--
                    if (month < 0) {
                        month = 11
                        year--
                    }
                    day += daysInMonth(year, month)
                }
                while (day > daysInMonth(year, month)) {
                    day -= daysInMonth(year, month)
                    month++
                    if (month > 11) {
                        month = 0
                        year++
                    }
                }
            }
            HOUR, HOUR_OF_DAY -> {
                hour += amount
                while (hour < 0) {
                    hour += 24
                    add(DAY_OF_MONTH, -1)
                }
                while (hour >= 24) {
                    hour -= 24
                    add(DAY_OF_MONTH, 1)
                }
            }
            MINUTE -> {
                minute += amount
                while (minute < 0) {
                    minute += 60
                    add(HOUR_OF_DAY, -1)
                }
                while (minute >= 60) {
                    minute -= 60
                    add(HOUR_OF_DAY, 1)
                }
            }
            SECOND -> {
                second += amount
                while (second < 0) {
                    second += 60
                    add(MINUTE, -1)
                }
                while (second >= 60) {
                    second -= 60
                    add(MINUTE, 1)
                }
            }
            MILLISECOND -> {
                millis += amount
                while (millis < 0) {
                    millis += 1000
                    add(SECOND, -1)
                }
                while (millis >= 1000) {
                    millis -= 1000
                    add(SECOND, 1)
                }
            }
        }
        computeTimeInMillis()
    }
}

