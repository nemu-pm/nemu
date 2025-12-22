package okhttp3

class MediaType private constructor(
    val type: String,
    val subtype: String,
    val charset: String?
) {
    override fun toString(): String {
        val base = "$type/$subtype"
        return if (charset != null) "$base; charset=$charset" else base
    }
    
    companion object {
        fun String.toMediaType(): MediaType {
            val parts = this.split(";").map { it.trim() }
            val typeSubtype = parts[0].split("/")
            require(typeSubtype.size == 2) { "Invalid media type: $this" }
            
            var charset: String? = null
            for (i in 1 until parts.size) {
                val param = parts[i]
                if (param.startsWith("charset=", ignoreCase = true)) {
                    charset = param.substringAfter("=").trim('"')
                }
            }
            
            return MediaType(typeSubtype[0], typeSubtype[1], charset)
        }
        
        fun String.toMediaTypeOrNull(): MediaType? {
            return try {
                toMediaType()
            } catch (e: Exception) {
                null
            }
        }
    }
}

