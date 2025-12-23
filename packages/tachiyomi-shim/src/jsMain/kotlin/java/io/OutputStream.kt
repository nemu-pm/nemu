package java.io

abstract class OutputStream {
    abstract fun write(b: Int)
    
    open fun write(b: ByteArray) {
        write(b, 0, b.size)
    }
    
    open fun write(b: ByteArray, off: Int, len: Int) {
        for (i in off until off + len) {
            write(b[i].toInt() and 0xFF)
        }
    }
    
    open fun flush() {}
    open fun close() {}
}

class ByteArrayOutputStream : OutputStream() {
    private val buf = mutableListOf<Byte>()
    
    override fun write(b: Int) {
        buf.add(b.toByte())
    }
    
    override fun write(b: ByteArray, off: Int, len: Int) {
        buf.addAll(b.slice(off until off + len))
    }
    
    fun toByteArray(): ByteArray = buf.toByteArray()
    
    fun size(): Int = buf.size
    
    override fun toString(): String = buf.toByteArray().decodeToString()
    
    fun reset() {
        buf.clear()
    }
}

