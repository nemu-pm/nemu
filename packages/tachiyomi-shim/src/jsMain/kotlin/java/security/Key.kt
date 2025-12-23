package java.security

/**
 * Key interface for cryptographic keys.
 */
interface Key {
    val algorithm: String
    val format: String
    val encoded: ByteArray
}

