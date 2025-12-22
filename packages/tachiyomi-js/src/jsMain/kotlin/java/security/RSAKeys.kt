package java.security

import java.math.BigInteger

/**
 * RSA public key implementation.
 */
class RSAPublicKeyImpl(
    val modulus: BigInteger,
    val publicExponent: BigInteger
) : PublicKey {
    override val algorithm: String = "RSA"
    override val format: String = "X.509"
    override val encoded: ByteArray
        get() = encodeToX509()

    /**
     * Encode as X.509 SubjectPublicKeyInfo (simplified DER).
     */
    private fun encodeToX509(): ByteArray {
        // RSAPublicKey ::= SEQUENCE { modulus INTEGER, publicExponent INTEGER }
        val modulusBytes = modulus.toByteArray()
        val exponentBytes = publicExponent.toByteArray()
        
        // DER encode
        val modulusEncoded = derInteger(modulusBytes)
        val exponentEncoded = derInteger(exponentBytes)
        
        val rsaKeySeq = derSequence(modulusEncoded + exponentEncoded)
        
        // Wrap in BIT STRING
        val bitString = byteArrayOf(0x03.toByte()) + derLength(rsaKeySeq.size + 1) + byteArrayOf(0x00.toByte()) + rsaKeySeq
        
        // RSA OID: 1.2.840.113549.1.1.1
        val rsaOid = byteArrayOf(
            0x06, 0x09, 0x2A.toByte(), 0x86.toByte(), 0x48, 0x86.toByte(), 0xF7.toByte(), 
            0x0D, 0x01, 0x01, 0x01, 0x05, 0x00
        )
        
        val algIdSeq = derSequence(rsaOid)
        
        return derSequence(algIdSeq + bitString)
    }

    companion object {
        /**
         * Parse RSA public key from X.509 DER encoded bytes.
         */
        fun fromX509Encoded(encoded: ByteArray): RSAPublicKeyImpl {
            // Parse X.509 SubjectPublicKeyInfo
            // Skip outer SEQUENCE tag and length
            var pos = 0
            if (encoded[pos++] != 0x30.toByte()) throw InvalidKeySpecException("Expected SEQUENCE")
            pos += derLengthSize(encoded, pos)
            
            // Skip AlgorithmIdentifier SEQUENCE
            if (encoded[pos++] != 0x30.toByte()) throw InvalidKeySpecException("Expected AlgorithmIdentifier SEQUENCE")
            val algIdLen = readDerLength(encoded, pos)
            pos += derLengthSize(encoded, pos) + algIdLen
            
            // Parse BIT STRING containing RSAPublicKey
            if (encoded[pos++] != 0x03.toByte()) throw InvalidKeySpecException("Expected BIT STRING")
            val bitStringLen = readDerLength(encoded, pos)
            pos += derLengthSize(encoded, pos)
            pos++ // Skip unused bits count (should be 0)
            
            // Parse inner RSAPublicKey SEQUENCE
            if (encoded[pos++] != 0x30.toByte()) throw InvalidKeySpecException("Expected RSAPublicKey SEQUENCE")
            pos += derLengthSize(encoded, pos)
            
            // Parse modulus INTEGER
            if (encoded[pos++] != 0x02.toByte()) throw InvalidKeySpecException("Expected modulus INTEGER")
            val modulusLen = readDerLength(encoded, pos)
            pos += derLengthSize(encoded, pos)
            val modulusBytes = encoded.copyOfRange(pos, pos + modulusLen)
            pos += modulusLen
            
            // Parse publicExponent INTEGER
            if (encoded[pos++] != 0x02.toByte()) throw InvalidKeySpecException("Expected exponent INTEGER")
            val expLen = readDerLength(encoded, pos)
            pos += derLengthSize(encoded, pos)
            val expBytes = encoded.copyOfRange(pos, pos + expLen)
            
            val modulus = BigInteger.fromByteArray(modulusBytes)
            val exponent = BigInteger.fromByteArray(expBytes)
            
            return RSAPublicKeyImpl(modulus, exponent)
        }
    }
}

/**
 * RSA private key implementation.
 */
