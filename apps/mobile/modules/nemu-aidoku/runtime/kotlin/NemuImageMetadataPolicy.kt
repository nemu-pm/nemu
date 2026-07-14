package pm.nemu.mobile.aidoku

import java.io.File
import java.io.IOException

internal data class NemuImageDimensions(
  val width: Long,
  val height: Long
)

internal data class NemuImageDimensionPolicy(
  val maxDimension: Int,
  val maxPixels: Int
)

/**
 * Allocation boundary for untrusted image files.
 *
 * Compressed byte limits alone do not prevent a tiny image payload from
 * declaring a native decode surface large enough to exhaust the process. This
 * parser reads at most [MAX_HEADER_BYTES], never decodes pixels, and validates
 * every dimension-bearing header it recognizes before a downloaded file is
 * published to React Native.
 */
internal object NemuImageMetadataPolicy {
  internal const val HARD_MAX_DIMENSION = 16_384
  internal const val HARD_MAX_PIXELS = 8 * 1_024 * 1_024
  internal const val MAX_HEADER_BYTES = 1 * 1_024 * 1_024

  private val ISO_IMAGE_BRANDS = setOf(
    "avif",
    "avis",
    "heic",
    "heix",
    "hevc",
    "hevx",
    "mif1",
    "msf1"
  )

  internal fun requestedPolicy(
    maxDimension: Int?,
    maxPixels: Int?
  ): NemuImageDimensionPolicy? {
    if (maxDimension == null && maxPixels == null) return null
    if (maxDimension == null || maxPixels == null) {
      throw IOException("Native image dimension policy is incomplete.")
    }
    if (
      maxDimension !in 1..HARD_MAX_DIMENSION ||
      maxPixels !in 1..HARD_MAX_PIXELS
    ) {
      throw IOException("Invalid native image dimension safety limit.")
    }
    return NemuImageDimensionPolicy(maxDimension, maxPixels)
  }

  internal fun validateFile(
    file: File,
    policy: NemuImageDimensionPolicy
  ): NemuImageDimensions {
    val fileLength = file.length()
    if (fileLength <= 0L) throw IOException("Image file is empty.")
    val requestedBytes = minOf(fileLength, MAX_HEADER_BYTES.toLong()).toInt()
    val header = ByteArray(requestedBytes)
    var offset = 0
    file.inputStream().buffered().use { input ->
      while (offset < header.size) {
        val count = input.read(header, offset, header.size - offset)
        if (count < 0) break
        if (count == 0) continue
        offset += count
      }
    }
    if (offset <= 0) throw IOException("Image file is empty.")
    return validateHeader(
      if (offset == header.size) header else header.copyOf(offset),
      policy,
      completeFile = fileLength <= MAX_HEADER_BYTES.toLong()
    )
  }

  internal fun validateHeader(
    header: ByteArray,
    policy: NemuImageDimensionPolicy,
    completeFile: Boolean = true
  ): NemuImageDimensions {
    val dimensions = inspectHeader(header, completeFile)
    dimensions.forEach { dimension ->
      val pixelCount = dimension.width * dimension.height
      if (
        dimension.width <= 0L ||
        dimension.height <= 0L ||
        dimension.width > policy.maxDimension.toLong() ||
        dimension.height > policy.maxDimension.toLong() ||
        pixelCount <= 0L ||
        pixelCount > policy.maxPixels.toLong()
      ) {
        throw IOException(
          "Image dimensions exceed the ${policy.maxDimension}px / " +
            "${policy.maxPixels} pixel safety limit."
        )
      }
    }
    return dimensions.maxByOrNull { it.width * it.height }
      ?: throw IOException("Image dimensions could not be determined safely.")
  }

  /** Returns every dimension-bearing header so secondary ISO images fail too. */
  internal fun inspectHeader(
    header: ByteArray,
    completeFile: Boolean = true
  ): List<NemuImageDimensions> {
    return when {
      matches(header, 0, byteArrayOf(
        0x89.toByte(), 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
      )) -> inspectPng(header)
      matchesAscii(header, 0, "GIF87a") || matchesAscii(header, 0, "GIF89a") ->
        inspectGif(header, completeFile)
      header.size >= 2 && unsigned(header[0]) == 0xff && unsigned(header[1]) == 0xd8 ->
        inspectJpeg(header)
      matchesAscii(header, 0, "RIFF") && matchesAscii(header, 8, "WEBP") ->
        inspectWebP(header)
      matchesAscii(header, 4, "ftyp") -> inspectIsoBaseMedia(header)
      else -> throw IOException("Unsupported or malformed image header.")
    }
  }

  private fun inspectPng(header: ByteArray): List<NemuImageDimensions> {
    if (header.size < 24 || !matchesAscii(header, 12, "IHDR")) {
      throw IOException("Malformed PNG image header.")
    }
    return listOf(NemuImageDimensions(be32(header, 16), be32(header, 20)))
  }

