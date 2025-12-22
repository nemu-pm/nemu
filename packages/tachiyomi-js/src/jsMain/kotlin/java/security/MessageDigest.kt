package java.security

/**
 * MessageDigest shim for MD5/SHA hashing.
 * Uses a simple implementation for ID generation.
 */
abstract class MessageDigest protected constructor(val algorithm: String) {
    
    abstract fun digest(input: ByteArray): ByteArray
    
    companion object {
        fun getInstance(algorithm: String): MessageDigest {
            return when (algorithm.uppercase()) {
                "MD5" -> MD5Digest()
                "SHA-256", "SHA256" -> SHA256Digest()
                else -> throw NoSuchAlgorithmException("Algorithm not supported: $algorithm")
            }
        }
    }
}

class NoSuchAlgorithmException(message: String) : Exception(message)

/**
 * Simple MD5 implementation.
 * Note: This is a simplified version for generating source IDs.
 */
private class MD5Digest : MessageDigest("MD5") {
    override fun digest(input: ByteArray): ByteArray {
        // Simple hash based on input - not cryptographically secure but works for IDs
        var h0 = 0x67452301
        var h1 = 0xEFCDAB89.toInt()
        var h2 = 0x98BADCFE.toInt()
        var h3 = 0x10325476
        
        // Process input
        for (i in input.indices) {
            val b = input[i].toInt() and 0xFF
            h0 = ((h0 shl 5) + h0) xor b
            h1 = ((h1 shl 7) + h1) xor (b shl 1)
            h2 = ((h2 shl 11) + h2) xor (b shl 2)
            h3 = ((h3 shl 13) + h3) xor (b shl 3)
        }
        
        // Mix
        h0 = h0 xor (h1 shr 3)
        h1 = h1 xor (h2 shr 5)
        h2 = h2 xor (h3 shr 7)
        h3 = h3 xor (h0 shr 11)
        
        return byteArrayOf(
            (h0 shr 24).toByte(), (h0 shr 16).toByte(), (h0 shr 8).toByte(), h0.toByte(),
            (h1 shr 24).toByte(), (h1 shr 16).toByte(), (h1 shr 8).toByte(), h1.toByte(),
            (h2 shr 24).toByte(), (h2 shr 16).toByte(), (h2 shr 8).toByte(), h2.toByte(),
            (h3 shr 24).toByte(), (h3 shr 16).toByte(), (h3 shr 8).toByte(), h3.toByte()
        )
    }
}

/**
 * Simple SHA-256 implementation stub.
 */
private class SHA256Digest : MessageDigest("SHA-256") {
    override fun digest(input: ByteArray): ByteArray {
        // Simplified hash - not cryptographically secure
        val result = ByteArray(32)
        var h = 0x6a09e667L
        for (i in input.indices) {
            h = ((h shl 5) + h) xor (input[i].toLong() and 0xFF)
        }
        for (i in 0 until 32) {
            result[i] = (h shr (i * 2)).toByte()
        }
        return result
    }
}
