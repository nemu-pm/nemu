package okhttp3

class Headers private constructor(
    private val headers: Map<String, List<String>>
) {
    fun get(name: String): String? = headers[name.lowercase()]?.firstOrNull()
    
    fun values(name: String): List<String> = headers[name.lowercase()] ?: emptyList()
    
    fun names(): Set<String> = headers.keys
    
    fun size(): Int = headers.size
    
    fun toMap(): Map<String, List<String>> = headers
    
    fun newBuilder(): Builder = Builder().also { builder ->
        headers.forEach { (name, values) ->
            values.forEach { value -> builder.add(name, value) }
        }
    }
    
    class Builder {
        private val headers = mutableMapOf<String, MutableList<String>>()
        
        fun add(name: String, value: String): Builder {
            headers.getOrPut(name.lowercase()) { mutableListOf() }.add(value)
            return this
        }
        
        fun set(name: String, value: String): Builder {
            headers[name.lowercase()] = mutableListOf(value)
            return this
        }
        
        fun removeAll(name: String): Builder {
            headers.remove(name.lowercase())
            return this
        }
        
        fun build(): Headers = Headers(headers.toMap())
    }
    
    companion object {
        fun headersOf(vararg namesAndValues: String): Headers {
            require(namesAndValues.size % 2 == 0) { "Expected even number of arguments" }
            val builder = Builder()
            for (i in namesAndValues.indices step 2) {
                builder.add(namesAndValues[i], namesAndValues[i + 1])
            }
            return builder.build()
        }
    }
}

