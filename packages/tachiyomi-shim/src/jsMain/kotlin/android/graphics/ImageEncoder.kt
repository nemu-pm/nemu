package android.graphics

/**
 * PNG encoder for Kotlin/JS.
 * Produces uncompressed PNG (zlib stored blocks) - simple and fast.
 * Based on the Aidoku canvas.ts implementation.
 */
internal object PngEncoder {
    private val PNG_SIGNATURE = byteArrayOf(-119, 80, 78, 71, 13, 10, 26, 10)

    // CRC32 table for PNG chunks
    private val crcTable = IntArray(256).also { table ->
        for (i in 0 until 256) {
            var c = i
            repeat(8) {
                c = if ((c and 1) != 0) 0xedb88320.toInt() xor (c ushr 1) else c ushr 1
            }
            table[i] = c
        }
    }

    private fun crc32(data: ByteArray, start: Int = 0, length: Int = data.size): Int {
        var crc = -1
        for (i in start until start + length) {
            crc = crcTable[(crc xor (data[i].toInt() and 0xFF)) and 0xFF] xor (crc ushr 8)
        }
        return crc.inv()
    }

    private fun makeChunk(type: String, data: ByteArray): ByteArray {
        val typeBytes = type.encodeToByteArray()
        val chunk = ByteArray(4 + 4 + data.size + 4)

        // Length (big-endian)
        chunk[0] = (data.size ushr 24).toByte()
        chunk[1] = (data.size ushr 16).toByte()
        chunk[2] = (data.size ushr 8).toByte()
        chunk[3] = data.size.toByte()

        // Type
        typeBytes.copyInto(chunk, 4)

        // Data
        data.copyInto(chunk, 8)

        // CRC of type + data
        val crcData = ByteArray(4 + data.size)
        typeBytes.copyInto(crcData, 0)
        data.copyInto(crcData, 4)
        val crc = crc32(crcData)
        chunk[8 + data.size] = (crc ushr 24).toByte()
        chunk[8 + data.size + 1] = (crc ushr 16).toByte()
        chunk[8 + data.size + 2] = (crc ushr 8).toByte()
        chunk[8 + data.size + 3] = crc.toByte()

        return chunk
    }

