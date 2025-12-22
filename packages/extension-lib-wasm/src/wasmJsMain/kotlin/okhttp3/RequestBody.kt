package okhttp3

abstract class RequestBody {
    abstract val contentType: MediaType?
    abstract val contentLength: Long
    abstract fun writeTo(): ByteArray
    
    companion object {
        fun String.toRequestBody(contentType: MediaType? = null): RequestBody {
            return StringRequestBody(this, contentType)
        }
        
        fun ByteArray.toRequestBody(contentType: MediaType? = null): RequestBody {
            return ByteArrayRequestBody(this, contentType)
        }
    }
}

private class StringRequestBody(
    private val content: String,
    override val contentType: MediaType?
) : RequestBody() {
    override val contentLength: Long = content.length.toLong()
    override fun writeTo(): ByteArray = content.encodeToByteArray()
}

private class ByteArrayRequestBody(
    private val content: ByteArray,
    override val contentType: MediaType?
) : RequestBody() {
    override val contentLength: Long = content.size.toLong()
    override fun writeTo(): ByteArray = content
}

class FormBody private constructor(
    private val names: List<String>,
    private val values: List<String>
) : RequestBody() {
    override val contentType: MediaType = MediaType.run { 
        "application/x-www-form-urlencoded".toMediaType() 
    }
    override val contentLength: Long
        get() = writeTo().size.toLong()
    
    override fun writeTo(): ByteArray {
        return names.zip(values)
            .joinToString("&") { (name, value) -> 
                "${encodeComponent(name)}=${encodeComponent(value)}" 
            }
            .encodeToByteArray()
    }
    
    private fun encodeComponent(value: String): String {
        return value
            .replace("%", "%25")
            .replace(" ", "+")
            .replace("&", "%26")
            .replace("=", "%3D")
            .replace("+", "%2B")
    }
    
    class Builder {
        private val names = mutableListOf<String>()
        private val values = mutableListOf<String>()
        
        fun add(name: String, value: String): Builder {
            names.add(name)
            values.add(value)
            return this
        }
        
        fun addEncoded(name: String, value: String): Builder {
            names.add(name)
            values.add(value)
            return this
        }
        
        fun build(): FormBody = FormBody(names.toList(), values.toList())
    }
}

