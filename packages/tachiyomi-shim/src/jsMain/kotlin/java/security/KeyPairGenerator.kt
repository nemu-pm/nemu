package java.security

import java.math.BigInteger
import java.security.spec.RSAKeyGenParameterSpec

/**
 * KeyPairGenerator for generating RSA key pairs.
 */
class KeyPairGenerator private constructor(private val algorithm: String) {

    private var keySize: Int = 2048
    private var publicExponent: Long = 65537L // F4

    fun initialize(params: RSAKeyGenParameterSpec) {
        keySize = params.keysize
        publicExponent = params.publicExponent.toLong()
    }

    fun initialize(keySize: Int) {
        this.keySize = keySize
    }

    fun generateKeyPair(): KeyPair {
        // Generate RSA key pair
        val (n, e, d, p, q) = generateRSAKeys(keySize, publicExponent)
        
        val publicKey = RSAPublicKeyImpl(n, e)
        val privateKey = RSAPrivateKeyImpl(n, d, p, q)
        
        return KeyPair(publicKey, privateKey)
    }

    companion object {
        fun getInstance(algorithm: String): KeyPairGenerator {
            if (algorithm.uppercase() != "RSA") {
                throw NoSuchAlgorithmException("Unsupported algorithm: $algorithm")
            }
            return KeyPairGenerator(algorithm)
        }
    }
}

data class KeyPair(val public: PublicKey, val private: PrivateKey)

/**
 * Generate RSA key components.
 * Returns (n, e, d, p, q) where:
 * - n = modulus (p * q)
 * - e = public exponent
 * - d = private exponent
 * - p, q = prime factors
 */
private fun generateRSAKeys(keySize: Int, e: Long): RSAKeyComponents {
    val bitLength = keySize / 2
    
    // Generate two random primes
    var p: BigInteger
    var q: BigInteger
    var n: BigInteger
    var phi: BigInteger
    var d: BigInteger?
    val eBig = BigInteger.valueOf(e)
    
    do {
        p = BigInteger.probablePrime(bitLength)
        q = BigInteger.probablePrime(bitLength)
        n = p * q
        phi = (p - BigInteger.ONE) * (q - BigInteger.ONE)
        d = eBig.modInverse(phi)
    } while (d == null || n.bitLength() < keySize - 1)
    
    return RSAKeyComponents(n, eBig, d, p, q)
}

private data class RSAKeyComponents(
    val n: BigInteger,
    val e: BigInteger,
    val d: BigInteger,
    val p: BigInteger,
    val q: BigInteger
)

