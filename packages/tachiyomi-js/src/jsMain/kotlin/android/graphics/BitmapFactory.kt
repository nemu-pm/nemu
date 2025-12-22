package android.graphics

import java.io.InputStream

/**
 * Android BitmapFactory shim for Kotlin/JS.
 * Decodes PNG and JPEG images using JS jpeg-js library via ImageBridge.
 */
object BitmapFactory {
    /**
     * Decode a bitmap from an InputStream.
     */
    fun decodeStream(stream: InputStream): Bitmap {
        val bytes = stream.readAllBytes()
        return decodeByteArray(bytes, 0, bytes.size)
    }

    /**
     * Decode a bitmap from a byte array.
     * Uses JS jpeg-js library for reliable JPEG decoding.
     */
    fun decodeByteArray(data: ByteArray, offset: Int, length: Int): Bitmap {
        require(length >= 8) { "Image data too small" }
        val bytes = if (offset == 0 && length == data.size) data else data.copyOfRange(offset, offset + length)
        
        // Use JS bridge for decoding (jpeg-js library)
        val decoded = ImageBridge.decodeImage(bytes)
        if (decoded != null) {
            return Bitmap.createFromPixels(decoded.width, decoded.height, decoded.pixels)
        }
        
        // Fallback to pure Kotlin decoders if JS bridge fails
        return when {
            isPng(bytes) -> PngDecoder.decode(bytes) ?: throw IllegalArgumentException("Failed to decode PNG")
            isJpeg(bytes) -> JpegDecoder.decode(bytes) ?: throw IllegalArgumentException("Failed to decode JPEG")
            else -> throw IllegalArgumentException("Unknown image format")
        }
    }

    /**
     * Decode with options (simplified - ignores most options).
     */
    fun decodeByteArray(data: ByteArray, offset: Int, length: Int, opts: Options?): Bitmap? {
        if (opts?.inJustDecodeBounds == true) {
            // Just get dimensions
            val bytes = if (offset == 0 && length == data.size) data else data.copyOfRange(offset, offset + length)
            val dims = getImageDimensions(bytes)
            if (dims != null) {
                opts.outWidth = dims.first
                opts.outHeight = dims.second
            }
            return null
        }
        return decodeByteArray(data, offset, length)
    }

    fun decodeStream(stream: InputStream, rect: Rect?, opts: Options?): Bitmap {
        return decodeStream(stream)
    }

    private fun isPng(data: ByteArray): Boolean {
        return data.size >= 8 &&
            data[0] == 0x89.toByte() &&
            data[1] == 0x50.toByte() &&
            data[2] == 0x4E.toByte() &&
            data[3] == 0x47.toByte()
    }

    private fun isJpeg(data: ByteArray): Boolean {
        return data.size >= 2 &&
            data[0] == 0xFF.toByte() &&
            data[1] == 0xD8.toByte()
    }

    private fun getImageDimensions(data: ByteArray): Pair<Int, Int>? {
        return when {
            isPng(data) -> PngDecoder.getDimensions(data)
            isJpeg(data) -> JpegDecoder.getDimensions(data)
            else -> null
        }
    }

    /**
     * Options for decoding.
     */
    class Options {
        var inJustDecodeBounds: Boolean = false
        var inSampleSize: Int = 1
        var inPreferredConfig: Bitmap.Config = Bitmap.Config.ARGB_8888
        var outWidth: Int = 0
        var outHeight: Int = 0
        var outMimeType: String? = null
        var inMutable: Boolean = false
    }
}

/**
 * Read all bytes from InputStream.
 */
private fun InputStream.readAllBytes(): ByteArray {
    val buffer = mutableListOf<Byte>()
    val temp = ByteArray(8192)
    var n: Int
    while (read(temp).also { n = it } > 0) {
        buffer.addAll(temp.slice(0 until n))
    }
    return buffer.toByteArray()
}

/**
 * PNG decoder - pure Kotlin implementation.
 */
