package pm.nemu.mobile.aidoku

import java.io.EOFException
import java.io.File
import java.io.IOException
import java.io.RandomAccessFile
import java.util.zip.CRC32
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

internal enum class NemuStaticImageFormat {
  JPEG,
  PNG
}

internal data class NemuStaticImageContainer(
  val format: NemuStaticImageFormat,
  val encodedDimensions: NemuImageDimensions,
  val exifOrientation: Int,
  val encodedLongAxisAlignment: Int = 1
) {
  val displayedDimensions: NemuImageDimensions
    get() = if (exifOrientation in 5..8) {
      NemuImageDimensions(encodedDimensions.height, encodedDimensions.width)
    } else {
      encodedDimensions
    }
}

internal data class NemuLongStripRange(
  val start: Int,
  val endExclusive: Int
)

internal data class NemuLongStripTranscodePlan(
  val container: NemuStaticImageContainer,
  val outputDimensions: NemuImageDimensions,
  val decodeSampleSize: Int,
  val ranges: List<NemuLongStripRange>
)

internal data class NemuLongStripSegmentPlan(
  val sourceRange: NemuLongStripRange,
  val displayedStart: Int,
  val outputDimensions: NemuImageDimensions
)

/**
 * A deliberately small exception to the normal 16,384-side / 8 MiPixel image
 * boundary. The encoded source remains bounded and is never decoded as one
 * bitmap. Only a static, complete PNG or JPEG with comic-strip geometry can be
 * region decoded into an output that still satisfies the original policy.
 */
internal object NemuLongStripImagePolicy {
  internal const val MAX_ENCODED_BYTES = 32L * 1_024 * 1_024
  internal const val MAX_INPUT_LONG_SIDE = 65_535
  internal const val MAX_INPUT_SHORT_SIDE = 2_048
  internal const val MAX_INPUT_PIXELS = 64L * 1_024 * 1_024
  internal const val MIN_ASPECT_RATIO = 8
  internal const val MAX_DECODED_STRIPE_PIXELS = 2 * 1_024 * 1_024
  internal const val TARGET_SEGMENT_PIXELS = 2 * 1_024 * 1_024
  internal const val MAX_SEGMENTS = 32
  internal const val MAX_JPEG_MCU_ALIGNMENT = 32

  internal fun inspectAndPlan(
    file: File,
    outputPolicy: NemuImageDimensionPolicy,
    callerMaxEncodedBytes: Long
  ): NemuLongStripTranscodePlan {
    val encodedLimit = min(callerMaxEncodedBytes, MAX_ENCODED_BYTES)
    if (encodedLimit <= 0L || file.length() !in 1..encodedLimit) {
      throw IOException("Long-strip image exceeds the encoded byte safety limit.")
    }

    val container = NemuStaticImageContainerInspector.inspect(file, encodedLimit)
    val displayed = container.displayedDimensions
    val inputPixels = checkedPixels(displayed)
    val longSide = max(displayed.width, displayed.height)
    val shortSide = min(displayed.width, displayed.height)
    if (
      longSide > MAX_INPUT_LONG_SIDE.toLong() ||
      shortSide > MAX_INPUT_SHORT_SIDE.toLong() ||
      inputPixels > MAX_INPUT_PIXELS ||
      shortSide < 1L ||
      longSide < shortSide * MIN_ASPECT_RATIO.toLong()
    ) {
      throw IOException("Image is outside the bounded long-strip safety envelope.")
    }
    if (
      displayed.width <= outputPolicy.maxDimension.toLong() &&
      displayed.height <= outputPolicy.maxDimension.toLong() &&
      inputPixels <= outputPolicy.maxPixels.toLong()
    ) {
      throw IOException("Image does not require bounded long-strip transcoding.")
    }

    val outputDimensions = scaledOutputDimensions(displayed, outputPolicy)
    val scale = min(
      outputDimensions.width.toDouble() / displayed.width.toDouble(),
      outputDimensions.height.toDouble() / displayed.height.toDouble()
    )
    val sampleSize = powerOfTwoSampleSize(scale)
    val encodedLongSide = max(
      container.encodedDimensions.width,
      container.encodedDimensions.height
    ).toInt()
    val encodedShortSide = min(
      container.encodedDimensions.width,
      container.encodedDimensions.height
    ).toInt()
    val ranges = stripeRanges(encodedLongSide, encodedShortSide, sampleSize)
    return NemuLongStripTranscodePlan(
      container = container,
      outputDimensions = outputDimensions,
      decodeSampleSize = sampleSize,
      ranges = ranges
    )
  }

