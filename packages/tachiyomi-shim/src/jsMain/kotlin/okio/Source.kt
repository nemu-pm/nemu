package okio

import java.io.Closeable
import javax.crypto.Cipher

/**
 * Okio Source interfaces.
 */
interface Source : Closeable {
    fun read(sink: Buffer, byteCount: Long): Long
    override fun close()
}

interface BufferedSource : Source {
    fun readByteArray(): ByteArray
    fun readByteArray(byteCount: Long): ByteArray
    fun read(sink: ByteArray, offset: Int, byteCount: Int): Int
    fun readByte(): Byte
    fun readShort(): Short
    fun readInt(): Int
    fun readLong(): Long
    fun readUtf8(): String
    fun readUtf8(byteCount: Long): String
    fun readUtf8Line(): String?
    fun skip(byteCount: Long)
    val exhausted: Boolean
    
    override fun read(sink: Buffer, byteCount: Long): Long {
        val bytes = readByteArray(byteCount)
        sink.write(bytes)
        return bytes.size.toLong()
    }
}

interface Sink : Closeable {
    fun write(source: Buffer, byteCount: Long)
    fun flush()
    override fun close()
}

interface BufferedSink : Sink {
    override fun write(source: Buffer, byteCount: Long) {
        // Default implementation
    }
    
    override fun flush() {}
}

// Extension to convert Source to BufferedSource
fun Source.buffer(): BufferedSource {
    val source = this
    val buffer = Buffer()
    
    // Read all data from source into buffer
    while (true) {
        val bytesRead = source.read(buffer, 8192)
        if (bytesRead == -1L) break
    }
    
    return buffer
}

/**
 * Creates a Source that decrypts data from this source using the given cipher.
 * Used for AES-encrypted image streams.
 */
fun BufferedSource.cipherSource(cipher: Cipher): Source {
    val original = this
    return object : Source {
        private var decryptedBytes: ByteArray? = null
        private var offset = 0
        
        override fun read(sink: Buffer, byteCount: Long): Long {
            // Lazily decrypt all data on first read
            if (decryptedBytes == null) {
                val encrypted = original.readByteArray()
                decryptedBytes = cipher.doFinal(encrypted)
            }
            
            val bytes = decryptedBytes!!
            if (offset >= bytes.size) return -1L
            
            val toRead = minOf(byteCount.toInt(), bytes.size - offset)
            sink.write(bytes, offset, toRead)
            offset += toRead
            return toRead.toLong()
        }
        
        override fun close() {
            original.close()
        }
    }
}

/**
 * Extension to convert a BufferedSource to a ResponseBody.
 * Defined in okio package so it can be used with fully-qualified import.
 */
fun BufferedSource.asResponseBody(contentType: okhttp3.MediaType?): okhttp3.ResponseBody {
    val bytes = this.readByteArray()
    return object : okhttp3.ResponseBody() {
        override fun string(): String = bytes.decodeToString()
        override fun bytes(): ByteArray = bytes
        override val contentType: okhttp3.MediaType? = contentType
        override val contentLength: Long = bytes.size.toLong()
    }
}

