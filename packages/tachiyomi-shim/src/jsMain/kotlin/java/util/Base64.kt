package java.util

import kotlin.js.unsafeCast

/**
 * Base64 encoder/decoder shim using browser's btoa/atob.
 */
object Base64 {
    fun getEncoder(): Encoder = Encoder
    fun getDecoder(): Decoder = Decoder
    
    object Encoder {
        fun encodeToString(bytes: ByteArray): String {
            // Convert ByteArray to binary string, then btoa
            val binary = bytes.map { (it.toInt() and 0xFF).toChar() }.joinToString("")
            return js("btoa(binary)").unsafeCast<String>()
        }
        
        fun encode(bytes: ByteArray): ByteArray {
            return encodeToString(bytes).encodeToByteArray()
        }
    }
    
    object Decoder {
        fun decode(str: String): ByteArray {
            val binary = js("atob(str)").unsafeCast<String>()
            return ByteArray(binary.length) { binary[it].code.toByte() }
        }
    }
}