    fun encode(bitmap: Bitmap): ByteArray {
        val width = bitmap.width
        val height = bitmap.height

        // IHDR chunk
        val ihdr = ByteArray(13)
        ihdr[0] = (width ushr 24).toByte()
        ihdr[1] = (width ushr 16).toByte()
        ihdr[2] = (width ushr 8).toByte()
        ihdr[3] = width.toByte()
        ihdr[4] = (height ushr 24).toByte()
        ihdr[5] = (height ushr 16).toByte()
        ihdr[6] = (height ushr 8).toByte()
        ihdr[7] = height.toByte()
        ihdr[8] = 8  // bit depth
        ihdr[9] = 6  // color type (RGBA)
        ihdr[10] = 0 // compression
        ihdr[11] = 0 // filter
        ihdr[12] = 0 // interlace
        val ihdrChunk = makeChunk("IHDR", ihdr)

        // Build raw PNG scanlines (filter byte + RGBA for each pixel)
        val rowSize = 1 + width * 4
        val rawData = ByteArray(height * rowSize)
        val pixels = bitmap.getPixelBuffer()

        for (y in 0 until height) {
            rawData[y * rowSize] = 0 // filter type: None
            for (x in 0 until width) {
                val pixel = pixels[y * width + x]
                // ARGB (Android) → RGBA (PNG)
                val r = (pixel ushr 16) and 0xFF
                val g = (pixel ushr 8) and 0xFF
                val b = pixel and 0xFF
                val a = (pixel ushr 24) and 0xFF

                val dstIdx = y * rowSize + 1 + x * 4
                rawData[dstIdx] = r.toByte()
                rawData[dstIdx + 1] = g.toByte()
                rawData[dstIdx + 2] = b.toByte()
                rawData[dstIdx + 3] = a.toByte()
            }
        }

        // DEFLATE: store blocks (no compression) - simple and works
        val deflateBlocks = mutableListOf<ByteArray>()
        val BLOCK_SIZE = 65535
        var i = 0
        while (i < rawData.size) {
            val isLast = i + BLOCK_SIZE >= rawData.size
            val blockLen = minOf(BLOCK_SIZE, rawData.size - i)
            val block = ByteArray(5 + blockLen)
            block[0] = if (isLast) 1 else 0 // BFINAL + BTYPE=00 (stored)
            block[1] = (blockLen and 0xFF).toByte()
            block[2] = ((blockLen ushr 8) and 0xFF).toByte()
            block[3] = (blockLen.inv() and 0xFF).toByte()
            block[4] = ((blockLen.inv() ushr 8) and 0xFF).toByte()
            rawData.copyInto(block, 5, i, i + blockLen)
            deflateBlocks.add(block)
            i += BLOCK_SIZE
        }

        // Compute Adler-32
        var s1 = 1
        var s2 = 0
        for (byte in rawData) {
            s1 = (s1 + (byte.toInt() and 0xFF)) % 65521
            s2 = (s2 + s1) % 65521
        }
        val adler32 = (s2 shl 16) or s1

        // Build zlib stream: CMF + FLG + deflate blocks + Adler32
        val deflateLen = deflateBlocks.sumOf { it.size }
        val zlibData = ByteArray(2 + deflateLen + 4)
        zlibData[0] = 0x78.toByte() // CMF (deflate, 32K window)
        zlibData[1] = 0x01.toByte() // FLG (no dict, lowest compression check)
        var offset = 2
        for (block in deflateBlocks) {
            block.copyInto(zlibData, offset)
            offset += block.size
        }
        zlibData[offset] = (adler32 ushr 24).toByte()
        zlibData[offset + 1] = (adler32 ushr 16).toByte()
        zlibData[offset + 2] = (adler32 ushr 8).toByte()
        zlibData[offset + 3] = adler32.toByte()

        val idatChunk = makeChunk("IDAT", zlibData)

        // IEND chunk
        val iendChunk = makeChunk("IEND", ByteArray(0))

        // Combine all chunks
        val png = ByteArray(PNG_SIGNATURE.size + ihdrChunk.size + idatChunk.size + iendChunk.size)
        var pos = 0
        PNG_SIGNATURE.copyInto(png, pos); pos += PNG_SIGNATURE.size
        ihdrChunk.copyInto(png, pos); pos += ihdrChunk.size
        idatChunk.copyInto(png, pos); pos += idatChunk.size
        iendChunk.copyInto(png, pos)

        return png
    }
}

/**
 * Simple JPEG encoder for Kotlin/JS.
 * Produces baseline JPEG with configurable quality.
 * This is a minimal implementation for image descrambling output.
 */
internal object JpegEncoder {
    // Standard luminance quantization table
    private val stdLuminanceQuant = intArrayOf(
        16, 11, 10, 16, 24, 40, 51, 61,
        12, 12, 14, 19, 26, 58, 60, 55,
        14, 13, 16, 24, 40, 57, 69, 56,
        14, 17, 22, 29, 51, 87, 80, 62,
        18, 22, 37, 56, 68, 109, 103, 77,
        24, 35, 55, 64, 81, 104, 113, 92,
        49, 64, 78, 87, 103, 121, 120, 101,
        72, 92, 95, 98, 112, 100, 103, 99
    )

    // Standard chrominance quantization table
    private val stdChrominanceQuant = intArrayOf(
        17, 18, 24, 47, 99, 99, 99, 99,
        18, 21, 26, 66, 99, 99, 99, 99,
        24, 26, 56, 99, 99, 99, 99, 99,
        47, 66, 99, 99, 99, 99, 99, 99,
        99, 99, 99, 99, 99, 99, 99, 99,
        99, 99, 99, 99, 99, 99, 99, 99,
        99, 99, 99, 99, 99, 99, 99, 99,
        99, 99, 99, 99, 99, 99, 99, 99
    )

