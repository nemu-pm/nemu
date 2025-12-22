package java.util.zip

import java.io.InputStream
import java.io.ByteArrayInputStream

/**
 * GZIPInputStream implementation for decompressing GZIP data.
 * 
 * GZIP format:
 * - 10 bytes header (magic, method, flags, mtime, xfl, os)
 * - optional extra fields
 * - DEFLATE compressed data
 * - 8 bytes trailer (CRC32, original size)
 */
class GZIPInputStream(private val inputStream: InputStream) : InputStream() {
    
    private var decompressedData: ByteArray? = null
    private var position: Int = 0
    private var initialized: Boolean = false
    
    private fun ensureDecompressed() {
        if (initialized) return
        initialized = true
        
        val compressedData = inputStream.readBytes()
        decompressedData = decompressGzip(compressedData)
    }
    
    override fun read(): Int {
        ensureDecompressed()
        val data = decompressedData ?: return -1
        if (position >= data.size) return -1
        return data[position++].toInt() and 0xFF
    }
    
    override fun read(b: ByteArray, off: Int, len: Int): Int {
        ensureDecompressed()
        val data = decompressedData ?: return -1
        if (position >= data.size) return -1
        
        val available = minOf(len, data.size - position)
        data.copyInto(b, off, position, position + available)
        position += available
        return available
    }
    
    override fun available(): Int {
        ensureDecompressed()
        val data = decompressedData ?: return 0
        return data.size - position
    }
    
    override fun close() {
        inputStream.close()
    }
    
    fun bufferedReader(): java.io.BufferedReader {
        ensureDecompressed()
        return java.io.BufferedReader(java.io.InputStreamReader(
            ByteArrayInputStream(decompressedData ?: ByteArray(0))
        ))
    }
}

/**
 * Decompress GZIP data.
 */
private fun decompressGzip(data: ByteArray): ByteArray? {
    if (data.size < 18) return null
    
    // Check magic number
    if (data[0] != 0x1F.toByte() || data[1] != 0x8B.toByte()) {
        return null // Not GZIP
    }
    
    // Check compression method (8 = deflate)
    if (data[2] != 0x08.toByte()) {
        return null // Unsupported compression method
    }
    
    val flags = data[3].toInt() and 0xFF
    var pos = 10 // Skip fixed header
    
    // Skip optional extra field
    if ((flags and 0x04) != 0) {
        val extraLen = ((data[pos + 1].toInt() and 0xFF) shl 8) or (data[pos].toInt() and 0xFF)
        pos += 2 + extraLen
    }
    
    // Skip optional original filename (null-terminated)
    if ((flags and 0x08) != 0) {
        while (pos < data.size && data[pos] != 0.toByte()) pos++
        pos++ // Skip null terminator
    }
    
    // Skip optional comment (null-terminated)
    if ((flags and 0x10) != 0) {
        while (pos < data.size && data[pos] != 0.toByte()) pos++
        pos++ // Skip null terminator
    }
    
    // Skip optional header CRC16
    if ((flags and 0x02) != 0) {
        pos += 2
    }
    
    // The rest (minus 8 byte trailer) is DEFLATE compressed data
    val deflateData = data.copyOfRange(pos, data.size - 8)
    
    return inflate(deflateData)
}

/**
 * Inflate DEFLATE compressed data (raw DEFLATE, no zlib header).
 */