internal object PngDecoder {
    fun getDimensions(data: ByteArray): Pair<Int, Int>? {
        if (data.size < 24) return null
        // Skip signature (8) and IHDR length+type (8), read width and height
        val width = (data[16].toInt() and 0xFF shl 24) or
                    (data[17].toInt() and 0xFF shl 16) or
                    (data[18].toInt() and 0xFF shl 8) or
                    (data[19].toInt() and 0xFF)
        val height = (data[20].toInt() and 0xFF shl 24) or
                     (data[21].toInt() and 0xFF shl 16) or
                     (data[22].toInt() and 0xFF shl 8) or
                     (data[23].toInt() and 0xFF)
        return Pair(width, height)
    }

    fun decode(data: ByteArray): Bitmap? {
        var pos = 8 // Skip PNG signature

        var width = 0
        var height = 0
        var bitDepth = 0
        var colorType = 0
        val idatChunks = mutableListOf<ByteArray>()

        // Parse chunks
        while (pos + 8 <= data.size) {
            val length = readInt(data, pos)
            val type = data.sliceArray(pos + 4 until pos + 8).decodeToString()
            pos += 8

            when (type) {
                "IHDR" -> {
                    width = readInt(data, pos)
                    height = readInt(data, pos + 4)
                    bitDepth = data[pos + 8].toInt() and 0xFF
                    colorType = data[pos + 9].toInt() and 0xFF
                }
                "IDAT" -> {
                    idatChunks.add(data.sliceArray(pos until pos + length))
                }
                "IEND" -> break
            }
            pos += length + 4 // data + CRC
        }

        if (width == 0 || height == 0) return null

        // Concatenate IDAT chunks
        val compressedData = ByteArray(idatChunks.sumOf { it.size })
        var offset = 0
        for (chunk in idatChunks) {
            chunk.copyInto(compressedData, offset)
            offset += chunk.size
        }

        // Decompress zlib stream
        val inflatedData = inflate(compressedData)
        if (inflatedData == null) {
            println("[PngDecoder] Failed to inflate")
            return null
        }

        // Determine bytes per pixel based on color type
        val bytesPerPixel = when (colorType) {
            0 -> 1  // Grayscale
            2 -> 3  // RGB
            3 -> 1  // Indexed (palette)
            4 -> 2  // Grayscale + Alpha
            6 -> 4  // RGBA
            else -> return null
        }

        val scanlineSize = 1 + width * bytesPerPixel
        if (inflatedData.size < height * scanlineSize) {
            println("[PngDecoder] Inflated data too small: ${inflatedData.size} < ${height * scanlineSize}")
            return null
        }

        // Unfilter scanlines
        val imageData = ByteArray(width * height * bytesPerPixel)
        val prevScanline = ByteArray(width * bytesPerPixel)

        for (y in 0 until height) {
            val scanlineStart = y * scanlineSize
            val filterType = inflatedData[scanlineStart].toInt() and 0xFF
            val scanline = inflatedData.sliceArray(scanlineStart + 1 until scanlineStart + scanlineSize)

            // Apply filter
            val unfiltered = ByteArray(width * bytesPerPixel)
            for (x in 0 until width * bytesPerPixel) {
                val raw = scanline[x].toInt() and 0xFF
                val a = if (x >= bytesPerPixel) unfiltered[x - bytesPerPixel].toInt() and 0xFF else 0
                val b = prevScanline[x].toInt() and 0xFF
                val c = if (x >= bytesPerPixel) prevScanline[x - bytesPerPixel].toInt() and 0xFF else 0

                unfiltered[x] = when (filterType) {
                    0 -> raw // None
                    1 -> (raw + a) and 0xFF // Sub
                    2 -> (raw + b) and 0xFF // Up
                    3 -> (raw + (a + b) / 2) and 0xFF // Average
                    4 -> (raw + paethPredictor(a, b, c)) and 0xFF // Paeth
                    else -> raw
                }.toByte()
            }

            unfiltered.copyInto(imageData, y * width * bytesPerPixel)
            unfiltered.copyInto(prevScanline)
        }

        // Convert to ARGB pixels
        val pixels = IntArray(width * height)
        for (i in 0 until width * height) {
            pixels[i] = when (colorType) {
                0 -> { // Grayscale
                    val g = imageData[i].toInt() and 0xFF
                    (0xFF shl 24) or (g shl 16) or (g shl 8) or g
                }
                2 -> { // RGB
                    val r = imageData[i * 3].toInt() and 0xFF
                    val g = imageData[i * 3 + 1].toInt() and 0xFF
                    val b = imageData[i * 3 + 2].toInt() and 0xFF
                    (0xFF shl 24) or (r shl 16) or (g shl 8) or b
                }
                4 -> { // Grayscale + Alpha
                    val g = imageData[i * 2].toInt() and 0xFF
                    val a = imageData[i * 2 + 1].toInt() and 0xFF
                    (a shl 24) or (g shl 16) or (g shl 8) or g
                }
                6 -> { // RGBA
                    val r = imageData[i * 4].toInt() and 0xFF
                    val g = imageData[i * 4 + 1].toInt() and 0xFF
                    val b = imageData[i * 4 + 2].toInt() and 0xFF
                    val a = imageData[i * 4 + 3].toInt() and 0xFF
                    (a shl 24) or (r shl 16) or (g shl 8) or b
                }
                else -> 0
            }
        }

        return Bitmap.createFromPixels(width, height, pixels)
    }

