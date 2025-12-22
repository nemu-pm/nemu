package okhttp3

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.jsonArray
import okhttp3.internal.syncHttpRequest
import okhttp3.internal.getResultStatus
import okhttp3.internal.getResultStatusText
import okhttp3.internal.getResultHeadersJson
import okhttp3.internal.getResultBody
import okhttp3.internal.getResultError

/**
 * OkHttpClient shim for WASM.
 * HTTP requests use synchronous XMLHttpRequest via JS interop.
 * 
 * IMPORTANT: This only works in a Web Worker context!
 * Synchronous XHR is blocked in the main thread of modern browsers.
 */
class OkHttpClient private constructor(
    private val interceptors: List<Interceptor>,
    private val networkInterceptors: List<Interceptor>
) {
    constructor() : this(emptyList(), emptyList())
    
    fun newCall(request: Request): Call {
        return Call(request, interceptors, networkInterceptors)
    }
    
    fun newBuilder(): Builder = Builder(interceptors.toMutableList(), networkInterceptors.toMutableList())
    
    class Builder(
        private val interceptors: MutableList<Interceptor> = mutableListOf(),
        private val networkInterceptors: MutableList<Interceptor> = mutableListOf()
    ) {
        constructor() : this(mutableListOf(), mutableListOf())
        
        fun addInterceptor(interceptor: Interceptor): Builder {
            interceptors.add(interceptor)
            return this
        }
        
        fun addInterceptor(interceptor: (Interceptor.Chain) -> Response): Builder {
            interceptors.add(object : Interceptor {
                override fun intercept(chain: Interceptor.Chain): Response = interceptor(chain)
            })
            return this
        }
        
        fun addNetworkInterceptor(interceptor: Interceptor): Builder {
            networkInterceptors.add(interceptor)
            return this
        }
        
        fun connectTimeout(timeout: Long, unit: java.util.concurrent.TimeUnit): Builder = this
        fun readTimeout(timeout: Long, unit: java.util.concurrent.TimeUnit): Builder = this
        fun writeTimeout(timeout: Long, unit: java.util.concurrent.TimeUnit): Builder = this
        fun callTimeout(timeout: Long, unit: java.util.concurrent.TimeUnit): Builder = this
        
        fun build(): OkHttpClient = OkHttpClient(interceptors.toList(), networkInterceptors.toList())
    }
    
    class Call(
        val request: Request,
        private val interceptors: List<Interceptor>,
        private val networkInterceptors: List<Interceptor>
    ) {
        private var executed = false
        
        /**
         * Execute the HTTP request synchronously.
         * Uses synchronous XMLHttpRequest - MUST run in Web Worker!
         */
        fun execute(): Response {
            if (executed) {
                throw IllegalStateException("Already executed")
            }
            executed = true
            
            var currentRequest = request
            
            // Apply interceptors (simple implementation - just runs them in order)
            val chain = RealInterceptorChain(currentRequest, interceptors + networkInterceptors, 0) { req ->
                makeNetworkCall(req)
            }
            
            return if (interceptors.isEmpty() && networkInterceptors.isEmpty()) {
                makeNetworkCall(currentRequest)
            } else {
                chain.proceed(currentRequest)
            }
        }
    }
}

/**
 * Real chain implementation for interceptors
 */
private class RealInterceptorChain(
    override val request: Request,
    private val interceptors: List<Interceptor>,
    private val index: Int,
    private val networkCall: (Request) -> Response
) : Interceptor.Chain {
    override fun proceed(request: Request): Response {
        if (index >= interceptors.size) {
            return networkCall(request)
        }
        val next = RealInterceptorChain(request, interceptors, index + 1, networkCall)
        return interceptors[index].intercept(next)
    }
}

/**
 * Make the actual HTTP request using synchronous XHR
 */
internal fun makeNetworkCall(request: Request): Response {
    val url = request.url.toString()
    val method = request.method
    
    // Convert headers to JSON
    val headersMap = mutableMapOf<String, String>()
    request.headers.names().forEach { name ->
        headersMap[name] = request.headers.get(name) ?: ""
    }
    val headersJson = Json.encodeToString(
        kotlinx.serialization.serializer<Map<String, String>>(),
        headersMap
    )
    
    // Get body if present
    val body = request.body?.writeTo()?.decodeToString()
    
    // Make synchronous XHR call
    val result = syncHttpRequest(url, method, headersJson, body)
    
    // Check for error
    val error = getResultError(result)
    if (error != null) {
        throw java.io.IOException("HTTP request failed: $error")
    }
    
    // Parse response
    val status = getResultStatus(result)
    val statusText = getResultStatusText(result)
    
    // Parse response headers
    val responseHeadersJson = getResultHeadersJson(result)
    val responseHeaders = parseHeaders(responseHeadersJson)
    
    // Get response body
    val bodyString = getResultBody(result)
    
    // Create response body
    val contentType = responseHeaders.get("content-type")?.let { 
        MediaType.run { it.toMediaTypeOrNull() }
    }
    val responseBody = object : ResponseBody() {
        override fun string(): String = bodyString
        override fun bytes(): ByteArray = bodyString.encodeToByteArray()
        override val contentType: MediaType? = contentType
        override val contentLength: Long = bodyString.length.toLong()
    }
    
    return Response(
        request = request,
        code = status,
        message = statusText,
        headers = responseHeaders,
        _body = responseBody
    )
}

private fun parseHeaders(json: String): Headers {
    val builder = Headers.Builder()
    try {
        val jsonObj = Json.parseToJsonElement(json) as JsonObject
        for ((key, value) in jsonObj) {
            when {
                value is JsonArray -> {
                    for (v in value.jsonArray) {
                        builder.add(key, v.jsonPrimitive.content)
                    }
                }
                else -> {
                    builder.add(key, value.jsonPrimitive.content)
                }
            }
        }
    } catch (e: Exception) {
        // Ignore parsing errors
    }
    return builder.build()
}

interface Interceptor {
    fun intercept(chain: Chain): Response
    
    interface Chain {
        val request: Request
        fun proceed(request: Request): Response
    }
}
