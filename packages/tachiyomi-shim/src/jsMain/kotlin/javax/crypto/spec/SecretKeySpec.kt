package javax.crypto.spec

import java.security.Key

/**
 * SecretKeySpec implementation for AES keys.
 */
class SecretKeySpec(
    private val key: ByteArray,
    override val algorithm: String
) : Key {
    
    constructor(key: ByteArray, offset: Int, len: Int, algorithm: String) : this(
        key.copyOfRange(offset, offset + len),
        algorithm
    )
    
    override val encoded: ByteArray
        get() = key.copyOf()
    
    override val format: String
        get() = "RAW"
}