    private fun readInt(data: ByteArray, offset: Int): Int {
        return (data[offset].toInt() and 0xFF shl 24) or
               (data[offset + 1].toInt() and 0xFF shl 16) or
               (data[offset + 2].toInt() and 0xFF shl 8) or
               (data[offset + 3].toInt() and 0xFF)
    }

    private fun paethPredictor(a: Int, b: Int, c: Int): Int {
        val p = a + b - c
        val pa = kotlin.math.abs(p - a)
        val pb = kotlin.math.abs(p - b)
        val pc = kotlin.math.abs(p - c)
        return when {
            pa <= pb && pa <= pc -> a
            pb <= pc -> b
            else -> c
        }
    }

    /**
     * Inflate zlib-compressed data (DEFLATE algorithm).
     */
    private fun inflate(data: ByteArray): ByteArray? {
        if (data.size < 2) return null

        // Skip zlib header (2 bytes)
        var pos = 2
        val output = mutableListOf<Byte>()
        val window = ByteArray(32768)
        var windowPos = 0

        // Fixed Huffman tables (for BTYPE=01)
        // Code lengths: 0-143=8, 144-255=9, 256-279=7, 280-287=8
        
        var bfinal = 0
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

        while (bfinal == 0 && pos < data.size - 4) {
            bfinal = readBit()
            val btype = readBits(2)

            when (btype) {
                0 -> {
                    // Stored block
                    bitCount = 0
                    if (pos + 4 > data.size) break
                    val len = (data[pos].toInt() and 0xFF) or ((data[pos + 1].toInt() and 0xFF) shl 8)
                    pos += 4 // len + nlen
                    for (i in 0 until len) {
                        if (pos >= data.size - 4) break
                        writeOutput(data[pos++])
                    }
                }
                1, 2 -> {
                    // Fixed or dynamic Huffman
                    val litLenCodes: IntArray
                    val distCodes: IntArray

                    if (btype == 1) {
                        // Fixed Huffman codes
                        litLenCodes = IntArray(288) { i ->
                            when {
                                i < 144 -> 8
                                i < 256 -> 9
                                i < 280 -> 7
                                else -> 8
                            }
                        }
                        distCodes = IntArray(32) { 5 }
                    } else {
                        // Dynamic Huffman codes
                        val hlit = readBits(5) + 257
                        val hdist = readBits(5) + 1
                        val hclen = readBits(4) + 4

                        val codeLengthOrder = intArrayOf(16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15)
                        val codeLengthLengths = IntArray(19)
                        for (i in 0 until hclen) {
                            codeLengthLengths[codeLengthOrder[i]] = readBits(3)
                        }

                        val codeLengthTree = buildHuffmanTree(codeLengthLengths)

                        fun readCodeLengths(count: Int): IntArray {
                            val lengths = IntArray(count)
                            var i = 0
                            while (i < count) {
                                val symbol = decodeHuffman(codeLengthTree, ::readBit)
                                when {
                                    symbol < 16 -> lengths[i++] = symbol
                                    symbol == 16 -> {
                                        val repeat = readBits(2) + 3
                                        val prev = if (i > 0) lengths[i - 1] else 0
                                        for (j in 0 until repeat) {
                                            if (i < count) lengths[i++] = prev
                                        }
                                    }
                                    symbol == 17 -> {
                                        val repeat = readBits(3) + 3
                                        for (j in 0 until repeat) {
                                            if (i < count) lengths[i++] = 0
                                        }
                                    }
                                    symbol == 18 -> {
                                        val repeat = readBits(7) + 11
                                        for (j in 0 until repeat) {
                                            if (i < count) lengths[i++] = 0
                                        }
                                    }
                                }
                            }
                            return lengths
                        }

                        litLenCodes = readCodeLengths(hlit)
                        distCodes = readCodeLengths(hdist)
                    }

                    val litLenTree = buildHuffmanTree(litLenCodes)
                    val distTree = buildHuffmanTree(distCodes)

                    val lengthBase = intArrayOf(3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258)
                    val lengthExtra = intArrayOf(0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0)
                    val distBase = intArrayOf(1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577)
                    val distExtra = intArrayOf(0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13)

                    while (true) {
                        val symbol = decodeHuffman(litLenTree, ::readBit)
                        when {
                            symbol < 256 -> writeOutput(symbol.toByte())
                            symbol == 256 -> break
                            else -> {
                                val lengthIdx = symbol - 257
                                if (lengthIdx >= lengthBase.size) break
                                val length = lengthBase[lengthIdx] + readBits(lengthExtra[lengthIdx])
                                val distIdx = decodeHuffman(distTree, ::readBit)
                                if (distIdx >= distBase.size) break
                                val distance = distBase[distIdx] + readBits(distExtra[distIdx])

                                for (j in 0 until length) {
                                    val copyPos = (windowPos - distance) and 0x7FFF
                                    writeOutput(window[copyPos])
                                }
                            }
                        }
                    }
                }
                else -> break
            }
        }

        return output.toByteArray()
    }