  internal fun stripeRanges(
    encodedLongSide: Int,
    encodedShortSide: Int,
    sampleSize: Int
  ): List<NemuLongStripRange> {
    if (encodedLongSide <= 0 || encodedShortSide <= 0 || sampleSize <= 0) {
      throw IOException("Invalid long-strip decode geometry.")
    }
    val sampledShortSide = ceilDivide(encodedShortSide, sampleSize)
    val maximumSampledLongSide =
      (MAX_DECODED_STRIPE_PIXELS / sampledShortSide).coerceAtLeast(1)
    val sourceStripeLength = maximumSampledLongSide.toLong()
      .times(sampleSize.toLong())
      .coerceAtMost(encodedLongSide.toLong())
      .toInt()
    val ranges = mutableListOf<NemuLongStripRange>()
    var start = 0
    while (start < encodedLongSide) {
      val end = min(encodedLongSide.toLong(), start.toLong() + sourceStripeLength)
        .toInt()
      if (end <= start) throw IOException("Long-strip decode did not make progress.")
      ranges += NemuLongStripRange(start, end)
      start = end
    }
    return ranges
  }

  /**
   * Partitions a portrait strip into source-width, EXIF-normalized output
   * tiles. The target is deliberately below the existing per-image hard cap;
   * integer row balancing may exceed the target by less than one source row,
   * but can never exceed the unchanged output policy.
   */
  internal fun segmentPlans(
    container: NemuStaticImageContainer,
    outputPolicy: NemuImageDimensionPolicy
  ): List<NemuLongStripSegmentPlan> {
    val displayed = container.displayedDimensions
    if (displayed.height <= displayed.width) {
      throw IOException("Only portrait long strips can use segmented output.")
    }
    val pixels = checkedPixels(displayed)
    if (pixels > MAX_INPUT_PIXELS) {
      throw IOException("Segmented image exceeds the aggregate pixel safety limit.")
    }
    val alignment = container.encodedLongAxisAlignment
    if (alignment <= 0 || alignment > MAX_JPEG_MCU_ALIGNMENT) {
      throw IOException("Invalid segmented image source alignment.")
    }
    val maximumRowsByPixels = TARGET_SEGMENT_PIXELS.toLong() / displayed.width
    val maximumRows = min(
      maximumRowsByPixels,
      outputPolicy.maxDimension.toLong()
    )
    val alignedMaximumRows = maximumRows.div(alignment.toLong())
      .times(alignment.toLong())
    if (alignedMaximumRows <= 0L) {
      throw IOException("Segmented image cannot satisfy its tile target.")
    }
    val segmentCount = max(
      1L,
      ceilDivide(displayed.height, alignedMaximumRows)
    )
    if (segmentCount > MAX_SEGMENTS.toLong()) {
      throw IOException("Segmented image exceeds the tile count safety limit.")
    }

    val encodedLongSide = max(
      container.encodedDimensions.width,
      container.encodedDimensions.height
    ).toInt()
    val reverseLongAxis = container.exifOrientation in setOf(3, 4, 7, 8)
    val alignedBlocks = encodedLongSide / alignment
    val trailingRows = encodedLongSide % alignment
    val baseBlocks = alignedBlocks / segmentCount.toInt()
    val extraBlocks = alignedBlocks % segmentCount.toInt()
    var sourceStart = 0
    val plans = (0 until segmentCount.toInt()).map { index ->
      val blocks = baseBlocks + if (index < extraBlocks) 1 else 0
      val length = blocks * alignment +
        if (index == segmentCount.toInt() - 1) trailingRows else 0
      val start = sourceStart
      val end = start + length
      if (end <= start) throw IOException("Segmented image did not make progress.")
      sourceStart = end
      val height = end - start
      val dimensions = NemuImageDimensions(displayed.width, height.toLong())
      val tilePixels = checkedPixels(dimensions)
      if (
        dimensions.width > outputPolicy.maxDimension.toLong() ||
        dimensions.height > outputPolicy.maxDimension.toLong() ||
        tilePixels > outputPolicy.maxPixels.toLong()
      ) {
        throw IOException("Segmented image tile exceeds the requested image policy.")
      }
      NemuLongStripSegmentPlan(
        sourceRange = NemuLongStripRange(start, end),
        displayedStart = if (reverseLongAxis) encodedLongSide - end else start,
        outputDimensions = dimensions
      )
    }.sortedBy { it.displayedStart }

    if (sourceStart != encodedLongSide) {
      throw IOException("Segmented image source ranges are incomplete.")
    }

    var expectedStart = 0
    plans.forEach { plan ->
      if (plan.displayedStart != expectedStart) {
        throw IOException("Segmented image tiles are not contiguous.")
      }
      expectedStart += plan.outputDimensions.height.toInt()
    }
    if (expectedStart.toLong() != displayed.height) {
      throw IOException("Segmented image tiles do not cover the full source.")
    }
    return plans
  }

