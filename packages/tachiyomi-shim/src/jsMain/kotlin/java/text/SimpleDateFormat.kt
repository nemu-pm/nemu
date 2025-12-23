package java.text

import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * ParseException for date parsing failures
 */
class ParseException(
    message: String,
    val errorOffset: Int = 0
) : Exception(message)

/**
 * Simplified SimpleDateFormat implementation for parsing dates.
 * Supports common patterns used in manga extensions.
 */
class SimpleDateFormat(
    private val pattern: String,
    private val locale: Locale = Locale.getDefault()
) {
    var timeZone: TimeZone = TimeZone.getDefault()
    
    fun parse(source: String): Date? {
        return try {
            // Try ISO 8601 format parsing
            parseIso8601(source) ?: parseCustomPattern(source)
        } catch (e: Exception) {
            null
        }
    }
    
    fun format(date: Date): String {
        // Simplified formatting - returns ISO format
        return formatIso8601(date.time)
    }
    
    private fun parseIso8601(source: String): Date? {
        // Handle ISO 8601 formats like "2024-01-15T10:30:00+000"
        val isoRegex = Regex("""(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})([+\-]\d{3,4})?""")
        val match = isoRegex.find(source) ?: return null
        
        val (year, month, day, hour, minute, second) = match.destructured
        
        // Calculate milliseconds from epoch
        val yearNum = year.toInt()
        val monthNum = month.toInt() - 1  // 0-indexed month
        val dayNum = day.toInt()
        val hourNum = hour.toInt()
        val minuteNum = minute.toInt()
        val secondNum = second.toInt()
        
        // Simple epoch calculation (not accounting for all edge cases)
        val daysFromEpoch = calculateDaysFromEpoch(yearNum, monthNum + 1, dayNum)
        val millisFromMidnight = ((hourNum * 60L + minuteNum) * 60L + secondNum) * 1000L
        val millis = daysFromEpoch * 86400000L + millisFromMidnight
        
        return Date(millis)
    }
    
    private fun parseCustomPattern(source: String): Date? {
        // Try common patterns
        // "MMMM d yyyy" -> "January 15 2024"
        val monthNames = listOf(
            "january", "february", "march", "april", "may", "june",
            "july", "august", "september", "october", "november", "december"
        )
        
        // Pattern: "MMMM d yyyy" or "MMMM d, yyyy"
        val longMonthRegex = Regex("""(\w+)\s+(\d{1,2}),?\s+(\d{4})""", RegexOption.IGNORE_CASE)
        longMonthRegex.find(source)?.let { match ->
            val (monthStr, day, year) = match.destructured
            val month = monthNames.indexOfFirst { it.equals(monthStr, ignoreCase = true) }
            if (month >= 0) {
                val daysFromEpoch = calculateDaysFromEpoch(year.toInt(), month + 1, day.toInt())
                return Date(daysFromEpoch * 86400000L)
            }
        }
        
        // Pattern: "yyyy-MM-dd" or "yyyy-MM-dd HH:mm:ss"
        val isoDateRegex = Regex("""(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{1,2}):(\d{1,2}))?""")
        isoDateRegex.find(source)?.let { match ->
            val year = match.groupValues[1].toInt()
            val month = match.groupValues[2].toInt()
            val day = match.groupValues[3].toInt()
            val hour = match.groupValues.getOrNull(4)?.toIntOrNull() ?: 0
            val minute = match.groupValues.getOrNull(5)?.toIntOrNull() ?: 0
            val second = match.groupValues.getOrNull(6)?.toIntOrNull() ?: 0
            val daysFromEpoch = calculateDaysFromEpoch(year, month, day)
            val timeMillis = ((hour * 60L + minute) * 60L + second) * 1000L
            return Date(daysFromEpoch * 86400000L + timeMillis)
        }
        
        // Pattern: "MM/dd/yyyy"
        val usDateRegex = Regex("""(\d{1,2})/(\d{1,2})/(\d{4})""")
        usDateRegex.find(source)?.let { match ->
            val (month, day, year) = match.destructured
            val daysFromEpoch = calculateDaysFromEpoch(year.toInt(), month.toInt(), day.toInt())
            return Date(daysFromEpoch * 86400000L)
        }
        
        // Japanese patterns: "yyyy年MM月dd日", "yyyy年M月d日H時"
        val jpDateRegex = Regex("""(\d{4})年(\d{1,2})月(\d{1,2})日(?:(\d{1,2})時)?""")
        jpDateRegex.find(source)?.let { match ->
            val year = match.groupValues[1].toInt()
            val month = match.groupValues[2].toInt()
            val day = match.groupValues[3].toInt()
            val hour = match.groupValues.getOrNull(4)?.toIntOrNull() ?: 0
            val daysFromEpoch = calculateDaysFromEpoch(year, month, day)
            return Date(daysFromEpoch * 86400000L + hour * 3600000L)
        }
        
        // Pattern: "yyyy/M/d"
        val slashDateRegex = Regex("""(\d{4})/(\d{1,2})/(\d{1,2})""")
        slashDateRegex.find(source)?.let { match ->
            val (year, month, day) = match.destructured
            val daysFromEpoch = calculateDaysFromEpoch(year.toInt(), month.toInt(), day.toInt())
            return Date(daysFromEpoch * 86400000L)
        }
        
        // Pattern: "yyyy.MM.dd"
        val dotDateRegex = Regex("""(\d{4})\.(\d{1,2})\.(\d{1,2})""")
        dotDateRegex.find(source)?.let { match ->
            val (year, month, day) = match.destructured
            val daysFromEpoch = calculateDaysFromEpoch(year.toInt(), month.toInt(), day.toInt())
            return Date(daysFromEpoch * 86400000L)
        }
        
        // Pattern: "M月 d, yyyy" (ComicTop style with 月 character)
        val jpMonthRegex = Regex("""(\d{1,2})月\s*(\d{1,2}),?\s*(\d{4})""")
        jpMonthRegex.find(source)?.let { match ->
            val (month, day, year) = match.destructured
            val daysFromEpoch = calculateDaysFromEpoch(year.toInt(), month.toInt(), day.toInt())
            return Date(daysFromEpoch * 86400000L)
        }
        
        return null
    }
    
    private fun calculateDaysFromEpoch(year: Int, month: Int, day: Int): Long {
        // Calculate days from Unix epoch (1970-01-01)
        var days = 0L
        
        // Add years
        for (y in 1970 until year) {
            days += if (isLeapYear(y)) 366 else 365
        }
        
        // Subtract years if before epoch
        for (y in year until 1970) {
            days -= if (isLeapYear(y)) 366 else 365
        }
        
        // Add months
        val daysInMonth = intArrayOf(31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)
        for (m in 1 until month) {
            days += daysInMonth[m - 1]
            if (m == 2 && isLeapYear(year)) days++
        }
        
        // Add days
        days += day - 1
        
        return days
    }
    
    private fun isLeapYear(year: Int): Boolean {
        return (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0)
    }
    
    private fun formatIso8601(millis: Long): String {
        // Convert millis back to date components
        var remaining = millis / 1000  // seconds
        val seconds = (remaining % 60).toInt()
        remaining /= 60
        val minutes = (remaining % 60).toInt()
        remaining /= 60
        val hours = (remaining % 24).toInt()
        remaining /= 24
        
        // Calculate year/month/day from days since epoch
        var days = remaining.toInt()
        var year = 1970
        while (days >= (if (isLeapYear(year)) 366 else 365)) {
            days -= if (isLeapYear(year)) 366 else 365
            year++
        }
        while (days < 0) {
            year--
            days += if (isLeapYear(year)) 366 else 365
        }
        
        val daysInMonth = intArrayOf(31, if (isLeapYear(year)) 29 else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)
        var month = 0
        while (days >= daysInMonth[month]) {
            days -= daysInMonth[month]
            month++
        }
        
        return "%04d-%02d-%02dT%02d:%02d:%02d+000".format(year, month + 1, days + 1, hours, minutes, seconds)
    }
}

// Helper function for string formatting (not in Kotlin/Wasm by default)
private fun String.format(vararg args: Any?): String {
    var result = this
    var index = 0
    val regex = Regex("""%(\d+\$)?[-#+ 0,(]*(\d+)?(\.\d+)?[dfsxXeEgGaAbBhHnoct%]""")
    regex.findAll(this).forEach { match ->
        if (match.value != "%%") {
            val arg = args.getOrNull(index++) ?: ""
            val replacement = when {
                match.value.endsWith("d") -> (arg as? Number)?.toLong()?.toString() ?: arg.toString()
                match.value.endsWith("s") -> arg.toString()
                match.value.contains(Regex("""\d+d""")) -> {
                    val width = Regex("""(\d+)d""").find(match.value)?.groupValues?.get(1)?.toIntOrNull() ?: 0
                    (arg as? Number)?.toLong()?.toString()?.padStart(width, '0') ?: arg.toString()
                }
                else -> arg.toString()
            }
            result = result.replaceFirst(match.value, replacement)
        }
    }
    return result
}