    private class HuffmanNode(var symbol: Int = -1, var left: HuffmanNode? = null, var right: HuffmanNode? = null)

    private fun buildHuffmanTree(lengths: IntArray): HuffmanNode {
        val root = HuffmanNode()
        val maxLen = lengths.maxOrNull() ?: 0
        if (maxLen == 0) return root

        // Count codes per length
        val blCount = IntArray(maxLen + 1)
        for (len in lengths) {
            if (len > 0) blCount[len]++
        }

        // Compute first code for each length
        val nextCode = IntArray(maxLen + 1)
        var code = 0
        for (bits in 1..maxLen) {
            code = (code + blCount[bits - 1]) shl 1
            nextCode[bits] = code
        }

        // Assign codes and build tree
        for (n in lengths.indices) {
            val len = lengths[n]
            if (len > 0) {
                val c = nextCode[len]++
                var node = root
                for (i in len - 1 downTo 0) {
                    val bit = (c shr i) and 1
                    if (bit == 0) {
                        if (node.left == null) node.left = HuffmanNode()
                        node = node.left!!
                    } else {
                        if (node.right == null) node.right = HuffmanNode()
                        node = node.right!!
                    }
                }
                node.symbol = n
            }
        }
        return root
    }

    private fun decodeHuffman(tree: HuffmanNode, readBit: () -> Int): Int {
        var node = tree
        while (node.symbol < 0) {
            val bit = readBit()
            node = if (bit == 0) node.left ?: return 0 else node.right ?: return 0
        }
        return node.symbol
    }
}

