package eu.kanade.tachiyomi.network

import okhttp3.OkHttpClient

object NetworkHelper {
    val client: OkHttpClient = OkHttpClient()
    
    val cloudflareClient: OkHttpClient = OkHttpClient()
    
    fun defaultUserAgentProvider(): String {
        return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
}

