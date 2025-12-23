package java.util.concurrent

enum class TimeUnit {
    NANOSECONDS {
        override fun toNanos(d: Long): Long = d
        override fun toMicros(d: Long): Long = d / 1000L
        override fun toMillis(d: Long): Long = d / 1000000L
        override fun toSeconds(d: Long): Long = d / 1000000000L
        override fun toMinutes(d: Long): Long = d / 60000000000L
        override fun toHours(d: Long): Long = d / 3600000000000L
        override fun toDays(d: Long): Long = d / 86400000000000L
    },
    MICROSECONDS {
        override fun toNanos(d: Long): Long = d * 1000L
        override fun toMicros(d: Long): Long = d
        override fun toMillis(d: Long): Long = d / 1000L
        override fun toSeconds(d: Long): Long = d / 1000000L
        override fun toMinutes(d: Long): Long = d / 60000000L
        override fun toHours(d: Long): Long = d / 3600000000L
        override fun toDays(d: Long): Long = d / 86400000000L
    },
    MILLISECONDS {
        override fun toNanos(d: Long): Long = d * 1000000L
        override fun toMicros(d: Long): Long = d * 1000L
        override fun toMillis(d: Long): Long = d
        override fun toSeconds(d: Long): Long = d / 1000L
        override fun toMinutes(d: Long): Long = d / 60000L
        override fun toHours(d: Long): Long = d / 3600000L
        override fun toDays(d: Long): Long = d / 86400000L
    },
    SECONDS {
        override fun toNanos(d: Long): Long = d * 1000000000L
        override fun toMicros(d: Long): Long = d * 1000000L
        override fun toMillis(d: Long): Long = d * 1000L
        override fun toSeconds(d: Long): Long = d
        override fun toMinutes(d: Long): Long = d / 60L
        override fun toHours(d: Long): Long = d / 3600L
        override fun toDays(d: Long): Long = d / 86400L
    },
    MINUTES {
        override fun toNanos(d: Long): Long = d * 60000000000L
        override fun toMicros(d: Long): Long = d * 60000000L
        override fun toMillis(d: Long): Long = d * 60000L
        override fun toSeconds(d: Long): Long = d * 60L
        override fun toMinutes(d: Long): Long = d
        override fun toHours(d: Long): Long = d / 60L
        override fun toDays(d: Long): Long = d / 1440L
    },
    HOURS {
        override fun toNanos(d: Long): Long = d * 3600000000000L
        override fun toMicros(d: Long): Long = d * 3600000000L
        override fun toMillis(d: Long): Long = d * 3600000L
        override fun toSeconds(d: Long): Long = d * 3600L
        override fun toMinutes(d: Long): Long = d * 60L
        override fun toHours(d: Long): Long = d
        override fun toDays(d: Long): Long = d / 24L
    },
    DAYS {
        override fun toNanos(d: Long): Long = d * 86400000000000L
        override fun toMicros(d: Long): Long = d * 86400000000L
        override fun toMillis(d: Long): Long = d * 86400000L
        override fun toSeconds(d: Long): Long = d * 86400L
        override fun toMinutes(d: Long): Long = d * 1440L
        override fun toHours(d: Long): Long = d * 24L
        override fun toDays(d: Long): Long = d
    };
    
    abstract fun toNanos(d: Long): Long
    abstract fun toMicros(d: Long): Long
    abstract fun toMillis(d: Long): Long
    abstract fun toSeconds(d: Long): Long
    abstract fun toMinutes(d: Long): Long
    abstract fun toHours(d: Long): Long
    abstract fun toDays(d: Long): Long
}