/**
 * JPEG decoder - simplified implementation for common baseline JPEGs.
 */
internal object JpegDecoder {
    fun getDimensions(data: ByteArray): Pair<Int, Int>? {
        var pos = 2 // Skip SOI
        while (pos + 4 < data.size) {
            if (data[pos] != 0xFF.toByte()) { pos++; continue }
            val marker = data[pos + 1].toInt() and 0xFF
            pos += 2

            if (marker == 0xC0 || marker == 0xC1 || marker == 0xC2) {
                // SOF marker
                val height = ((data[pos + 3].toInt() and 0xFF) shl 8) or (data[pos + 4].toInt() and 0xFF)
                val width = ((data[pos + 5].toInt() and 0xFF) shl 8) or (data[pos + 6].toInt() and 0xFF)
                return Pair(width, height)
            }

            if (marker == 0xD9 || marker == 0xDA) break
            if (marker in 0xD0..0xD8) continue // RST markers
            if (marker == 0x01 || marker == 0xFF) continue

            val length = ((data[pos].toInt() and 0xFF) shl 8) or (data[pos + 1].toInt() and 0xFF)
            pos += length
        }
        return null
    }

    fun decode(data: ByteArray): Bitmap? {
        // Full JPEG decoding is complex. For now, try to parse basic structure.
        // If this fails, we could fall back to returning null and letting the caller handle it.

        var pos = 2
        var width = 0
        var height = 0
        val quantTables = Array<IntArray?>(4) { null }
        val huffDC = Array<HuffmanTable?>(4) { null }
        val huffAC = Array<HuffmanTable?>(4) { null }
        var components = mutableListOf<Component>()
        var scanData: ByteArray? = null

        while (pos + 2 < data.size) {
            if (data[pos] != 0xFF.toByte()) { pos++; continue }
            val marker = data[pos + 1].toInt() and 0xFF
            pos += 2

            when (marker) {
                0xD8 -> continue // SOI
                0xD9 -> break    // EOI
                0xC0, 0xC1 -> { // SOF0, SOF1 (baseline/extended)
                    val len = readShort(data, pos)
                    val precision = data[pos + 2].toInt() and 0xFF
                    height = readShort(data, pos + 3)
                    width = readShort(data, pos + 5)
                    val numComponents = data[pos + 7].toInt() and 0xFF
                    components.clear()
                    for (i in 0 until numComponents) {
                        val id = data[pos + 8 + i * 3].toInt() and 0xFF
                        val sampling = data[pos + 9 + i * 3].toInt() and 0xFF
                        val qt = data[pos + 10 + i * 3].toInt() and 0xFF
                        components.add(Component(id, sampling shr 4, sampling and 0xF, qt))
                    }
                    pos += len
                }
                0xDB -> { // DQT
                    val len = readShort(data, pos)
                    var offset = pos + 2
                    while (offset < pos + len) {
                        val info = data[offset++].toInt() and 0xFF
                        val id = info and 0xF
                        val precision = info shr 4
                        val table = IntArray(64)
                        for (i in 0 until 64) {
                            table[i] = if (precision == 0) {
                                data[offset++].toInt() and 0xFF
                            } else {
                                readShort(data, offset).also { offset += 2 }
                            }
                        }
                        quantTables[id] = table
                    }
                    pos += len
                }
                0xC4 -> { // DHT
                    val len = readShort(data, pos)
                    var offset = pos + 2
                    while (offset < pos + len) {
                        val info = data[offset++].toInt() and 0xFF
                        val type = (info shr 4) and 1
                        val id = info and 0xF
                        val bits = IntArray(16)
                        var totalCodes = 0
                        for (i in 0 until 16) {
                            bits[i] = data[offset++].toInt() and 0xFF
                            totalCodes += bits[i]
                        }
                        val values = IntArray(totalCodes)
                        for (i in 0 until totalCodes) {
                            values[i] = data[offset++].toInt() and 0xFF
                        }
                        val table = buildJpegHuffmanTable(bits, values)
                        if (type == 0) huffDC[id] = table else huffAC[id] = table
                    }
                    pos += len
                }
                0xDA -> { // SOS
                    val len = readShort(data, pos)
                    pos += len
                    // Find scan data (until next marker or EOI)
                    val start = pos
                    while (pos + 1 < data.size) {
                        if (data[pos] == 0xFF.toByte() && data[pos + 1] != 0x00.toByte() && (data[pos + 1].toInt() and 0xFF) !in 0xD0..0xD7) {
                            break
                        }
                        pos++
                    }
                    scanData = data.sliceArray(start until pos)
                }
                in 0xE0..0xEF, 0xFE -> { // APP, COM
                    val len = readShort(data, pos)
                    pos += len
                }
                in 0xD0..0xD7 -> continue // RST
                0x00, 0x01, 0xFF -> continue
                else -> {
                    if (pos + 2 <= data.size) {
                        val len = readShort(data, pos)
                        pos += len
                    }
                }
            }
        }

        if (width == 0 || height == 0 || scanData == null) {
            println("[JpegDecoder] Failed to parse JPEG: ${width}x${height}")
            return null
        }

        // Decode baseline JPEG
        return try {
            decodeBaseline(width, height, components, quantTables, huffDC, huffAC, scanData)
        } catch (e: Exception) {
            println("[JpegDecoder] Decode error: ${e.message}")
            null
        }
    }

