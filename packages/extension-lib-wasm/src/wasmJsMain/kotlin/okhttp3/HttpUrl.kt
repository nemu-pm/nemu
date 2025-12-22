package okhttp3

class HttpUrl private constructor(
    val scheme: String,
    val host: String,
    val port: Int,
    val encodedPath: String,
    val encodedQuery: String?,
    val fragment: String?
) {
    fun newBuilder(): Builder = Builder().apply {
        scheme(scheme)
        host(host)
        port(port)
        encodedPath(encodedPath)
        encodedQuery?.let { encodedQuery(it) }
        fragment?.let { fragment(it) }
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
        
        fun addEncodedQueryParameter(name: String, value: String?): Builder {
            if (value != null) {
                encodedQueryParams.add(name to value)
            }
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
            return value
                .replace("%", "%25")
                .replace(" ", "%20")
                .replace("&", "%26")
                .replace("=", "%3D")
                .replace("+", "%2B")
                .replace("#", "%23")
        }
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

