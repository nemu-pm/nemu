package java.security

import java.security.spec.KeySpec
import java.security.spec.PKCS8EncodedKeySpec
import java.security.spec.X509EncodedKeySpec

/**
 * KeyFactory for creating keys from key specifications.
 * Supports RSA keys.
 */
class KeyFactory private constructor(private val algorithm: String) {

    fun generatePublic(keySpec: KeySpec): PublicKey {
        return when (keySpec) {
            is X509EncodedKeySpec -> {
                RSAPublicKeyImpl.fromX509Encoded(keySpec.encoded)
            }
            else -> throw InvalidKeySpecException("Unsupported key spec: ${keySpec::class.simpleName}")
        }
    }

    fun generatePrivate(keySpec: KeySpec): PrivateKey {
        return when (keySpec) {
            is PKCS8EncodedKeySpec -> {
                RSAPrivateKeyImpl.fromPKCS8Encoded(keySpec.encoded)
            }
            else -> throw InvalidKeySpecException("Unsupported key spec: ${keySpec::class.simpleName}")
        }
    }

    companion object {
        fun getInstance(algorithm: String): KeyFactory {
            if (algorithm.uppercase() != "RSA") {
                throw NoSuchAlgorithmException("Unsupported algorithm: $algorithm")
            }
            return KeyFactory(algorithm)
        }
    }
}

class InvalidKeySpecException(message: String) : Exception(message)