    private data class Component(val id: Int, val hSampling: Int, val vSampling: Int, val quantTable: Int)
    private data class HuffmanTable(val maxCode: IntArray, val valPtr: IntArray, val values: IntArray)

    private fun readShort(data: ByteArray, pos: Int): Int {
        return ((data[pos].toInt() and 0xFF) shl 8) or (data[pos + 1].toInt() and 0xFF)
    }

    private fun buildJpegHuffmanTable(bits: IntArray, values: IntArray): HuffmanTable {
        val maxCode = IntArray(17) { -1 }
        val valPtr = IntArray(17) { 0 }

        var code = 0
        var j = 0
        for (i in 1..16) {
            if (bits[i - 1] != 0) {
                valPtr[i] = j
                for (k in 0 until bits[i - 1]) {
                    code++
                    j++
                }
                maxCode[i] = code - 1
                code = code shl 1
            } else {
                code = code shl 1
            }
        }
        return HuffmanTable(maxCode, valPtr, values)
    }

    private fun decodeBaseline(
        width: Int,
        height: Int,
        components: List<Component>,
        quantTables: Array<IntArray?>,
        huffDC: Array<HuffmanTable?>,
        huffAC: Array<HuffmanTable?>,
        scanData: ByteArray
    ): Bitmap {
        // Simplified: Assume 4:4:4 sampling (most common for small images)
        val mcuWidth = 8
        val mcuHeight = 8
        val mcuCountX = (width + mcuWidth - 1) / mcuWidth
        val mcuCountY = (height + mcuHeight - 1) / mcuHeight

        val pixels = IntArray(width * height)
        val yData = IntArray(mcuCountX * mcuCountY * 64)
        val cbData = IntArray(mcuCountX * mcuCountY * 64)
        val crData = IntArray(mcuCountX * mcuCountY * 64)

        // Remove byte stuffing
        val unstuffed = mutableListOf<Byte>()
        var i = 0
        while (i < scanData.size) {
            if (scanData[i] == 0xFF.toByte() && i + 1 < scanData.size && scanData[i + 1] == 0x00.toByte()) {
                unstuffed.add(0xFF.toByte())
                i += 2
            } else {
                unstuffed.add(scanData[i])
                i++
            }
        }
        val bitstream = unstuffed.toByteArray()

        // Bit reader
        var bytePos = 0
        var bitPos = 0
        var bitBuffer = if (bitstream.isNotEmpty()) bitstream[0].toInt() and 0xFF else 0

        fun readBit(): Int {
            if (bitPos >= 8) {
                bitPos = 0
                bytePos++
                bitBuffer = if (bytePos < bitstream.size) bitstream[bytePos].toInt() and 0xFF else 0
            }
            val bit = (bitBuffer shr (7 - bitPos)) and 1
            bitPos++
            return bit
        }

        fun readBits(n: Int): Int {
            var result = 0
            for (j in 0 until n) {
                result = (result shl 1) or readBit()
            }
            return result
        }

        fun decodeHuffman(table: HuffmanTable): Int {
            var code = 0
            for (len in 1..16) {
                code = (code shl 1) or readBit()
                if (code <= table.maxCode[len]) {
                    val idx = table.valPtr[len] + code - (table.maxCode[len] - (table.values.size.coerceAtMost(table.valPtr[len] + 1) - table.valPtr[len] - 1).coerceAtLeast(0))
                    // Simplified index calculation
                    val valueIdx = table.valPtr[len] + (code - (table.maxCode[len] + 1 - (if (len > 0 && len <= 16) {
                        var count = 0
                        for (l in 1 until len) count += if (table.maxCode[l] >= 0) table.maxCode[l] + 1 - (if (l > 1) table.maxCode[l-1] + 1 else 0) else 0
                        count.coerceAtLeast(0)
                    } else 0)))
                    if (valueIdx >= 0 && valueIdx < table.values.size) {
                        return table.values[valueIdx]
                    }
                    return table.values.getOrElse(code.coerceIn(0, table.values.size - 1)) { 0 }
                }
            }
            return 0
        }

        fun extend(value: Int, bits: Int): Int {
            if (bits == 0) return 0
            val vt = 1 shl (bits - 1)
            return if (value < vt) value - (1 shl bits) + 1 else value
        }

        // Zigzag order
        val zigzag = intArrayOf(
            0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5,
            12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28,
            35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51,
            58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63
        )

        var dcY = 0
        var dcCb = 0
        var dcCr = 0

        val isGrayscale = components.size == 1

        // Decode MCUs
        for (mcuY in 0 until mcuCountY) {
            for (mcuX in 0 until mcuCountX) {
                // Decode Y block
                val dcTableY = huffDC[0] ?: continue
                val acTableY = huffAC[0] ?: continue
                val quantY = quantTables[0] ?: continue

                val block = IntArray(64)

                // DC
                val dcLen = decodeHuffman(dcTableY)
                val dcDiff = if (dcLen > 0) extend(readBits(dcLen), dcLen) else 0
                dcY += dcDiff
                block[0] = dcY * quantY[0]

                // AC
                var k = 1
                while (k < 64) {
                    val ac = decodeHuffman(acTableY)
                    if (ac == 0) break // EOB
                    val zeros = ac shr 4
                    val size = ac and 0xF
                    k += zeros
                    if (k < 64 && size > 0) {
                        val value = extend(readBits(size), size)
                        block[zigzag[k]] = value * quantY[zigzag[k]]
                    }
                    k++
                }

                // IDCT
                val idctBlock = idct(block)

                // Store in Y data
                val mcuIdx = mcuY * mcuCountX + mcuX
                for (py in 0 until 8) {
                    for (px in 0 until 8) {
                        yData[mcuIdx * 64 + py * 8 + px] = (idctBlock[py * 8 + px] + 128).coerceIn(0, 255)
                    }
                }

                // Only decode Cb/Cr for color images (3 components)
                if (!isGrayscale && components.size >= 3) {
                    val dcTableC = huffDC[1] ?: huffDC[0]!!
                    val acTableC = huffAC[1] ?: huffAC[0]!!
                    val quantC = quantTables[1] ?: quantTables[0]!!

                    val blockCb = IntArray(64)
                    val dcLenCb = decodeHuffman(dcTableC)
                    val dcDiffCb = if (dcLenCb > 0) extend(readBits(dcLenCb), dcLenCb) else 0
                    dcCb += dcDiffCb
                    blockCb[0] = dcCb * quantC[0]

                    k = 1
                    while (k < 64) {
                        val ac = decodeHuffman(acTableC)
                        if (ac == 0) break
                        val zeros = ac shr 4
                        val size = ac and 0xF
                        k += zeros
                        if (k < 64 && size > 0) {
                            val value = extend(readBits(size), size)
                            blockCb[zigzag[k]] = value * quantC[zigzag[k]]
                        }
                        k++
                    }

                    val idctCb = idct(blockCb)
                    for (py in 0 until 8) {
                        for (px in 0 until 8) {
                            cbData[mcuIdx * 64 + py * 8 + px] = idctCb[py * 8 + px]
                        }
                    }

                    // Decode Cr block
                    val blockCr = IntArray(64)
                    val dcLenCr = decodeHuffman(dcTableC)
                    val dcDiffCr = if (dcLenCr > 0) extend(readBits(dcLenCr), dcLenCr) else 0
                    dcCr += dcDiffCr
                    blockCr[0] = dcCr * quantC[0]

                    k = 1
                    while (k < 64) {
                        val ac = decodeHuffman(acTableC)
                        if (ac == 0) break
                        val zeros = ac shr 4
                        val size = ac and 0xF
                        k += zeros
                        if (k < 64 && size > 0) {
                            val value = extend(readBits(size), size)
                            blockCr[zigzag[k]] = value * quantC[zigzag[k]]
                        }
                        k++
                    }

                    val idctCr = idct(blockCr)
                    for (py in 0 until 8) {
                        for (px in 0 until 8) {
                            crData[mcuIdx * 64 + py * 8 + px] = idctCr[py * 8 + px]
                        }
                    }
                }
            }
        }

        // Convert to RGB pixels
        for (y in 0 until height) {
            for (x in 0 until width) {
                val mcuX = x / 8
                val mcuY = y / 8
                val px = x % 8
                val py = y % 8
                val mcuIdx = mcuY * mcuCountX + mcuX
                val blockIdx = mcuIdx * 64 + py * 8 + px

                val yVal = yData.getOrElse(blockIdx) { 128 }

                if (isGrayscale) {
                    // Grayscale: Y is the luminance value
                    pixels[y * width + x] = (0xFF shl 24) or (yVal shl 16) or (yVal shl 8) or yVal
                } else {
                    val cbVal = cbData.getOrElse(blockIdx) { 0 }
                    val crVal = crData.getOrElse(blockIdx) { 0 }

                    // YCbCr to RGB
                    val r = (yVal + 1.402 * crVal).toInt().coerceIn(0, 255)
                    val g = (yVal - 0.34414 * cbVal - 0.71414 * crVal).toInt().coerceIn(0, 255)
                    val b = (yVal + 1.772 * cbVal).toInt().coerceIn(0, 255)

                    pixels[y * width + x] = (0xFF shl 24) or (r shl 16) or (g shl 8) or b
                }
            }
        }

        return Bitmap.createFromPixels(width, height, pixels)
    }

    private fun idct(block: IntArray): IntArray {
        val result = IntArray(64)
        for (y in 0 until 8) {
            for (x in 0 until 8) {
                var sum = 0.0
                for (v in 0 until 8) {
                    for (u in 0 until 8) {
                        val cu = if (u == 0) 1.0 / kotlin.math.sqrt(2.0) else 1.0
                        val cv = if (v == 0) 1.0 / kotlin.math.sqrt(2.0) else 1.0
                        sum += cu * cv * block[v * 8 + u] *
                            kotlin.math.cos((2 * x + 1) * u * kotlin.math.PI / 16) *
                            kotlin.math.cos((2 * y + 1) * v * kotlin.math.PI / 16)
                    }
                }
                result[y * 8 + x] = (sum / 4.0).toInt()
            }
        }
        return result
    }
}