  private fun inspectGif(
    header: ByteArray,
    completeFile: Boolean
  ): List<NemuImageDimensions> {
    if (!completeFile) {
      throw IOException("GIF image safety requires the complete bounded container.")
    }
    if (header.size < 13) throw IOException("Malformed GIF image header.")
    val canvas = NemuImageDimensions(le16(header, 6), le16(header, 8))
    var offset = 13
    val logicalScreenPacked = unsigned(header[10])
    if ((logicalScreenPacked and 0x80) != 0) {
      offset += 3 * (1 shl ((logicalScreenPacked and 0x07) + 1))
    }
    if (offset > header.size) throw IOException("Malformed GIF color table.")

    val dimensions = mutableListOf(canvas)
    var frameCount = 0
    while (offset < header.size) {
      when (unsigned(header[offset])) {
        0x3b -> {
          if (frameCount != 1) {
            throw IOException("Animated or empty GIF images are not supported safely.")
          }
          return dimensions
        }
        0x21 -> {
          if (offset + 2 > header.size) throw IOException("Malformed GIF extension.")
          offset = skipGifSubBlocks(header, offset + 2)
        }
        0x2c -> {
          if (offset + 10 > header.size) throw IOException("Malformed GIF frame header.")
          frameCount += 1
          if (frameCount > 1) {
            throw IOException("Animated GIF images are not supported safely.")
          }
          val left = le16(header, offset + 1)
          val top = le16(header, offset + 3)
          val frame = NemuImageDimensions(
            width = le16(header, offset + 5),
            height = le16(header, offset + 7)
          )
          if (
            left + frame.width > canvas.width ||
            top + frame.height > canvas.height
          ) {
            throw IOException("GIF frame exceeds its logical screen.")
          }
          dimensions += frame
          val framePacked = unsigned(header[offset + 9])
          offset += 10
          if ((framePacked and 0x80) != 0) {
            offset += 3 * (1 shl ((framePacked and 0x07) + 1))
          }
          if (offset >= header.size) throw IOException("Malformed GIF image data.")
          offset += 1 // LZW minimum code size.
          offset = skipGifSubBlocks(header, offset)
        }
        else -> throw IOException("Malformed GIF block stream.")
      }
    }
    throw IOException("GIF image is missing its trailer.")
  }

  private fun skipGifSubBlocks(bytes: ByteArray, start: Int): Int {
    var offset = start
    while (offset < bytes.size) {
      val length = unsigned(bytes[offset])
      offset += 1
      if (length == 0) return offset
      if (offset + length > bytes.size) throw IOException("Truncated GIF data block.")
      offset += length
    }
    throw IOException("Truncated GIF data block.")
  }

  private fun inspectJpeg(header: ByteArray): List<NemuImageDimensions> {
    var offset = 2
    while (offset < header.size) {
      while (offset < header.size && unsigned(header[offset]) != 0xff) offset += 1
      while (offset < header.size && unsigned(header[offset]) == 0xff) offset += 1
      if (offset >= header.size) break
      val marker = unsigned(header[offset])
      offset += 1
      if (marker == 0xd9 || marker == 0xda) break
      if (marker == 0x01 || marker in 0xd0..0xd8) continue
      if (offset + 2 > header.size) break
      val segmentLength = be16(header, offset).toInt()
      if (segmentLength < 2) throw IOException("Malformed JPEG image header.")
      if (offset + segmentLength > header.size) break
      if (isJpegStartOfFrame(marker)) {
        if (segmentLength < 7) throw IOException("Malformed JPEG frame header.")
        return listOf(
          NemuImageDimensions(
            width = be16(header, offset + 5),
            height = be16(header, offset + 3)
          )
        )
      }
      offset += segmentLength
    }
    throw IOException("JPEG dimensions were not found in the bounded header.")
  }

  private fun inspectWebP(header: ByteArray): List<NemuImageDimensions> {
    if (header.size < 20) throw IOException("Malformed WebP image header.")
    return when {
      matchesAscii(header, 12, "VP8X") -> {
        if (header.size < 30) throw IOException("Malformed extended WebP header.")
        if ((unsigned(header[20]) and 0x02) != 0 || containsWebPAnimationChunk(header)) {
          throw IOException("Animated WebP images are not supported safely.")
        }
        listOf(
          NemuImageDimensions(
            width = le24(header, 24) + 1L,
            height = le24(header, 27) + 1L
          )
        )
      }
      matchesAscii(header, 12, "VP8 ") -> {
        if (
          header.size < 30 ||
          unsigned(header[23]) != 0x9d ||
          unsigned(header[24]) != 0x01 ||
          unsigned(header[25]) != 0x2a
        ) {
          throw IOException("Malformed lossy WebP header.")
        }
        listOf(
          NemuImageDimensions(
            width = le16(header, 26) and 0x3fff,
            height = le16(header, 28) and 0x3fff
          )
        )
      }
      matchesAscii(header, 12, "VP8L") -> {
        if (header.size < 25 || unsigned(header[20]) != 0x2f) {
          throw IOException("Malformed lossless WebP header.")
        }
        val b1 = unsigned(header[21])
        val b2 = unsigned(header[22])
        val b3 = unsigned(header[23])
        val b4 = unsigned(header[24])
        listOf(
          NemuImageDimensions(
            width = 1L + b1 + ((b2 and 0x3f) shl 8),
            height = 1L + ((b2 and 0xc0) shr 6) + (b3 shl 2) + ((b4 and 0x0f) shl 10)
          )
        )
      }
      else -> throw IOException("Unsupported WebP image header.")
    }
  }

