package eu.kanade.tachiyomi.network

import kotlinx.serialization.json.Json
import okhttp3.CacheControl
import okhttp3.Headers
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import rx.Observable

fun GET(
    url: String,
    headers: Headers = Headers.Builder().build(),
    cache: CacheControl = CacheControl.Builder().build(),
): Request {
    return Request.Builder()
        .url(url)
        .headers(headers)
        .cacheControl(cache)
        .build()
}

fun GET(
    url: okhttp3.HttpUrl,
    headers: Headers = Headers.Builder().build(),
    cache: CacheControl = CacheControl.Builder().build(),
): Request {
    return Request.Builder()
        .url(url)
        .headers(headers)
        .cacheControl(cache)
        .build()
}

fun POST(
    url: String,
    headers: Headers = Headers.Builder().build(),
    body: okhttp3.RequestBody = okhttp3.FormBody.Builder().build(),
    cache: CacheControl = CacheControl.Builder().build(),
): Request {
    return Request.Builder()
        .url(url)
        .headers(headers)
        .post(body)
        .cacheControl(cache)
        .build()
}

/**
 * Convert Call to Observable (synchronous execution)
 */
fun OkHttpClient.Call.asObservable(): Observable<Response> {
    val call = this
    return Observable.defer {
        Observable.just(call.execute())
    }
}

/**
 * Convert Call to Observable with success check
 */
fun OkHttpClient.Call.asObservableSuccess(): Observable<Response> {
    return asObservable().map { response ->
        if (!response.isSuccessful) {
            throw Exception("HTTP error ${response.code}: ${response.message}")
        }
        response
    }
}

/**
 * Execute call and check for success
 */
fun OkHttpClient.Call.awaitSuccess(): Response {
    val response = execute()
    if (!response.isSuccessful) {
        throw Exception("HTTP error ${response.code}: ${response.message}")
    }
    return response
}

/**
 * Execute call
 */
fun OkHttpClient.Call.await(): Response {
    return execute()
}

/**
 * Extension to create a call with progress tracking (no-op for now)
 */
fun OkHttpClient.newCachelessCallWithProgress(request: Request, page: eu.kanade.tachiyomi.source.model.Page): OkHttpClient.Call {
    return newCall(request)
}

/**
 * Parse response body as JSON
 */
inline fun <reified T> Response.parseAs(): T {
    return Json { ignoreUnknownKeys = true }.decodeFromString(body.string())
}

/**
 * Parse response body as JSON with custom Json instance
 */
inline fun <reified T> Response.parseAs(json: Json): T {
    return json.decodeFromString(body.string())
}