    // Zigzag order
    private val zigzag = intArrayOf(
        0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5,
        12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28,
        35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51,
        58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63
    )

    // DC Huffman tables
    private val dcLuminanceBits = intArrayOf(0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0)
    private val dcLuminanceVal = intArrayOf(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11)
    private val dcChrominanceBits = intArrayOf(0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0)
    private val dcChrominanceVal = intArrayOf(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11)

    // AC Huffman tables
    private val acLuminanceBits = intArrayOf(0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 125)
    private val acLuminanceVal = intArrayOf(
        0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07,
        0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08, 0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0,
        0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28,
        0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49,
        0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69,
        0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
        0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7,
        0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5,
        0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2,
        0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8,
        0xf9, 0xfa
    )
    private val acChrominanceBits = intArrayOf(0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 119)
    private val acChrominanceVal = intArrayOf(
        0x00, 0x01, 0x02, 0x03, 0x11, 0x04, 0x05, 0x21, 0x31, 0x06, 0x12, 0x41, 0x51, 0x07, 0x61, 0x71,
        0x13, 0x22, 0x32, 0x81, 0x08, 0x14, 0x42, 0x91, 0xa1, 0xb1, 0xc1, 0x09, 0x23, 0x33, 0x52, 0xf0,
        0x15, 0x62, 0x72, 0xd1, 0x0a, 0x16, 0x24, 0x34, 0xe1, 0x25, 0xf1, 0x17, 0x18, 0x19, 0x1a, 0x26,
        0x27, 0x28, 0x29, 0x2a, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48,
        0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68,
        0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87,
        0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5,
        0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3,
        0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda,
        0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8,
        0xf9, 0xfa
    )

