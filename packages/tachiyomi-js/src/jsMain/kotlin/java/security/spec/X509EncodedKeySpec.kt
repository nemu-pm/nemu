package java.security.spec

/**
 * X.509 encoded key specification for public keys.
 */
class X509EncodedKeySpec(val encoded: ByteArray) : KeySpec