private fun inflate(data: ByteArray): ByteArray? {
    if (data.isEmpty()) return ByteArray(0)
    
    val output = mutableListOf<Byte>()
    val window = ByteArray(32768)
    var windowPos = 0
    
    var pos = 0
    var bitBuffer = 0
    var bitCount = 0
    
    fun readBit(): Int {
        if (bitCount == 0) {
            if (pos >= data.size) return 0
            bitBuffer = data[pos++].toInt() and 0xFF
            bitCount = 8
        }
        val bit = bitBuffer and 1
        bitBuffer = bitBuffer shr 1
        bitCount--
        return bit
    }
    
    fun readBits(n: Int): Int {
        var result = 0
        for (i in 0 until n) {
            result = result or (readBit() shl i)
        }
        return result
    }
    
    fun writeOutput(byte: Byte) {
        output.add(byte)
        window[windowPos] = byte
        windowPos = (windowPos + 1) and 0x7FFF
    }
    
    // Fixed Huffman decode tables
    val fixedLitLenLengths = IntArray(288) { i ->
        when {
            i < 144 -> 8
            i < 256 -> 9
            i < 280 -> 7
            else -> 8
        }
    }
    
    var bfinal = 0
    while (bfinal == 0 && pos <= data.size) {
        bfinal = readBit()
        val btype = readBits(2)
        
        when (btype) {
            0 -> {
                // Stored block
                bitCount = 0 // Align to byte boundary
                if (pos + 4 > data.size) break
                val len = (data[pos].toInt() and 0xFF) or ((data[pos + 1].toInt() and 0xFF) shl 8)
                pos += 4 // Skip LEN and NLEN
                for (i in 0 until len) {
                    if (pos >= data.size) break
                    writeOutput(data[pos++])
                }
            }
            1 -> {
                // Fixed Huffman codes
                while (true) {
                    val code = decodeFixedLitLen(::readBit)
                    
                    if (code < 256) {
                        writeOutput(code.toByte())
                    } else if (code == 256) {
                        break // End of block
                    } else {
                        // Length/distance pair
                        val length = decodeLengthExtra(code, ::readBits)
                        val distCode = readBits(5).reverseBits(5)
                        val distance = decodeDistanceExtra(distCode, ::readBits)
                        
                        for (i in 0 until length) {
                            val srcPos = (windowPos - distance + 32768) and 0x7FFF
                            val byte = window[srcPos]
                            writeOutput(byte)
                        }
                    }
                }
            }
            2 -> {
                // Dynamic Huffman codes
                val hlit = readBits(5) + 257
                val hdist = readBits(5) + 1
                val hclen = readBits(4) + 4
                
                // Code length code lengths
                val codeLengthOrder = intArrayOf(16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15)
                val codeLengthLengths = IntArray(19)
                for (i in 0 until hclen) {
                    codeLengthLengths[codeLengthOrder[i]] = readBits(3)
                }
                
                val codeLengthTree = buildHuffmanTree(codeLengthLengths)
                
                // Read literal/length and distance code lengths
                val allLengths = IntArray(hlit + hdist)
                var idx = 0
                while (idx < hlit + hdist) {
                    val sym = decodeHuffman(codeLengthTree, ::readBit)
                    when {
                        sym < 16 -> allLengths[idx++] = sym
                        sym == 16 -> {
                            val repeat = readBits(2) + 3
                            val prev = if (idx > 0) allLengths[idx - 1] else 0
                            for (i in 0 until repeat) allLengths[idx++] = prev
                        }
                        sym == 17 -> {
                            val repeat = readBits(3) + 3
                            for (i in 0 until repeat) allLengths[idx++] = 0
                        }
                        sym == 18 -> {
                            val repeat = readBits(7) + 11
                            for (i in 0 until repeat) allLengths[idx++] = 0
                        }
                    }
                }
                
                val litLenLengths = allLengths.copyOfRange(0, hlit)
                val distLengths = allLengths.copyOfRange(hlit, hlit + hdist)
                
                val litLenTree = buildHuffmanTree(litLenLengths)
                val distTree = buildHuffmanTree(distLengths)
                
                // Decode data
                while (true) {
                    val code = decodeHuffman(litLenTree, ::readBit)
                    
                    if (code < 256) {
                        writeOutput(code.toByte())
                    } else if (code == 256) {
                        break
                    } else {
                        val length = decodeLengthExtra(code, ::readBits)
                        val distCode = decodeHuffman(distTree, ::readBit)
                        val distance = decodeDistanceExtra(distCode, ::readBits)
                        
                        for (i in 0 until length) {
                            val srcPos = (windowPos - distance + 32768) and 0x7FFF
                            val byte = window[srcPos]
                            writeOutput(byte)
                        }
                    }
                }
            }
            else -> return null // Invalid block type
        }
    }
    
    return output.toByteArray()
}