    fun encode(bitmap: Bitmap, quality: Int): ByteArray {
        val width = bitmap.width
        val height = bitmap.height
        val pixels = bitmap.getPixelBuffer()

        // Scale quantization tables based on quality
        val q = quality.coerceIn(1, 100)
        val scale = if (q < 50) 5000 / q else 200 - q * 2
        val lumQuant = IntArray(64) { i -> ((stdLuminanceQuant[i] * scale + 50) / 100).coerceIn(1, 255) }
        val chrQuant = IntArray(64) { i -> ((stdChrominanceQuant[i] * scale + 50) / 100).coerceIn(1, 255) }

        // Build Huffman tables
        val dcLumHuff = buildHuffmanTable(dcLuminanceBits, dcLuminanceVal)
        val dcChrHuff = buildHuffmanTable(dcChrominanceBits, dcChrominanceVal)
        val acLumHuff = buildHuffmanTable(acLuminanceBits, acLuminanceVal)
        val acChrHuff = buildHuffmanTable(acChrominanceBits, acChrominanceVal)

        val output = mutableListOf<Byte>()
        var bitBuffer = 0
        var bitCount = 0

        fun writeBits(value: Int, count: Int) {
            bitBuffer = (bitBuffer shl count) or value
            bitCount += count
            while (bitCount >= 8) {
                bitCount -= 8
                val byte = (bitBuffer shr bitCount) and 0xFF
                output.add(byte.toByte())
                if (byte == 0xFF) output.add(0x00) // Stuff byte
            }
        }

        fun flushBits() {
            if (bitCount > 0) {
                writeBits(0x7F, 7) // Pad with 1s
                bitCount = 0
            }
        }

        // Write JPEG headers
        fun writeHeaders() {
            // SOI
            output.add(0xFF.toByte()); output.add(0xD8.toByte())

            // APP0 (JFIF)
            output.add(0xFF.toByte()); output.add(0xE0.toByte())
            val app0 = byteArrayOf(0, 16, 'J'.code.toByte(), 'F'.code.toByte(), 'I'.code.toByte(), 'F'.code.toByte(), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0)
            output.addAll(app0.toList())

            // DQT (luminance)
            output.add(0xFF.toByte()); output.add(0xDB.toByte())
            output.add(0.toByte()); output.add(67.toByte()) // Length
            output.add(0.toByte()) // Table 0
            for (i in 0 until 64) output.add(lumQuant[zigzag[i]].toByte())

            // DQT (chrominance)
            output.add(0xFF.toByte()); output.add(0xDB.toByte())
            output.add(0.toByte()); output.add(67.toByte())
            output.add(1.toByte()) // Table 1
            for (i in 0 until 64) output.add(chrQuant[zigzag[i]].toByte())

            // SOF0 (baseline)
            output.add(0xFF.toByte()); output.add(0xC0.toByte())
            output.add(0.toByte()); output.add(17.toByte()) // Length
            output.add(8.toByte()) // Precision
            output.add((height shr 8).toByte()); output.add((height and 0xFF).toByte())
            output.add((width shr 8).toByte()); output.add((width and 0xFF).toByte())
            output.add(3.toByte()) // Components
            output.add(1.toByte()); output.add(0x11.toByte()); output.add(0.toByte()) // Y
            output.add(2.toByte()); output.add(0x11.toByte()); output.add(1.toByte()) // Cb
            output.add(3.toByte()); output.add(0x11.toByte()); output.add(1.toByte()) // Cr

            // DHT (DC luminance)
            output.add(0xFF.toByte()); output.add(0xC4.toByte())
            output.add(0.toByte()); output.add((3 + dcLuminanceBits.sum() + 16).toByte())
            output.add(0.toByte())
            for (b in dcLuminanceBits) output.add(b.toByte())
            for (v in dcLuminanceVal) output.add(v.toByte())

            // DHT (DC chrominance)
            output.add(0xFF.toByte()); output.add(0xC4.toByte())
            output.add(0.toByte()); output.add((3 + dcChrominanceBits.sum() + 16).toByte())
            output.add(1.toByte())
            for (b in dcChrominanceBits) output.add(b.toByte())
            for (v in dcChrominanceVal) output.add(v.toByte())

            // DHT (AC luminance)
            output.add(0xFF.toByte()); output.add(0xC4.toByte())
            output.add(0.toByte()); output.add((3 + acLuminanceBits.sum() + 16).toByte())
            output.add(0x10.toByte())
            for (b in acLuminanceBits) output.add(b.toByte())
            for (v in acLuminanceVal) output.add(v.toByte())

            // DHT (AC chrominance)
            output.add(0xFF.toByte()); output.add(0xC4.toByte())
            output.add(0.toByte()); output.add((3 + acChrominanceBits.sum() + 16).toByte())
            output.add(0x11.toByte())
            for (b in acChrominanceBits) output.add(b.toByte())
            for (v in acChrominanceVal) output.add(v.toByte())

            // SOS
            output.add(0xFF.toByte()); output.add(0xDA.toByte())
            output.add(0.toByte()); output.add(12.toByte())
            output.add(3.toByte()) // Components
            output.add(1.toByte()); output.add(0x00.toByte()) // Y
            output.add(2.toByte()); output.add(0x11.toByte()) // Cb
            output.add(3.toByte()); output.add(0x11.toByte()) // Cr
            output.add(0.toByte()); output.add(63.toByte()); output.add(0.toByte())
        }

        writeHeaders()

        // Encode image data
        var lastDcY = 0
        var lastDcCb = 0
        var lastDcCr = 0

        val block = IntArray(64)

        fun encodeBlock(data: IntArray, quant: IntArray, dcTable: Array<IntArray>, acTable: Array<IntArray>, lastDc: Int): Int {
            // Forward DCT
            val dctBlock = DoubleArray(64)
            for (v in 0 until 8) {
                for (u in 0 until 8) {
                    var sum = 0.0
                    for (y in 0 until 8) {
                        for (x in 0 until 8) {
                            val cu = if (u == 0) 1.0 / kotlin.math.sqrt(2.0) else 1.0
                            val cv = if (v == 0) 1.0 / kotlin.math.sqrt(2.0) else 1.0
                            sum += cu * cv * data[y * 8 + x] *
                                kotlin.math.cos((2 * x + 1) * u * kotlin.math.PI / 16) *
                                kotlin.math.cos((2 * y + 1) * v * kotlin.math.PI / 16)
                        }
                    }
                    dctBlock[v * 8 + u] = sum / 4.0
                }
            }

            // Quantize
            val quantized = IntArray(64) { i ->
                (dctBlock[i] / quant[i]).toInt().coerceIn(-2047, 2047)
            }

            // DC coefficient
            val dc = quantized[0] - lastDc
            val dcSize = if (dc == 0) 0 else (32 - dc.absoluteValue.countLeadingZeroBits())
            writeBits(dcTable[dcSize][0], dcTable[dcSize][1])
            if (dcSize > 0) {
                val dcVal = if (dc < 0) dc - 1 else dc
                writeBits(dcVal and ((1 shl dcSize) - 1), dcSize)
            }

            // AC coefficients (zigzag order)
            var zeroCount = 0
            for (i in 1 until 64) {
                val ac = quantized[zigzag[i]]
                if (ac == 0) {
                    zeroCount++
                } else {
                    while (zeroCount >= 16) {
                        writeBits(acTable[0xF0][0], acTable[0xF0][1]) // ZRL
                        zeroCount -= 16
                    }
                    val acSize = 32 - ac.absoluteValue.countLeadingZeroBits()
                    val symbol = (zeroCount shl 4) or acSize
                    writeBits(acTable[symbol][0], acTable[symbol][1])
                    val acVal = if (ac < 0) ac - 1 else ac
                    writeBits(acVal and ((1 shl acSize) - 1), acSize)
                    zeroCount = 0
                }
            }
            if (zeroCount > 0) {
                writeBits(acTable[0][0], acTable[0][1]) // EOB
            }

            return quantized[0]
        }

        // Process 8x8 blocks
        for (by in 0 until (height + 7) / 8) {
            for (bx in 0 until (width + 7) / 8) {
                // Extract Y, Cb, Cr blocks
                val yBlock = IntArray(64)
                val cbBlock = IntArray(64)
                val crBlock = IntArray(64)

                for (dy in 0 until 8) {
                    for (dx in 0 until 8) {
                        val x = (bx * 8 + dx).coerceIn(0, width - 1)
                        val y = (by * 8 + dy).coerceIn(0, height - 1)
                        val pixel = pixels[y * width + x]

                        val r = (pixel ushr 16) and 0xFF
                        val g = (pixel ushr 8) and 0xFF
                        val b = pixel and 0xFF

                        // RGB to YCbCr
                        val yVal = (0.299 * r + 0.587 * g + 0.114 * b).toInt() - 128
                        val cbVal = (-0.1687 * r - 0.3313 * g + 0.5 * b).toInt()
                        val crVal = (0.5 * r - 0.4187 * g - 0.0813 * b).toInt()

                        yBlock[dy * 8 + dx] = yVal
                        cbBlock[dy * 8 + dx] = cbVal
                        crBlock[dy * 8 + dx] = crVal
                    }
                }

                lastDcY = encodeBlock(yBlock, lumQuant, dcLumHuff, acLumHuff, lastDcY)
                lastDcCb = encodeBlock(cbBlock, chrQuant, dcChrHuff, acChrHuff, lastDcCb)
                lastDcCr = encodeBlock(crBlock, chrQuant, dcChrHuff, acChrHuff, lastDcCr)
            }
        }

        flushBits()

        // EOI
        output.add(0xFF.toByte())
        output.add(0xD9.toByte())

        return output.toByteArray()
    }

    private fun buildHuffmanTable(bits: IntArray, values: IntArray): Array<IntArray> {
        val table = Array(256) { intArrayOf(0, 0) }
        var code = 0
        var valueIndex = 0

        for (length in 1..16) {
            for (i in 0 until bits[length - 1]) {
                if (valueIndex < values.size) {
                    table[values[valueIndex]] = intArrayOf(code, length)
                    valueIndex++
                }
                code++
            }
            code = code shl 1
        }
        return table
    }

    private val Int.absoluteValue: Int get() = if (this < 0) -this else this
}

