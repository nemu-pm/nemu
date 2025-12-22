package java.security.spec

/**
 * PKCS#8 encoded key specification for private keys.
 */
class PKCS8EncodedKeySpec(val encoded: ByteArray) : KeySpec