// Huffman tree node
private class HuffmanNode {
    var value: Int = -1
    var left: HuffmanNode? = null
    var right: HuffmanNode? = null
}

private fun buildHuffmanTree(lengths: IntArray): HuffmanNode {
    val root = HuffmanNode()
    
    // Count codes for each length
    val maxLen = lengths.maxOrNull() ?: 0
    if (maxLen == 0) return root
    
    val blCount = IntArray(maxLen + 1)
    for (len in lengths) {
        if (len > 0) blCount[len]++
    }
    
    // Find numerical value of smallest code for each length
    val nextCode = IntArray(maxLen + 1)
    var code = 0
    for (bits in 1..maxLen) {
        code = (code + blCount[bits - 1]) shl 1
        nextCode[bits] = code
    }
    
    // Assign codes to symbols
    for (sym in lengths.indices) {
        val len = lengths[sym]
        if (len > 0) {
            insertCode(root, nextCode[len], len, sym)
            nextCode[len]++
        }
    }
    
    return root
}

private fun insertCode(root: HuffmanNode, code: Int, length: Int, value: Int) {
    var node = root
    for (i in length - 1 downTo 0) {
        val bit = (code shr i) and 1
        if (bit == 0) {
            if (node.left == null) node.left = HuffmanNode()
            node = node.left!!
        } else {
            if (node.right == null) node.right = HuffmanNode()
            node = node.right!!
        }
    }
    node.value = value
}

private fun decodeHuffman(tree: HuffmanNode, readBit: () -> Int): Int {
    var node = tree
    while (node.value == -1) {
        val bit = readBit()
        node = if (bit == 0) node.left ?: return 0 else node.right ?: return 0
    }
    return node.value
}

// Decode literal/length from fixed Huffman codes
private fun decodeFixedLitLen(readBit: () -> Int): Int {
    // Read up to 9 bits and decode
    var code = 0
    var bits = 0
    
    // First 7 bits can identify codes 256-279
    for (i in 0 until 7) {
        code = (code shl 1) or readBit()
        bits++
    }
    
    if (code in 0..23) {
        // 256-279: 7-bit codes starting at 0b0000000
        return code + 256
    }
    
    // Read 8th bit
    code = (code shl 1) or readBit()
    bits++
    
    if (code in 48..191) {
        // 0-143: 8-bit codes 00110000-10111111
        return code - 48
    }
    if (code in 192..199) {
        // 280-287: 8-bit codes 11000000-11000111
        return code - 192 + 280
    }
    
    // Read 9th bit
    code = (code shl 1) or readBit()
    
    // 144-255: 9-bit codes 110010000-111111111
    return code - 400 + 144
}

private fun Int.reverseBits(n: Int): Int {
    var result = 0
    var value = this
    for (i in 0 until n) {
        result = (result shl 1) or (value and 1)
        value = value shr 1
    }
    return result
}

// Length extra bits table
private val LENGTH_EXTRA_BITS = intArrayOf(
    0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2,
    3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0
)
private val LENGTH_BASE = intArrayOf(
    3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31,
    35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258
)

private fun decodeLengthExtra(code: Int, readBits: (Int) -> Int): Int {
    val idx = code - 257
    if (idx < 0 || idx >= LENGTH_BASE.size) return 3
    return LENGTH_BASE[idx] + readBits(LENGTH_EXTRA_BITS[idx])
}

// Distance extra bits table
private val DISTANCE_EXTRA_BITS = intArrayOf(
    0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6,
    7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13
)
private val DISTANCE_BASE = intArrayOf(
    1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193,
    257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577
)

private fun decodeDistanceExtra(code: Int, readBits: (Int) -> Int): Int {
    if (code < 0 || code >= DISTANCE_BASE.size) return 1
    return DISTANCE_BASE[code] + readBits(DISTANCE_EXTRA_BITS[code])
}

