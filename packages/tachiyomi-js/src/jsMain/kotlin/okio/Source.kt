package okio

import java.io.Closeable

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
    return object : BufferedSource {
        private val buffer = Buffer()
        
        override fun readByteArray(): ByteArray = buffer.readByteArray()
        override fun readByteArray(byteCount: Long): ByteArray = buffer.readByteArray(byteCount)
        override fun read(sink: ByteArray, offset: Int, byteCount: Int): Int = buffer.read(sink, offset, byteCount)
        override fun readByte(): Byte = buffer.readByte()
        override fun readShort(): Short = buffer.readShort()
        override fun readInt(): Int = buffer.readInt()
        override fun readLong(): Long = buffer.readLong()
        override fun readUtf8(): String = buffer.readUtf8()
        override fun readUtf8(byteCount: Long): String = buffer.readUtf8(byteCount)
        override fun readUtf8Line(): String? = buffer.readUtf8Line()
        override fun skip(byteCount: Long) = buffer.skip(byteCount)
        override val exhausted: Boolean get() = buffer.exhausted
        override fun close() = source.close()
    }
}

