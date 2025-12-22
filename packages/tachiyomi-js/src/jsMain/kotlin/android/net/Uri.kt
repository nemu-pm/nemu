package android.net

/**
 * Android Uri shim for Kotlin/JS.
 */
class Uri private constructor(private val uriString: String) {
    
    val scheme: String?
        get() = uriString.substringBefore("://", "").takeIf { it.isNotEmpty() && uriString.contains("://") }
    
    val host: String?
        get() = uriString.substringAfter("://", "").substringBefore("/").substringBefore(":").takeIf { it.isNotEmpty() }
    
    val port: Int
        get() {
            val authority = uriString.substringAfter("://", "").substringBefore("/")
            val portStr = authority.substringAfter(":", "")
            return portStr.toIntOrNull() ?: -1
        }
    
    val path: String?
        get() {
            val withoutScheme = if (uriString.contains("://")) uriString.substringAfter("://") else uriString
            val pathStart = withoutScheme.indexOf('/')
            if (pathStart < 0) return null
            return withoutScheme.substring(pathStart).substringBefore("?").substringBefore("#")
        }
    
    val pathSegments: List<String>
        get() = path?.split("/")?.filter { it.isNotEmpty() } ?: emptyList()
    
    val query: String?
        get() = uriString.substringAfter("?", "").substringBefore("#").takeIf { it.isNotEmpty() }
    
    val fragment: String?
        get() = uriString.substringAfter("#", "").takeIf { it.isNotEmpty() }
    
    fun getQueryParameter(key: String): String? {
        val query = this.query ?: return null
        return query.split("&")
            .map { it.split("=", limit = 2) }
            .find { it[0] == key }
            ?.getOrNull(1)
            ?.let { decode(it) }
    }
    
    override fun toString(): String = uriString
    
    fun buildUpon(): Builder = Builder().also { it.uri(this) }
    
    class Builder {
        private var scheme: String? = null
        private var authority: String? = null
        private var path: String? = null
        private var query: String? = null
        private var fragment: String? = null
        
        fun scheme(scheme: String): Builder {
            this.scheme = scheme
            return this
        }
        
        fun authority(authority: String): Builder {
            this.authority = authority
            return this
        }
        
        fun path(path: String): Builder {
            this.path = path
            return this
        }
        
        fun appendPath(segment: String): Builder {
            path = (path ?: "") + "/" + segment
            return this
        }
        
        fun appendQueryParameter(key: String, value: String): Builder {
            val encoded = "$key=${encode(value)}"
            query = if (query.isNullOrEmpty()) encoded else "$query&$encoded"
            return this
        }
        
        fun fragment(fragment: String): Builder {
            this.fragment = fragment
            return this
        }
        
        fun uri(uri: Uri): Builder {
            scheme = uri.scheme
            authority = uri.host?.let { h -> uri.port.takeIf { it > 0 }?.let { "$h:$it" } ?: h }
            path = uri.path
            query = uri.query
            fragment = uri.fragment
            return this
        }
        
        fun build(): Uri {
            val sb = StringBuilder()
            scheme?.let { sb.append(it).append("://") }
            authority?.let { sb.append(it) }
            path?.let { if (!it.startsWith("/") && sb.isNotEmpty()) sb.append("/"); sb.append(it) }
            query?.let { sb.append("?").append(it) }
            fragment?.let { sb.append("#").append(it) }
            return Uri(sb.toString())
        }
    }
    
    companion object {
        val EMPTY: Uri = Uri("")
        
        fun parse(uriString: String): Uri = Uri(uriString)
        
        fun encode(s: String): String {
            return buildString {
                for (c in s) {
                    when {
                        c.isLetterOrDigit() || c in "-_.~" -> append(c)
                        else -> {
                            val bytes = c.toString().encodeToByteArray()
                            for (b in bytes) {
                                append('%')
                                append(((b.toInt() and 0xFF) shr 4).toString(16).uppercase())
                                append((b.toInt() and 0x0F).toString(16).uppercase())
                            }
                        }
                    }
                }
            }
        }
        
        fun decode(s: String): String {
            val result = StringBuilder()
            var i = 0
            while (i < s.length) {
                if (s[i] == '%' && i + 2 < s.length) {
                    val hex = s.substring(i + 1, i + 3)
                    result.append(hex.toInt(16).toChar())
                    i += 3
                } else if (s[i] == '+') {
                    result.append(' ')
                    i++
                } else {
                    result.append(s[i])
                    i++
                }
            }
            return result.toString()
        }
    }
}

