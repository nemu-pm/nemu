package okhttp3

class CacheControl private constructor(
    val noCache: Boolean,
    val noStore: Boolean,
    val maxAgeSeconds: Int,
    val maxStaleSeconds: Int
) {
    class Builder {
        private var noCache: Boolean = false
        private var noStore: Boolean = false
        private var maxAgeSeconds: Int = -1
        private var maxStaleSeconds: Int = -1
        
        fun noCache(): Builder {
            noCache = true
            return this
        }
        
        fun noStore(): Builder {
            noStore = true
            return this
        }
        
        fun maxAge(maxAge: Int, unit: java.util.concurrent.TimeUnit): Builder {
            maxAgeSeconds = unit.toSeconds(maxAge.toLong()).toInt()
            return this
        }
        
        fun maxStale(maxStale: Int, unit: java.util.concurrent.TimeUnit): Builder {
            maxStaleSeconds = unit.toSeconds(maxStale.toLong()).toInt()
            return this
        }
        
        fun build(): CacheControl {
            return CacheControl(noCache, noStore, maxAgeSeconds, maxStaleSeconds)
        }
    }
    
    companion object {
        val FORCE_NETWORK = Builder().noCache().build()
        val FORCE_CACHE = Builder().maxStale(Int.MAX_VALUE, java.util.concurrent.TimeUnit.SECONDS).build()
    }
}

