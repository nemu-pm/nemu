package java.security.spec

import java.math.BigInteger

/**
 * RSA key generation parameter specification.
 */
class RSAKeyGenParameterSpec(
    val keysize: Int,
    val publicExponent: BigInteger
) : AlgorithmParameterSpec {
    companion object {
        /** Fermat F4 = 65537, the most commonly used public exponent */
        val F4: BigInteger = BigInteger.valueOf(65537L)
    }
}

