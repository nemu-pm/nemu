package eu.kanade.tachiyomi.network.interceptor

import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Response
import java.util.concurrent.TimeUnit
import kotlin.time.Duration
import kotlin.time.Duration.Companion.milliseconds
import kotlin.time.Duration.Companion.seconds

/**
 * An OkHttp interceptor that handles rate limiting.
 *
 * This uses `java.time` APIs and is the legacy method, kept
 * for compatibility reasons with existing extensions.
 *
 * Examples:
 *
 * permits = 5,  period = 1, unit = seconds  =>  5 requests per second
 * permits = 10, period = 2, unit = minutes  =>  10 requests per 2 minutes
 *
 * @param permits [Int]   Number of requests allowed within a period of units.
 * @param period [Long]   The limiting duration. Defaults to 1.
 * @param unit [TimeUnit] The unit of time for the period. Defaults to seconds.
 */
fun OkHttpClient.Builder.rateLimit(
    permits: Int,
    period: Long = 1,
    unit: TimeUnit = TimeUnit.SECONDS,
) = addInterceptor(RateLimitInterceptor(permits, unit.toMillis(period).milliseconds))

/**
 * An OkHttp interceptor that handles rate limiting.
 *
 * Examples:
 *
 * permits = 5,  period = 1.seconds  =>  5 requests per second
 * permits = 10, period = 2.minutes  =>  10 requests per 2 minutes
 *
 * @param permits [Int]     Number of requests allowed within a period of units.
 * @param period [Duration] The limiting duration. Defaults to 1.seconds.
 */
fun OkHttpClient.Builder.rateLimit(permits: Int, period: Duration = 1.seconds) =
    addInterceptor(RateLimitInterceptor(permits, period))

/**
 * Rate limit interceptor for Kotlin/JS.
 * 
 * Uses a simple token bucket algorithm with busy-wait for synchronous execution context.
 * This works because we're running in a Web Worker with synchronous XHR.
 * 
 * Note: No synchronization needed in JS (single-threaded).
 */
internal class RateLimitInterceptor(
    private val permits: Int,
    period: Duration,
) : Interceptor {

    private val requestQueue = ArrayDeque<Long>()
    private val rateLimitMillis = period.inWholeMilliseconds

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        
        // Remove expired timestamps
        val periodStart = currentTimeMillis() - rateLimitMillis
        while (requestQueue.isNotEmpty() && requestQueue.first() <= periodStart) {
            requestQueue.removeFirst()
        }
        
        // If queue is full, wait for the oldest entry to expire
        if (requestQueue.size >= permits) {
            val oldestTimestamp = requestQueue.first()
            val waitTime = oldestTimestamp + rateLimitMillis - currentTimeMillis()
            if (waitTime > 0) {
                busyWait(waitTime)
                // After waiting, clean up again
                val newPeriodStart = currentTimeMillis() - rateLimitMillis
                while (requestQueue.isNotEmpty() && requestQueue.first() <= newPeriodStart) {
                    requestQueue.removeFirst()
                }
            }
        }
        
        // Add current request timestamp
        requestQueue.addLast(currentTimeMillis())
        
        return chain.proceed(request)
    }
    
    /**
     * Busy-wait for the specified duration.
     * In a Web Worker with synchronous XHR, this is the only way to "sleep".
     */
    private fun busyWait(millis: Long) {
        val end = currentTimeMillis() + millis
        @Suppress("ControlFlowWithEmptyBody")
        while (currentTimeMillis() < end) {
            // Spin
        }
    }
}

// JS-compatible time function
private fun currentTimeMillis(): Long = js("Date.now()").unsafeCast<Double>().toLong()