  private fun scaledOutputDimensions(
    displayed: NemuImageDimensions,
    policy: NemuImageDimensionPolicy
  ): NemuImageDimensions {
    val pixels = checkedPixels(displayed)
    val dimensionScale = min(
      policy.maxDimension.toDouble() / displayed.width.toDouble(),
      policy.maxDimension.toDouble() / displayed.height.toDouble()
    )
    val pixelScale = sqrt(policy.maxPixels.toDouble() / pixels.toDouble())
    val scale = min(1.0, min(dimensionScale, pixelScale))
    var width = floor(displayed.width.toDouble() * scale).toLong().coerceAtLeast(1L)
    var height = floor(displayed.height.toDouble() * scale).toLong().coerceAtLeast(1L)
    width = min(width, policy.maxDimension.toLong())
    height = min(height, policy.maxDimension.toLong())
    while (width * height > policy.maxPixels.toLong()) {
      if (width >= height && width > 1L) width -= 1L else height -= 1L
    }
    if (
      width <= 0L ||
      height <= 0L ||
      width > policy.maxDimension.toLong() ||
      height > policy.maxDimension.toLong() ||
      width * height > policy.maxPixels.toLong()
    ) {
      throw IOException("Could not derive safe long-strip output dimensions.")
    }
    return NemuImageDimensions(width, height)
  }

  private fun powerOfTwoSampleSize(scale: Double): Int {
    if (!scale.isFinite() || scale <= 0.0) {
      throw IOException("Invalid long-strip output scale.")
    }
    var sampleSize = 1
    while (sampleSize <= 16_384 && sampleSize.toDouble() * 2.0 <= 1.0 / scale) {
      sampleSize *= 2
    }
    return sampleSize
  }

  private fun checkedPixels(dimensions: NemuImageDimensions): Long {
    if (
      dimensions.width <= 0L ||
      dimensions.height <= 0L ||
      dimensions.width > Int.MAX_VALUE.toLong() ||
      dimensions.height > Int.MAX_VALUE.toLong() ||
      dimensions.width > Long.MAX_VALUE / dimensions.height
    ) {
      throw IOException("Invalid image dimensions.")
    }
    return dimensions.width * dimensions.height
  }

  private fun ceilDivide(value: Int, divisor: Int): Int {
    return ((value.toLong() + divisor.toLong() - 1L) / divisor.toLong()).toInt()
  }

  private fun ceilDivide(value: Long, divisor: Long): Long {
    if (value <= 0L || divisor <= 0L) throw IOException("Invalid bounded division.")
    return (value + divisor - 1L) / divisor
  }
}

internal object NemuStaticImageContainerInspector {
  private val PNG_SIGNATURE = byteArrayOf(
    0x89.toByte(), 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
  )
  private const val MAX_EXIF_ENTRIES = 1_024
  internal const val MAX_PNG_EXIF_BYTES = 256 * 1_024
  internal const val MAX_PNG_CHUNKS = 4_096
  internal const val MAX_JPEG_MARKERS = 4_096

  internal fun inspect(file: File, maximumBytes: Long): NemuStaticImageContainer {
    val length = file.length()
    if (length !in 1..maximumBytes) {
      throw IOException("Image container exceeds the inspection byte limit.")
    }
    RandomAccessFile(file, "r").use { input ->
      return when {
        input.matchesAt(0L, PNG_SIGNATURE) -> inspectPng(input, length)
        input.matchesAt(0L, byteArrayOf(0xff.toByte(), 0xd8.toByte())) ->
          inspectJpeg(input, length)
        else -> throw IOException(
          "Long-strip transcoding supports only static PNG and JPEG images."
        )
      }
    }
  }

