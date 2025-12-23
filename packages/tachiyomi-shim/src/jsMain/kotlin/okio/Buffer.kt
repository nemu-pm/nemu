package okio

import okhttp3.MediaType
import okhttp3.ResponseBody
import java.io.InputStream
import java.io.OutputStream

/**
 * Okio Buffer implementation for byte manipulation.
 */
class Buffer : BufferedSource, BufferedSink {
    private val data = mutableListOf<Byte>()
    
    val size: Long
        get() = data.size.toLong()
    
    fun write(source: ByteArray): Buffer {
        data.addAll(source.toList())
        return this
    }
    
    fun write(source: ByteArray, offset: Int, byteCount: Int): Buffer {
        data.addAll(source.slice(offset until offset + byteCount))
        return this
    }
    
    fun writeByte(b: Int): Buffer {
        data.add(b.toByte())
        return this
    }
    
    fun writeShort(s: Int): Buffer {
        data.add((s shr 8).toByte())
        data.add(s.toByte())
        return this
    }
    
    fun writeInt(i: Int): Buffer {
        data.add((i shr 24).toByte())
        data.add((i shr 16).toByte())
        data.add((i shr 8).toByte())
        data.add(i.toByte())
        return this
    }
    
    fun writeLong(l: Long): Buffer {
        data.add((l shr 56).toByte())
        data.add((l shr 48).toByte())
        data.add((l shr 40).toByte())
        data.add((l shr 32).toByte())
        data.add((l shr 24).toByte())
        data.add((l shr 16).toByte())
        data.add((l shr 8).toByte())
        data.add(l.toByte())
        return this
    }
    
    fun writeUtf8(string: String): Buffer {
        data.addAll(string.encodeToByteArray().toList())
        return this
    }
    
    override fun readByteArray(): ByteArray {
        val result = data.toByteArray()
        data.clear()
        return result
    }
    
    override fun readByteArray(byteCount: Long): ByteArray {
        val count = byteCount.toInt().coerceAtMost(data.size)
        val result = data.take(count).toByteArray()
        repeat(count) { data.removeAt(0) }
        return result
    }
    
    override fun read(sink: ByteArray, offset: Int, byteCount: Int): Int {
        val count = byteCount.coerceAtMost(data.size)
        for (i in 0 until count) {
            sink[offset + i] = data.removeAt(0)
        }
        return count
    }
    
    override fun readByte(): Byte = data.removeAt(0)
    
    override fun readShort(): Short {
        val b1 = (data.removeAt(0).toInt() and 0xFF) shl 8
        val b2 = data.removeAt(0).toInt() and 0xFF
        return (b1 or b2).toShort()
    }
    
    override fun readInt(): Int {
        val b1 = (data.removeAt(0).toInt() and 0xFF) shl 24
        val b2 = (data.removeAt(0).toInt() and 0xFF) shl 16
        val b3 = (data.removeAt(0).toInt() and 0xFF) shl 8
        val b4 = data.removeAt(0).toInt() and 0xFF
        return b1 or b2 or b3 or b4
    }
    
    override fun readLong(): Long {
        var result = 0L
        for (i in 0 until 8) {
            result = (result shl 8) or (data.removeAt(0).toLong() and 0xFF)
        }
        return result
    }
    
    override fun readUtf8(): String = readByteArray().decodeToString()
    
    override fun readUtf8(byteCount: Long): String = readByteArray(byteCount).decodeToString()
    
    override fun readUtf8Line(): String? {
        val newlineIndex = data.indexOf('\n'.code.toByte())
        if (newlineIndex == -1) {
            if (data.isEmpty()) return null
            return readUtf8()
        }
        val line = data.take(newlineIndex).toByteArray().decodeToString()
        repeat(newlineIndex + 1) { data.removeAt(0) }
        return line.trimEnd('\r')
    }
    
    override fun skip(byteCount: Long) {
        repeat(byteCount.toInt().coerceAtMost(data.size)) { data.removeAt(0) }
    }
    
    override val exhausted: Boolean
        get() = data.isEmpty()
    
    override fun close() {
        data.clear()
    }
    
    fun outputStream(): OutputStream = object : OutputStream() {
        override fun write(b: Int) {
            data.add(b.toByte())
        }
        
        override fun write(bytes: ByteArray, off: Int, len: Int) {
            data.addAll(bytes.slice(off until off + len))
        }
    }
    
    fun inputStream(): InputStream = object : InputStream() {
        override fun read(): Int {
            return if (data.isEmpty()) -1 else data.removeAt(0).toInt() and 0xFF
        }
        
        override fun read(bytes: ByteArray, off: Int, len: Int): Int {
            if (data.isEmpty()) return -1
            val count = len.coerceAtMost(data.size)
            for (i in 0 until count) {
                bytes[off + i] = data.removeAt(0)
            }
            return count
        }
    }
    
    fun asResponseBody(contentType: MediaType?): ResponseBody {
        return ByteArrayResponseBody(readByteArray(), contentType)
    }
    
    fun clear(): Buffer {
        data.clear()
        return this
    }
    
    fun snapshot(): ByteArray = data.toByteArray()
    
    fun copy(): Buffer {
        val copy = Buffer()
        copy.data.addAll(this.data)
        return copy
    }
}

private class ByteArrayResponseBody(
    private val bytes: ByteArray,
    override val contentType: MediaType?
) : ResponseBody() {
    override fun string(): String = bytes.decodeToString()
    override fun bytes(): ByteArray = bytes
    override val contentLength: Long = bytes.size.toLong()
}

// Extension functions
fun ResponseBody.source(): BufferedSource {
    val buffer = Buffer()
    buffer.write(bytes())
    return buffer
}

