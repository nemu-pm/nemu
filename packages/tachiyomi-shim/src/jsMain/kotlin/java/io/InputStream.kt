package java.io

abstract class InputStream {
    abstract fun read(): Int
    open fun read(b: ByteArray): Int = read(b, 0, b.size)
    open fun read(b: ByteArray, off: Int, len: Int): Int = -1
    open fun close() {}
    open fun available(): Int = 0
    
    fun readBytes(): ByteArray {
        val buffer = mutableListOf<Byte>()
        val buf = ByteArray(4096)
        while (true) {
            val n = read(buf)
            if (n == -1) break
            for (i in 0 until n) {
                buffer.add(buf[i])
            }
        }
        return buffer.toByteArray()
    }
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

/**
 * InputStreamReader for reading characters from an InputStream.
 */
class InputStreamReader(private val inputStream: InputStream) {
    fun read(): Int {
        return inputStream.read()
    }
    
    fun read(cbuf: CharArray, off: Int, len: Int): Int {
        // Simple UTF-8 byte-to-char conversion
        var count = 0
        while (count < len) {
            val b = inputStream.read()
            if (b == -1) {
                return if (count == 0) -1 else count
            }
            cbuf[off + count] = b.toChar()
            count++
        }
        return count
    }
    
    fun close() {
        inputStream.close()
    }
}

/**
 * BufferedReader for reading text from a character stream.
 */
class BufferedReader(private val reader: InputStreamReader) {
    private val buffer = StringBuilder()
    
    fun readLine(): String? {
        val line = StringBuilder()
        while (true) {
            val c = reader.read()
            if (c == -1) {
                return if (line.isEmpty()) null else line.toString()
            }
            if (c.toChar() == '\n') {
                return line.toString()
            }
            if (c.toChar() != '\r') {
                line.append(c.toChar())
            }
        }
    }
    
    fun readText(): String {
        val result = StringBuilder()
        val buf = CharArray(4096)
        while (true) {
            val n = reader.read(buf, 0, buf.size)
            if (n == -1) break
            result.appendRange(buf, 0, n)
        }
        return result.toString()
    }
    
    fun close() {
        reader.close()
    }
    
    inline fun <T> use(block: (BufferedReader) -> T): T {
        return try {
            block(this)
        } finally {
            close()
        }
    }
}

