package okhttp3

// Top-level extension functions for compatibility
fun String.toHttpUrl(): HttpUrl = HttpUrl.run { toHttpUrl() }
fun String.toHttpUrlOrNull(): HttpUrl? = HttpUrl.run { toHttpUrlOrNull() }

class HttpUrl private constructor(
    val scheme: String,
    val host: String,
    val port: Int,
    val encodedPath: String,
    val encodedQuery: String?,
    val fragment: String?
) {
    /**
     * Returns the path segments of the URL.
     * e.g., "/foo/bar" -> ["foo", "bar"]
     */
    val pathSegments: List<String>
        get() = encodedPath.split("/").filter { it.isNotEmpty() }.map { decodePathSegment(it) }
    
    private fun decodePathSegment(segment: String): String {
        return segment
            .replace("%20", " ")
            .replace("%3F", "?")
            .replace("%23", "#")
            .replace("%25", "%")
    }
    
    fun newBuilder(): Builder = Builder().apply {
        scheme(scheme)
        host(host)
        port(port)
        encodedPath(encodedPath)
        encodedQuery?.let { encodedQuery(it) }
        fragment?.let { fragment(it) }
    }
    
    /**
     * Get a query parameter by name.
     */
    fun queryParameter(name: String): String? {
        if (encodedQuery == null) return null
        val prefix = "$name="
        return encodedQuery.split("&")
            .firstOrNull { it.startsWith(prefix) }
            ?.substring(prefix.length)
            ?.let { decodeQueryComponent(it) }
    }
    
    private fun decodeQueryComponent(value: String): String {
        return value
            .replace("%20", " ")
            .replace("%26", "&")
            .replace("%3D", "=")
            .replace("%2B", "+")
            .replace("%23", "#")
            .replace("%25", "%")
    }
    
    override fun toString(): String {
        val sb = StringBuilder()
        sb.append(scheme).append("://").append(host)
        if ((scheme == "http" && port != 80) || (scheme == "https" && port != 443)) {
            sb.append(":").append(port)
        }
        sb.append(encodedPath)
        if (!encodedQuery.isNullOrEmpty()) {
            sb.append("?").append(encodedQuery)
        }
        if (!fragment.isNullOrEmpty()) {
            sb.append("#").append(fragment)
        }
        return sb.toString()
    }
    
    class Builder {
        private var scheme: String = "https"
        private var host: String = ""
        private var port: Int = -1
        private var encodedPath: String = "/"
        private var encodedQueryParams = mutableListOf<Pair<String, String>>()
        private var fragment: String? = null
        
        fun scheme(scheme: String): Builder {
            this.scheme = scheme.lowercase()
            return this
        }
        
        fun host(host: String): Builder {
            this.host = host
            return this
        }
        
        fun port(port: Int): Builder {
            this.port = port
            return this
        }
        
        fun encodedPath(encodedPath: String): Builder {
            this.encodedPath = if (encodedPath.startsWith("/")) encodedPath else "/$encodedPath"
            return this
        }
        
        fun addPathSegment(segment: String): Builder {
            if (encodedPath.endsWith("/")) {
                encodedPath += encodePathSegment(segment)
            } else {
                encodedPath += "/" + encodePathSegment(segment)
            }
            return this
        }
        
        fun addPathSegments(pathSegments: String): Builder {
            pathSegments.split("/").forEach { addPathSegment(it) }
            return this
        }
        
        /**
         * Set the path segment at the specified index.
         */
        fun setPathSegment(index: Int, pathSegment: String): Builder {
            // Parse current path into segments
            val segments = encodedPath.split("/").filter { it.isNotEmpty() }.toMutableList()
            
            // Ensure we have enough segments
            while (segments.size <= index) {
                segments.add("")
            }
            
            // Set the segment at the index
            segments[index] = encodePathSegment(pathSegment)
            
            // Rebuild path
            encodedPath = "/" + segments.joinToString("/")
            
            return this
        }
        
        /**
         * Set the encoded path segment at the specified index.
         */
        fun setEncodedPathSegment(index: Int, encodedPathSegment: String): Builder {
            val segments = encodedPath.split("/").filter { it.isNotEmpty() }.toMutableList()
            
            while (segments.size <= index) {
                segments.add("")
            }
            
            segments[index] = encodedPathSegment
            encodedPath = "/" + segments.joinToString("/")
            
            return this
        }
        
        private fun encodePathSegment(segment: String): String {
            return segment
                .replace("%", "%25")
                .replace(" ", "%20")
                .replace("?", "%3F")
                .replace("#", "%23")
        }
        
        fun encodedQuery(encodedQuery: String): Builder {
            encodedQueryParams.clear()
            encodedQuery.split("&").forEach { param ->
                val parts = param.split("=", limit = 2)
                if (parts.size == 2) {
                    encodedQueryParams.add(parts[0] to parts[1])
                }
            }
            return this
        }
        
        fun addQueryParameter(name: String, value: String?): Builder {
            if (value != null) {
                encodedQueryParams.add(encodeQueryComponent(name) to encodeQueryComponent(value))
            }
            return this
        }
        
        /**
         * Add multiple query parameters with the same name (for array-style params like "ids[]")
         */
        fun addQueryParameter(name: String, values: Set<String>?): Builder {
            values?.forEach { addQueryParameter(name, it) }
            return this
        }
        
        fun addEncodedQueryParameter(name: String, value: String?): Builder {
            if (value != null) {
                encodedQueryParams.add(name to value)
            }
            return this
        }
        
        fun removeAllQueryParameters(name: String): Builder {
            val encodedName = encodeQueryComponent(name)
            encodedQueryParams.removeAll { it.first == encodedName }
            return this
        }
        
        fun removeAllEncodedQueryParameters(name: String): Builder {
            encodedQueryParams.removeAll { it.first == name }
            return this
        }
        
        fun fragment(fragment: String?): Builder {
            this.fragment = fragment
            return this
        }
        
        fun build(): HttpUrl {
            val effectivePort = if (port == -1) {
                if (scheme == "https") 443 else 80
            } else port
            
            val queryString = if (encodedQueryParams.isEmpty()) null 
                else encodedQueryParams.joinToString("&") { "${it.first}=${it.second}" }
            
            return HttpUrl(scheme, host, effectivePort, encodedPath, queryString, fragment)
        }
        
        private fun encodeQueryComponent(value: String): String {
            // Use JavaScript's encodeURIComponent for proper UTF-8 percent encoding
            return js("encodeURIComponent")(value) as String
        }
        
        override fun toString(): String = build().toString()
    }
    
    companion object {
        fun String.toHttpUrl(): HttpUrl {
            return parse(this) ?: throw IllegalArgumentException("Invalid URL: $this")
        }
        
        fun String.toHttpUrlOrNull(): HttpUrl? = parse(this)
        
        private fun parse(url: String): HttpUrl? {
            try {
                val schemeEnd = url.indexOf("://")
                if (schemeEnd == -1) return null
                
                val scheme = url.substring(0, schemeEnd).lowercase()
                var remaining = url.substring(schemeEnd + 3)
                
                // Extract fragment
                var fragment: String? = null
                val fragmentIndex = remaining.indexOf('#')
                if (fragmentIndex != -1) {
                    fragment = remaining.substring(fragmentIndex + 1)
                    remaining = remaining.substring(0, fragmentIndex)
                }
                
                // Extract query
                var query: String? = null
                val queryIndex = remaining.indexOf('?')
                if (queryIndex != -1) {
                    query = remaining.substring(queryIndex + 1)
                    remaining = remaining.substring(0, queryIndex)
                }
                
                // Extract path
                val pathIndex = remaining.indexOf('/')
                val hostPort: String
                val path: String
                if (pathIndex != -1) {
                    hostPort = remaining.substring(0, pathIndex)
                    path = remaining.substring(pathIndex)
                } else {
                    hostPort = remaining
                    path = "/"
                }
                
                // Extract port
                val portIndex = hostPort.indexOf(':')
                val host: String
                val port: Int
                if (portIndex != -1) {
                    host = hostPort.substring(0, portIndex)
                    port = hostPort.substring(portIndex + 1).toIntOrNull() 
                        ?: (if (scheme == "https") 443 else 80)
                } else {
                    host = hostPort
                    port = if (scheme == "https") 443 else 80
                }
                
                return HttpUrl(scheme, host, port, path, query, fragment)
            } catch (e: Exception) {
                return null
            }
        }
    }
}

