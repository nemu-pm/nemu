package okhttp3

class Response(
    val request: Request,
    val code: Int,
    val message: String,
    val headers: Headers,
    private val _body: ResponseBody?
) {
    val body: ResponseBody
        get() = _body ?: EmptyResponseBody
    
    private object EmptyResponseBody : ResponseBody() {
        override fun string(): String = ""
        override fun bytes(): ByteArray = ByteArray(0)
        override val contentType: MediaType? = null
        override val contentLength: Long = 0
    }

    val isSuccessful: Boolean
        get() = code in 200..299
    
    inline fun <T> use(block: (Response) -> T): T {
        return try {
            block(this)
        } finally {
            close()
        }
    }
    
    fun close() {
        body.close()
    }
    
    /**
     * Returns a new response body that can be read multiple times.
     * This allows examining the body without consuming it.
     * 
     * @param byteCount Maximum number of bytes to peek (ignored in this implementation,
     *                  we always return the full body for simplicity)
     */
    fun peekBody(byteCount: Long): ResponseBody {
        val bytes = body.bytes()
        return object : ResponseBody() {
            override fun string(): String = bytes.decodeToString()
            override fun bytes(): ByteArray = bytes
            override val contentType: MediaType? = body.contentType
            override val contentLength: Long = bytes.size.toLong()
        }
    }
    
    fun newBuilder(): Builder = Builder()
        .request(request)
        .code(code)
        .message(message)
        .headers(headers)
        .body(body)
    
    class Builder {
        private var request: Request? = null
        private var code: Int = -1
        private var message: String = ""
        private var headers: Headers = Headers.Builder().build()
        private var body: ResponseBody? = null
        
        fun request(request: Request): Builder {
            this.request = request
            return this
        }
        
        fun code(code: Int): Builder {
            this.code = code
            return this
        }
        
        fun message(message: String): Builder {
            this.message = message
            return this
        }
        
        fun headers(headers: Headers): Builder {
            this.headers = headers
            return this
        }
        
        fun body(body: ResponseBody?): Builder {
            this.body = body
            return this
        }
        
        fun build(): Response {
            return Response(
                request = request ?: throw IllegalStateException("Request required"),
                code = code,
                message = message,
                headers = headers,
                _body = body
            )
        }
    }
}

abstract class ResponseBody {
    abstract fun string(): String
    abstract fun bytes(): ByteArray
    abstract val contentType: MediaType?
    abstract val contentLength: Long
    
    /**
     * Returns the content type as a method (for compatibility with okhttp3 API).
     */
    @JsName("getContentType")
    fun contentType(): MediaType? = contentType
    
    open fun byteStream(): java.io.InputStream = java.io.ByteArrayInputStream(bytes())
    
    /**
     * Returns the body as an Okio BufferedSource.
     */
    open fun source(): okio.BufferedSource {
        val buffer = okio.Buffer()
        buffer.write(bytes())
        return buffer
    }
    
    open fun close() {}
    
    companion object {
        fun String.toResponseBody(contentType: MediaType? = null): ResponseBody {
            return StringResponseBody(this, contentType)
        }
        
        fun ByteArray.toResponseBody(contentType: MediaType? = null): ResponseBody {
            return ByteArrayResponseBody(this, contentType)
        }
    }
}

private class StringResponseBody(
    private val content: String,
    override val contentType: MediaType?
) : ResponseBody() {
    override fun string(): String = content
    override fun bytes(): ByteArray = content.encodeToByteArray()
    override val contentLength: Long = content.length.toLong()
}

private class ByteArrayResponseBody(
    private val content: ByteArray,
    override val contentType: MediaType?
) : ResponseBody() {
    override fun string(): String = content.decodeToString()
    override fun bytes(): ByteArray = content
    override val contentLength: Long = content.size.toLong()
}