  private fun inspectPng(
    input: RandomAccessFile,
    fileLength: Long
  ): NemuStaticImageContainer {
    input.seek(PNG_SIGNATURE.size.toLong())
    var dimensions: NemuImageDimensions? = null
    var orientation = 1
    var sawExif = false
    var sawPalette = false
    var sawImageData = false
    var endedImageData = false
    var sawEnd = false
    var colorType = -1
    var chunkIndex = 0
    while (input.filePointer < fileLength) {
      if (chunkIndex >= MAX_PNG_CHUNKS) {
        throw IOException("PNG exceeds the bounded chunk count.")
      }
      if (fileLength - input.filePointer < 12L) {
        throw IOException("Truncated PNG chunk stream.")
      }
      val dataLength = input.readUnsignedIntBigEndian()
      if (dataLength > Int.MAX_VALUE.toLong()) {
        throw IOException("PNG chunk exceeds the bounded parser limit.")
      }
      val typeBytes = input.readExact(4)
      if (!typeBytes.all { byte ->
          val value = byte.toInt() and 0xff
          value in 'A'.code..'Z'.code || value in 'a'.code..'z'.code
        }
      ) {
        throw IOException("Malformed PNG chunk type.")
      }
      val type = typeBytes.toString(Charsets.US_ASCII)
      if (type == "eXIf" && dataLength > MAX_PNG_EXIF_BYTES.toLong()) {
        throw IOException("PNG EXIF metadata exceeds the byte safety limit.")
      }
      if (dataLength > fileLength - input.filePointer - 4L) {
        throw IOException("Truncated PNG chunk data.")
      }
      val capturedData = input.readPngChunkDataAndVerifyCrc(
        typeBytes,
        dataLength.toInt(),
        capture = type == "IHDR" || type == "eXIf"
      )
      when (type) {
        "IHDR" -> {
          if (chunkIndex != 0 || dimensions != null || dataLength != 13L) {
            throw IOException("Malformed PNG image header ordering.")
          }
          val data = capturedData ?: throw IOException("Missing PNG image header.")
          val width = data.unsignedIntBigEndian(0)
          val height = data.unsignedIntBigEndian(4)
          val bitDepth = data[8].toInt() and 0xff
          colorType = data[9].toInt() and 0xff
          val validDepth = when (colorType) {
            0 -> bitDepth in setOf(1, 2, 4, 8, 16)
            2 -> bitDepth == 8 || bitDepth == 16
            3 -> bitDepth in setOf(1, 2, 4, 8)
            4, 6 -> bitDepth == 8 || bitDepth == 16
            else -> false
          }
          if (
            width <= 0L ||
            height <= 0L ||
            !validDepth ||
            (data[10].toInt() and 0xff) != 0 ||
            (data[11].toInt() and 0xff) != 0 ||
            // Progressive Adam7 decode can multiply work across every region.
            // Keep the segmented path predictably bounded by accepting only
            // the non-interlaced encoding physically observed in the reader.
            (data[12].toInt() and 0xff) != 0
          ) {
            throw IOException("Unsupported or malformed PNG image header.")
          }
          dimensions = NemuImageDimensions(width, height)
        }
        "PLTE" -> {
          if (dimensions == null || sawPalette || sawImageData || dataLength % 3L != 0L) {
            throw IOException("Malformed PNG palette ordering.")
          }
          if (dataLength !in 3L..768L || colorType == 0 || colorType == 4) {
            throw IOException("Malformed PNG palette.")
          }
          sawPalette = true
        }
        "IDAT" -> {
          if (
            dimensions == null ||
            sawEnd ||
            endedImageData ||
            dataLength <= 0L ||
            (colorType == 3 && !sawPalette)
          ) {
            throw IOException("Malformed PNG image data ordering.")
          }
          sawImageData = true
        }
        "IEND" -> {
          if (dimensions == null || !sawImageData || sawEnd || dataLength != 0L) {
            throw IOException("Malformed PNG end chunk.")
          }
          sawEnd = true
          if (input.filePointer != fileLength) {
            throw IOException("PNG image contains trailing container data.")
          }
        }
        "acTL", "fcTL", "fdAT" ->
          throw IOException("Animated PNG images are not supported safely.")
        "eXIf" -> {
          if (dimensions == null || sawExif || sawImageData || capturedData == null) {
            throw IOException("Malformed PNG EXIF metadata ordering.")
          }
          orientation = parseTiffOrientation(capturedData)
          sawExif = true
        }
        else -> {
          if ((typeBytes[0].toInt() and 0x20) == 0) {
            throw IOException("Unsupported critical PNG chunk.")
          }
        }
      }
      if (sawImageData && type != "IDAT" && type != "IEND") endedImageData = true
      chunkIndex += 1
      if (sawEnd) break
    }
    if (!sawEnd || !sawImageData) {
      throw IOException("PNG image is missing its complete end chunk.")
    }
    return NemuStaticImageContainer(
      format = NemuStaticImageFormat.PNG,
      encodedDimensions = dimensions
        ?: throw IOException("PNG dimensions were not found safely."),
      exifOrientation = orientation
    )
  }