class RSAPrivateKeyImpl(
    val modulus: BigInteger,
    val privateExponent: BigInteger,
    val primeP: BigInteger? = null,
    val primeQ: BigInteger? = null
) : PrivateKey {
    override val algorithm: String = "RSA"
    override val format: String = "PKCS#8"
    override val encoded: ByteArray
        get() = encodeToPKCS8()

    private fun encodeToPKCS8(): ByteArray {
        // Simplified PKCS#8 encoding
        val modulusBytes = modulus.toByteArray()
        val expBytes = privateExponent.toByteArray()
        
        val modulusEncoded = derInteger(modulusBytes)
        val expEncoded = derInteger(expBytes)
        val versionEncoded = derInteger(byteArrayOf(0))
        
        // RSAPrivateKey with just n, d (simplified)
        val privateKeySeq = derSequence(versionEncoded + modulusEncoded + expEncoded)
        
        // Wrap in OCTET STRING
        val octetString = byteArrayOf(0x04.toByte()) + derLength(privateKeySeq.size) + privateKeySeq
        
        // RSA OID
        val rsaOid = byteArrayOf(
            0x06, 0x09, 0x2A.toByte(), 0x86.toByte(), 0x48, 0x86.toByte(), 0xF7.toByte(), 
            0x0D, 0x01, 0x01, 0x01, 0x05, 0x00
        )
        val algIdSeq = derSequence(rsaOid)
        
        val versionOuter = derInteger(byteArrayOf(0))
        
        return derSequence(versionOuter + algIdSeq + octetString)
    }

    companion object {
        /**
         * Parse RSA private key from PKCS#8 DER encoded bytes.
         */
        fun fromPKCS8Encoded(encoded: ByteArray): RSAPrivateKeyImpl {
            // Parse PKCS#8 PrivateKeyInfo
            var pos = 0
            if (encoded[pos++] != 0x30.toByte()) throw InvalidKeySpecException("Expected SEQUENCE")
            pos += derLengthSize(encoded, pos)
            
            // Skip version INTEGER
            if (encoded[pos++] != 0x02.toByte()) throw InvalidKeySpecException("Expected version INTEGER")
            val versionLen = readDerLength(encoded, pos)
            pos += derLengthSize(encoded, pos) + versionLen
            
            // Skip AlgorithmIdentifier SEQUENCE
            if (encoded[pos++] != 0x30.toByte()) throw InvalidKeySpecException("Expected AlgorithmIdentifier SEQUENCE")
            val algIdLen = readDerLength(encoded, pos)
            pos += derLengthSize(encoded, pos) + algIdLen
            
            // Parse OCTET STRING containing RSAPrivateKey
            if (encoded[pos++] != 0x04.toByte()) throw InvalidKeySpecException("Expected OCTET STRING")
            pos += derLengthSize(encoded, pos)
            
            // Parse inner RSAPrivateKey SEQUENCE
            if (encoded[pos++] != 0x30.toByte()) throw InvalidKeySpecException("Expected RSAPrivateKey SEQUENCE")
            pos += derLengthSize(encoded, pos)
            
            // Skip version
            if (encoded[pos++] != 0x02.toByte()) throw InvalidKeySpecException("Expected inner version INTEGER")
            val innerVersionLen = readDerLength(encoded, pos)
            pos += derLengthSize(encoded, pos) + innerVersionLen
            
            // Parse modulus INTEGER
            if (encoded[pos++] != 0x02.toByte()) throw InvalidKeySpecException("Expected modulus INTEGER")
            val modulusLen = readDerLength(encoded, pos)
            pos += derLengthSize(encoded, pos)
            val modulusBytes = encoded.copyOfRange(pos, pos + modulusLen)
            pos += modulusLen
            
            // Parse publicExponent INTEGER (skip)
            if (encoded[pos++] != 0x02.toByte()) throw InvalidKeySpecException("Expected publicExponent INTEGER")
            val pubExpLen = readDerLength(encoded, pos)
            pos += derLengthSize(encoded, pos) + pubExpLen
            
            // Parse privateExponent INTEGER
            if (encoded[pos++] != 0x02.toByte()) throw InvalidKeySpecException("Expected privateExponent INTEGER")
            val privExpLen = readDerLength(encoded, pos)
            pos += derLengthSize(encoded, pos)
            val privExpBytes = encoded.copyOfRange(pos, pos + privExpLen)
            
            val modulus = BigInteger.fromByteArray(modulusBytes)
            val privateExponent = BigInteger.fromByteArray(privExpBytes)
            
            return RSAPrivateKeyImpl(modulus, privateExponent)
        }
    }
}

// DER encoding helpers
private fun derInteger(bytes: ByteArray): ByteArray {
    return byteArrayOf(0x02.toByte()) + derLength(bytes.size) + bytes
}

private fun derSequence(content: ByteArray): ByteArray {
    return byteArrayOf(0x30.toByte()) + derLength(content.size) + content
}

private fun derLength(length: Int): ByteArray {
    return when {
        length < 128 -> byteArrayOf(length.toByte())
        length < 256 -> byteArrayOf(0x81.toByte(), length.toByte())
        else -> byteArrayOf(0x82.toByte(), (length shr 8).toByte(), length.toByte())
    }
}

private fun readDerLength(data: ByteArray, pos: Int): Int {
    val first = data[pos].toInt() and 0xFF
    return when {
        first < 128 -> first
        first == 0x81 -> data[pos + 1].toInt() and 0xFF
        first == 0x82 -> ((data[pos + 1].toInt() and 0xFF) shl 8) or (data[pos + 2].toInt() and 0xFF)
        else -> throw InvalidKeySpecException("Unsupported DER length encoding")
    }
}

private fun derLengthSize(data: ByteArray, pos: Int): Int {
    val first = data[pos].toInt() and 0xFF
    return when {
        first < 128 -> 1
        first == 0x81 -> 2
        first == 0x82 -> 3
        else -> throw InvalidKeySpecException("Unsupported DER length encoding")
    }
}

