package okhttp3

class Request private constructor(
    val url: HttpUrl,
    val method: String,
    val headers: Headers,
    val body: RequestBody?,
    val cacheControl: CacheControl
) {
    fun newBuilder(): Builder = Builder()
        .url(url)
        .method(method, body)
        .headers(headers)
        .cacheControl(cacheControl)
    
    class Builder {
        private var url: HttpUrl? = null
        private var method: String = "GET"
        private var headers: Headers.Builder = Headers.Builder()
        private var body: RequestBody? = null
        private var cacheControl: CacheControl = CacheControl.Builder().build()
        
        fun url(url: String): Builder {
            this.url = HttpUrl.run { url.toHttpUrl() }
            return this
        }
        
        fun url(url: HttpUrl): Builder {
            this.url = url
            return this
        }
        
        fun url(url: HttpUrl.Builder): Builder {
            this.url = url.build()
            return this
        }
        
        fun header(name: String, value: String): Builder {
            headers.set(name, value)
            return this
        }
        
        fun addHeader(name: String, value: String): Builder {
            headers.add(name, value)
            return this
        }
        
        fun removeHeader(name: String): Builder {
            headers.removeAll(name)
            return this
        }
        
        fun headers(headers: Headers): Builder {
            this.headers = headers.newBuilder()
            return this
        }
        
        fun get(): Builder {
            method = "GET"
            body = null
            return this
        }
        
        fun post(body: RequestBody): Builder {
            method = "POST"
            this.body = body
            return this
        }
        
        fun put(body: RequestBody): Builder {
            method = "PUT"
            this.body = body
            return this
        }
        
        fun delete(body: RequestBody? = null): Builder {
            method = "DELETE"
            this.body = body
            return this
        }
        
        fun method(method: String, body: RequestBody?): Builder {
            this.method = method
            this.body = body
            return this
        }
        
        fun cacheControl(cacheControl: CacheControl): Builder {
            this.cacheControl = cacheControl
            return this
        }
        
        fun build(): Request {
            return Request(
                url = url ?: throw IllegalStateException("URL required"),
                method = method,
                headers = headers.build(),
                body = body,
                cacheControl = cacheControl
            )
        }
    }
}