  private fun inspectJpeg(
    input: RandomAccessFile,
    fileLength: Long
  ): NemuStaticImageContainer {
    input.seek(2L)
    var dimensions: NemuImageDimensions? = null
    var orientation = 1
    var sawExif = false
    var scanCount = 0
    var encodedLongAxisAlignment = 1
    var pendingMarker: Int? = null
    var sawEnd = false
    var markerCount = 0
    while (!sawEnd) {
      markerCount += 1
      if (markerCount > MAX_JPEG_MARKERS) {
        throw IOException("JPEG exceeds the bounded marker count.")
      }
      val marker = pendingMarker ?: input.readJpegMarker(fileLength)
      pendingMarker = null
      when (marker) {
        0xd9 -> {
          if (dimensions == null || scanCount <= 0) {
            throw IOException("JPEG ended before a complete image scan.")
          }
          sawEnd = true
        }
        0xda -> {
          if (dimensions == null) throw IOException("JPEG scan precedes its frame header.")
          if (scanCount >= 4) {
            throw IOException("JPEG exceeds the bounded scan count.")
          }
          input.skipJpegSegment(fileLength)
          scanCount += 1
          val entropyResult = input.readJpegEntropyMarker(fileLength)
          markerCount += entropyResult.restartMarkerCount
          if (markerCount > MAX_JPEG_MARKERS) {
            throw IOException("JPEG exceeds the bounded marker count.")
          }
          pendingMarker = entropyResult.marker
        }
        0xc0, 0xc1 -> {
          if (dimensions != null) throw IOException("JPEG contains multiple frame headers.")
          val segment = input.readJpegSegment(fileLength, capture = true)
          if (segment.size < 8 || (segment[0].toInt() and 0xff) !in 1..16) {
            throw IOException("Malformed JPEG frame header.")
          }
          val height = segment.unsignedShortBigEndian(1)
          val width = segment.unsignedShortBigEndian(3)
          val components = segment[5].toInt() and 0xff
          if (components !in 1..4 || segment.size != 6 + components * 3) {
            throw IOException("Malformed JPEG component table.")
          }
          val componentIds = mutableSetOf<Int>()
          var maximumLongAxisSampling = 1
          repeat(components) { index ->
            val offset = 6 + index * 3
            val componentId = segment[offset].toInt() and 0xff
            val sampling = segment[offset + 1].toInt() and 0xff
            val horizontalSampling = sampling ushr 4
            val verticalSampling = sampling and 0x0f
            if (
              !componentIds.add(componentId) ||
              horizontalSampling !in 1..4 ||
              verticalSampling !in 1..4
            ) {
              throw IOException("Malformed JPEG component sampling table.")
            }
            maximumLongAxisSampling = max(
              maximumLongAxisSampling,
              if (height >= width) verticalSampling else horizontalSampling
            )
          }
          encodedLongAxisAlignment = maximumLongAxisSampling * 8
          dimensions = NemuImageDimensions(width.toLong(), height.toLong())
        }
        0xe1 -> {
          val segment = input.readJpegSegment(fileLength, capture = true)
          if (segment.startsWithAscii("Exif\u0000\u0000")) {
            if (sawExif) throw IOException("JPEG contains ambiguous EXIF metadata.")
            orientation = parseTiffOrientation(segment.copyOfRange(6, segment.size))
            sawExif = true
          }
        }
        0xe2 -> {
          val segment = input.readJpegSegment(fileLength, capture = true)
          if (segment.startsWithAscii("MPF\u0000")) {
            throw IOException("Multi-picture JPEG images are not supported safely.")
          }
        }
        0xd8 -> throw IOException("JPEG contains multiple image streams.")
        0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf ->
          throw IOException("Unsupported JPEG frame encoding.")
        0x01, in 0xd0..0xd7 ->
          throw IOException("JPEG contains a misplaced stand-alone marker.")
        else -> input.skipJpegSegment(fileLength)
      }
    }
    if (input.filePointer != fileLength) {
      throw IOException("JPEG image contains trailing container data.")
    }
    return NemuStaticImageContainer(
      format = NemuStaticImageFormat.JPEG,
      encodedDimensions = dimensions
        ?: throw IOException("JPEG dimensions were not found safely."),
      exifOrientation = orientation,
      encodedLongAxisAlignment = encodedLongAxisAlignment
    )
  }

