package eu.kanade.tachiyomi.util

import okhttp3.Response

/**
 * Extension function to parse response as Jsoup Document.
 * In WASM, we don't use Jsoup - this is for compatibility only.
 */
fun Response.asJsoup(): org.jsoup.nodes.Document {
    val html = body?.string() ?: ""
    return org.jsoup.Jsoup.parse(html)
}

