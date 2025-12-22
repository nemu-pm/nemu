package android.graphics

/**
 * Bridge to JavaScript image codec (jpeg-js library).
 * Provides sync JPEG/PNG decode/encode via globalThis functions.
 */
internal object ImageBridge {
    /**
     * Decode image bytes to ARGB pixels using JS jpeg-js library.
     */
    fun decodeImage(data: ByteArray): DecodedImage? {
        // Convert bytes to base64
        val base64 = bytesToBase64(data)
        
        // Call JS decoder
        val result = js("globalThis.tachiyomiDecodeImage(base64)")
        if (result == null || result == undefined) return null
        
        val width = (result.width as Number).toInt()
        val height = (result.height as Number).toInt()
        val pixelsBase64 = result.pixelsBase64 as String
        
        // Decode pixels from base64
        val pixels = base64ToIntArray(pixelsBase64)
        
        return DecodedImage(width, height, pixels)
    }
    
    /**
     * Encode ARGB pixels to JPEG.
     */
    fun encodeJpeg(pixels: IntArray, width: Int, height: Int, quality: Int): ByteArray {
        val pixelsBase64 = intArrayToBase64(pixels)
        val result = js("globalThis.tachiyomiEncodeImage(pixelsBase64, width, height, 'jpeg', quality)")
        if (result == null || result == undefined) {
            throw IllegalStateException("JPEG encoding failed")
        }
        return base64ToBytes(result as String)
    }
    
    /**
     * Encode ARGB pixels to PNG.
     */
    fun encodePng(pixels: IntArray, width: Int, height: Int): ByteArray {
        val pixelsBase64 = intArrayToBase64(pixels)
        val result = js("globalThis.tachiyomiEncodeImage(pixelsBase64, width, height, 'png', 100)")
        if (result == null || result == undefined) {
            throw IllegalStateException("PNG encoding failed")
        }
        return base64ToBytes(result as String)
    }
    
    // Helper: ByteArray to Base64
    private fun bytesToBase64(bytes: ByteArray): String {
        val binary = bytes.map { (it.toInt() and 0xFF).toChar() }.joinToString("")
        return js("btoa(binary)") as String
    }
    
    // Helper: Base64 to ByteArray
    private fun base64ToBytes(base64: String): ByteArray {
        val binary = js("atob(base64)") as String
        return ByteArray(binary.length) { binary[it].code.toByte() }
    }
    
    // Helper: IntArray to Base64 (as raw bytes)
    private fun intArrayToBase64(arr: IntArray): String {
        // Convert IntArray to byte representation (little-endian)
        val bytes = ByteArray(arr.size * 4)
        for (i in arr.indices) {
            val v = arr[i]
            bytes[i * 4] = (v and 0xFF).toByte()
            bytes[i * 4 + 1] = ((v shr 8) and 0xFF).toByte()
            bytes[i * 4 + 2] = ((v shr 16) and 0xFF).toByte()
            bytes[i * 4 + 3] = ((v shr 24) and 0xFF).toByte()
        }
        return bytesToBase64(bytes)
    }
    
    // Helper: Base64 to IntArray
    private fun base64ToIntArray(base64: String): IntArray {
        val bytes = base64ToBytes(base64)
        val arr = IntArray(bytes.size / 4)
        for (i in arr.indices) {
            arr[i] = (bytes[i * 4].toInt() and 0xFF) or
                    ((bytes[i * 4 + 1].toInt() and 0xFF) shl 8) or
                    ((bytes[i * 4 + 2].toInt() and 0xFF) shl 16) or
                    ((bytes[i * 4 + 3].toInt() and 0xFF) shl 24)
        }
        return arr
    }
    
    data class DecodedImage(val width: Int, val height: Int, val pixels: IntArray)
}