  private fun parseTiffOrientation(tiff: ByteArray): Int {
    if (tiff.size < 8) throw IOException("Malformed EXIF metadata.")
    val littleEndian = when {
      tiff[0] == 'I'.code.toByte() && tiff[1] == 'I'.code.toByte() -> true
      tiff[0] == 'M'.code.toByte() && tiff[1] == 'M'.code.toByte() -> false
      else -> throw IOException("Malformed EXIF byte order.")
    }
    if (tiff.unsignedShort(2, littleEndian) != 42) {
      throw IOException("Malformed EXIF TIFF header.")
    }
    val ifdOffset = tiff.unsignedInt(4, littleEndian)
    if (ifdOffset > Int.MAX_VALUE.toLong() || ifdOffset + 2L > tiff.size.toLong()) {
      throw IOException("EXIF directory is outside its bounded segment.")
    }
    val entryCount = tiff.unsignedShort(ifdOffset.toInt(), littleEndian)
    if (entryCount > MAX_EXIF_ENTRIES) {
      throw IOException("EXIF directory exceeds the entry safety limit.")
    }
    val entriesEnd = ifdOffset + 2L + entryCount.toLong() * 12L
    if (entriesEnd > tiff.size.toLong()) throw IOException("Truncated EXIF directory.")
    var orientation: Int? = null
    repeat(entryCount) { index ->
      val offset = ifdOffset.toInt() + 2 + index * 12
      if (tiff.unsignedShort(offset, littleEndian) == 0x0112) {
        if (
          orientation != null ||
          tiff.unsignedShort(offset + 2, littleEndian) != 3 ||
          tiff.unsignedInt(offset + 4, littleEndian) != 1L
        ) {
          throw IOException("Malformed or ambiguous EXIF orientation.")
        }
        orientation = tiff.unsignedShort(offset + 8, littleEndian)
      }
    }
    return (orientation ?: 1).also {
      if (it !in 1..8) throw IOException("Invalid EXIF orientation.")
    }
  }

  private fun RandomAccessFile.readPngChunkDataAndVerifyCrc(
    type: ByteArray,
    dataLength: Int,
    capture: Boolean
  ): ByteArray? {
    val crc = CRC32()
    crc.update(type)
    val captured = if (capture) ByteArray(dataLength) else null
    val buffer = ByteArray(min(16 * 1_024, max(1, dataLength)))
    var total = 0
    while (total < dataLength) {
      val count = min(buffer.size, dataLength - total)
      readFully(buffer, 0, count)
      crc.update(buffer, 0, count)
      captured?.let { System.arraycopy(buffer, 0, it, total, count) }
      total += count
    }
    val expected = readUnsignedIntBigEndian()
    if (crc.value != expected) throw IOException("PNG chunk CRC validation failed.")
    return captured
  }

  private fun RandomAccessFile.readJpegMarker(fileLength: Long): Int {
    if (filePointer >= fileLength || readUnsignedByte() != 0xff) {
      throw IOException("Malformed JPEG marker stream.")
    }
    var marker: Int
    do {
      if (filePointer >= fileLength) throw IOException("Truncated JPEG marker stream.")
      marker = readUnsignedByte()
    } while (marker == 0xff)
    if (marker == 0x00) throw IOException("Misplaced JPEG stuffed byte.")
    return marker
  }

  private data class JpegEntropyMarkerResult(
    val marker: Int,
    val restartMarkerCount: Int
  )