  private fun containsWebPAnimationChunk(bytes: ByteArray): Boolean {
    var offset = 12
    while (offset + 4 <= bytes.size) {
      if (
        matchesAscii(bytes, offset, "ANIM") ||
        matchesAscii(bytes, offset, "ANMF")
      ) return true
      offset += 1
    }
    return false
  }

  private fun inspectIsoBaseMedia(header: ByteArray): List<NemuImageDimensions> {
    if (header.size < 16) throw IOException("Malformed ISO image header.")
    val ftypSize = be32(header, 0)
    if (ftypSize < 16L || ftypSize > header.size.toLong()) {
      throw IOException("Malformed ISO image brand box.")
    }
    var recognizedBrand = ISO_IMAGE_BRANDS.contains(ascii(header, 8, 4))
    var brandOffset = 16
    while (!recognizedBrand && brandOffset + 4 <= ftypSize.toInt()) {
      recognizedBrand = ISO_IMAGE_BRANDS.contains(ascii(header, brandOffset, 4))
      brandOffset += 4
    }
    if (!recognizedBrand) throw IOException("Unsupported ISO image brand.")
    if (
      ascii(header, 8, 4) == "avis" ||
      ascii(header, 8, 4) == "msf1" ||
      (16 until ftypSize.toInt() step 4).any {
        val brand = ascii(header, it, 4)
        brand == "avis" || brand == "msf1"
      }
    ) {
      throw IOException("Animated ISO image sequences are not supported safely.")
    }

    val dimensions = mutableListOf<NemuImageDimensions>()
    var typeOffset = 4
    while (typeOffset + 16 <= header.size) {
      if (matchesAscii(header, typeOffset, "ispe")) {
        val boxStart = typeOffset - 4
        val boxSize = be32(header, boxStart)
        if (boxSize >= 20L && boxStart.toLong() + boxSize <= header.size.toLong()) {
          dimensions += NemuImageDimensions(
            width = be32(header, typeOffset + 8),
            height = be32(header, typeOffset + 12)
          )
        }
      }
      typeOffset += 1
    }
    if (dimensions.isEmpty()) {
      throw IOException("ISO image dimensions were not found in the bounded header.")
    }
    return dimensions
  }

  private fun isJpegStartOfFrame(marker: Int): Boolean {
    return marker in setOf(
      0xc0, 0xc1, 0xc2, 0xc3,
      0xc5, 0xc6, 0xc7,
      0xc9, 0xca, 0xcb,
      0xcd, 0xce, 0xcf
    )
  }

  private fun matches(bytes: ByteArray, offset: Int, expected: ByteArray): Boolean {
    if (offset < 0 || offset + expected.size > bytes.size) return false
    return expected.indices.all { bytes[offset + it] == expected[it] }
  }

  private fun matchesAscii(bytes: ByteArray, offset: Int, expected: String): Boolean {
    if (offset < 0 || offset + expected.length > bytes.size) return false
    return expected.indices.all {
      unsigned(bytes[offset + it]) == expected[it].code
    }
  }

  private fun ascii(bytes: ByteArray, offset: Int, length: Int): String {
    if (offset < 0 || offset + length > bytes.size) return ""
    return buildString(length) {
      repeat(length) { append(unsigned(bytes[offset + it]).toChar()) }
    }
  }

  private fun unsigned(value: Byte): Int = value.toInt() and 0xff

  private fun be16(bytes: ByteArray, offset: Int): Long {
    if (offset < 0 || offset + 2 > bytes.size) throw IOException("Truncated image header.")
    return ((unsigned(bytes[offset]) shl 8) or unsigned(bytes[offset + 1])).toLong()
  }

  private fun be32(bytes: ByteArray, offset: Int): Long {
    if (offset < 0 || offset + 4 > bytes.size) throw IOException("Truncated image header.")
    return (unsigned(bytes[offset]).toLong() shl 24) or
      (unsigned(bytes[offset + 1]).toLong() shl 16) or
      (unsigned(bytes[offset + 2]).toLong() shl 8) or
      unsigned(bytes[offset + 3]).toLong()
  }

  private fun le16(bytes: ByteArray, offset: Int): Long {
    if (offset < 0 || offset + 2 > bytes.size) throw IOException("Truncated image header.")
    return (unsigned(bytes[offset]) or (unsigned(bytes[offset + 1]) shl 8)).toLong()
  }

  private fun le24(bytes: ByteArray, offset: Int): Long {
    if (offset < 0 || offset + 3 > bytes.size) throw IOException("Truncated image header.")
    return unsigned(bytes[offset]).toLong() or
      (unsigned(bytes[offset + 1]).toLong() shl 8) or
      (unsigned(bytes[offset + 2]).toLong() shl 16)
  }
}
