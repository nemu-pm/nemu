package javax.crypto.spec

import java.security.spec.AlgorithmParameterSpec

/**
 * IvParameterSpec implementation for initialization vectors.
 */
class IvParameterSpec(iv: ByteArray) : AlgorithmParameterSpec {
    
    val iv: ByteArray = iv.copyOf()
    
    constructor(iv: ByteArray, offset: Int, len: Int) : this(iv.copyOfRange(offset, offset + len))
}