  private fun RandomAccessFile.readJpegEntropyMarker(
    fileLength: Long
  ): JpegEntropyMarkerResult {
    var restartMarkerCount = 0
    while (filePointer < fileLength) {
      if (readUnsignedByte() != 0xff) continue
      var marker: Int
      do {
        if (filePointer >= fileLength) throw IOException("Truncated JPEG entropy stream.")
        marker = readUnsignedByte()
      } while (marker == 0xff)
      when (marker) {
        0x00 -> continue
        in 0xd0..0xd7 -> {
          restartMarkerCount += 1
          if (restartMarkerCount > MAX_JPEG_MARKERS) {
            throw IOException("JPEG exceeds the bounded marker count.")
          }
        }
        else -> return JpegEntropyMarkerResult(marker, restartMarkerCount)
      }
    }
    throw IOException("JPEG image is missing its end marker.")
  }

  private fun RandomAccessFile.skipJpegSegment(fileLength: Long) {
    readJpegSegment(fileLength, capture = false)
  }

  private fun RandomAccessFile.readJpegSegment(
    fileLength: Long,
    capture: Boolean
  ): ByteArray {
    if (fileLength - filePointer < 2L) throw IOException("Truncated JPEG segment.")
    val segmentLength = readUnsignedShort()
    if (segmentLength < 2 || segmentLength.toLong() - 2L > fileLength - filePointer) {
      throw IOException("Malformed JPEG segment length.")
    }
    val dataLength = segmentLength - 2
    return if (capture) {
      readExact(dataLength)
    } else {
      seek(filePointer + dataLength.toLong())
      ByteArray(0)
    }
  }

  private fun RandomAccessFile.matchesAt(offset: Long, expected: ByteArray): Boolean {
    if (offset < 0L || length() - offset < expected.size.toLong()) return false
    val original = filePointer
    return try {
      seek(offset)
      expected.all { readByte() == it }
    } finally {
      seek(original)
    }
  }

  private fun RandomAccessFile.readExact(length: Int): ByteArray {
    if (length < 0) throw IOException("Invalid bounded read length.")
    return ByteArray(length).also {
      try {
        readFully(it)
      } catch (_: EOFException) {
        throw IOException("Truncated image container.")
      }
    }
  }

  private fun RandomAccessFile.readUnsignedIntBigEndian(): Long {
    return (readUnsignedByte().toLong() shl 24) or
      (readUnsignedByte().toLong() shl 16) or
      (readUnsignedByte().toLong() shl 8) or
      readUnsignedByte().toLong()
  }

  private fun ByteArray.unsignedIntBigEndian(offset: Int): Long {
    if (offset < 0 || offset + 4 > size) throw IOException("Truncated image metadata.")
    return ((this[offset].toInt() and 0xff).toLong() shl 24) or
      ((this[offset + 1].toInt() and 0xff).toLong() shl 16) or
      ((this[offset + 2].toInt() and 0xff).toLong() shl 8) or
      (this[offset + 3].toInt() and 0xff).toLong()
  }

  private fun ByteArray.unsignedShortBigEndian(offset: Int): Int {
    if (offset < 0 || offset + 2 > size) throw IOException("Truncated image metadata.")
    return ((this[offset].toInt() and 0xff) shl 8) or
      (this[offset + 1].toInt() and 0xff)
  }

  private fun ByteArray.unsignedShort(offset: Int, littleEndian: Boolean): Int {
    if (offset < 0 || offset + 2 > size) throw IOException("Truncated EXIF metadata.")
    val first = this[offset].toInt() and 0xff
    val second = this[offset + 1].toInt() and 0xff
    return if (littleEndian) first or (second shl 8) else (first shl 8) or second
  }

  private fun ByteArray.unsignedInt(offset: Int, littleEndian: Boolean): Long {
    if (offset < 0 || offset + 4 > size) throw IOException("Truncated EXIF metadata.")
    var value = 0L
    repeat(4) { index ->
      val sourceIndex = if (littleEndian) offset + 3 - index else offset + index
      value = (value shl 8) or (this[sourceIndex].toInt() and 0xff).toLong()
    }
    return value
  }

  private fun ByteArray.startsWithAscii(value: String): Boolean {
    if (size < value.length) return false
    return value.indices.all { index ->
      (this[index].toInt() and 0xff) == value[index].code
    }
  }
}
