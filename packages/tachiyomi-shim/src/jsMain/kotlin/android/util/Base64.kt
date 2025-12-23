package android.util

import kotlin.js.js

/**
 * Base64 utility for encoding and decoding Base64 data.
 * Mirrors android.util.Base64 API.
 */
object Base64 {
    /** Default values for Base64 encoding/decoding. */
    const val DEFAULT = 0
    
    /** Omit all line terminators (i.e., do not wrap). */
    const val NO_WRAP = 2
    
    /** Omit padding characters at the end of the encoded data. */
    const val NO_PADDING = 1
    
    /** Use URL-safe Base64 encoding. */
    const val URL_SAFE = 8
    
    /** Perform no padding in the result. */
    const val NO_CLOSE = 16
    
    /** CRLF line terminator (default is LF only). */
    const val CRLF = 4
    
    /**
     * Decode Base64-encoded input to a ByteArray.
     */
    fun decode(input: String, flags: Int): ByteArray {
        // Handle URL-safe encoding by replacing chars
        val normalized = if (flags and URL_SAFE != 0) {
            input.replace('-', '+').replace('_', '/')
        } else {
            input
        }
        
        // Use JavaScript's atob for decoding
        val decoded = js("atob")(normalized) as String
        return decoded.encodeToByteArray()
    }
    
    /**
     * Decode Base64-encoded ByteArray to a ByteArray.
     */
    fun decode(input: ByteArray, flags: Int): ByteArray {
        return decode(input.decodeToString(), flags)
    }
    
    /**
     * Decode Base64-encoded input with offset and length.
     */
    fun decode(input: ByteArray, offset: Int, len: Int, flags: Int): ByteArray {
        return decode(input.decodeToString(offset, offset + len), flags)
    }
    
    /**
     * Encode input ByteArray to Base64 string.
     */
    fun encode(input: ByteArray, flags: Int): ByteArray {
        return encodeToString(input, flags).encodeToByteArray()
    }
    
    /**
     * Encode input ByteArray to Base64 string with offset and length.
     */
    fun encode(input: ByteArray, offset: Int, len: Int, flags: Int): ByteArray {
        return encodeToString(input, offset, len, flags).encodeToByteArray()
    }
    
    /**
     * Encode input ByteArray to Base64 string.
     */
    fun encodeToString(input: ByteArray, flags: Int): String {
        return encodeToString(input, 0, input.size, flags)
    }
    
    /**
     * Encode input ByteArray to Base64 string with offset and length.
     */
    fun encodeToString(input: ByteArray, offset: Int, len: Int, flags: Int): String {
        // Convert ByteArray to binary string
        val binaryString = buildString {
            for (i in offset until (offset + len)) {
                append(input[i].toInt().toChar())
            }
        }
        
        // Use JavaScript's btoa for encoding
        var encoded = js("btoa")(binaryString) as String
        
        // Handle URL-safe encoding
        if (flags and URL_SAFE != 0) {
            encoded = encoded.replace('+', '-').replace('/', '_')
        }
        
        // Handle no padding
        if (flags and NO_PADDING != 0) {
            encoded = encoded.trimEnd('=')
        }
        
        return encoded
    }
}

