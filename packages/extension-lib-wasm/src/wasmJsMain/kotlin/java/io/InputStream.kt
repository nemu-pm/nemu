package java.io

abstract class InputStream {
    abstract fun read(): Int
    open fun read(b: ByteArray): Int = read(b, 0, b.size)
    open fun read(b: ByteArray, off: Int, len: Int): Int = -1
    open fun close() {}
    open fun available(): Int = 0
}

class ByteArrayInputStream(private val buf: ByteArray) : InputStream() {
    private var pos = 0
    
    override fun read(): Int {
        return if (pos < buf.size) buf[pos++].toInt() and 0xFF else -1
    }
    
    override fun read(b: ByteArray, off: Int, len: Int): Int {
        if (pos >= buf.size) return -1
        val count = minOf(len, buf.size - pos)
        buf.copyInto(b, off, pos, pos + count)
        pos += count
        return count
    }
    
    override fun available(): Int = buf.size - pos
}

