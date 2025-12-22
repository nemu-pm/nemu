package eu.kanade.tachiyomi.network.interceptor

import okhttp3.OkHttpClient

fun OkHttpClient.Builder.rateLimit(
    permits: Int,
    period: Long = 1,
): OkHttpClient.Builder {
    // Rate limiting is handled at the JS runtime level
    return this
}

fun OkHttpClient.Builder.rateLimit(
    permits: Int,
): OkHttpClient.Builder {
    return rateLimit(permits, 1)
}

