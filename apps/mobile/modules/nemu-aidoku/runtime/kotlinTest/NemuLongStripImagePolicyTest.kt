package pm.nemu.mobile.aidoku

import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import java.util.concurrent.TimeUnit
import java.util.zip.CRC32
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class NemuLongStripImagePolicyTest {
  private val outputPolicy = NemuImageDimensionPolicy(
    NemuImageMetadataPolicy.HARD_MAX_DIMENSION,
    NemuImageMetadataPolicy.HARD_MAX_PIXELS
  )

  @Test
  fun transcodeDeadlineCoversTheBoundedFullPixelEnvelope() {
    assertEquals(
      TimeUnit.SECONDS.toNanos(120),
      NemuLongStripImageTranscoder.MAX_TRANSCODE_DURATION_NANOS
    )
  }

  @Test
  fun plansObserved1114By38400StripWithoutRaisingPublishedLimits() {
    withTemporaryImage(png(1_114, 38_400)) { file ->
      val plan = NemuLongStripImagePolicy.inspectAndPlan(
        file,
        outputPolicy,
        NemuLongStripImagePolicy.MAX_ENCODED_BYTES
      )

      assertEquals(NemuStaticImageFormat.PNG, plan.container.format)
      assertEquals(NemuImageDimensions(1_114, 38_400), plan.container.displayedDimensions)
      assertEquals(NemuImageDimensions(475, 16_384), plan.outputDimensions)
      assertEquals(2, plan.decodeSampleSize)
      assertTrue(
        plan.outputDimensions.width * plan.outputDimensions.height <=
          NemuImageMetadataPolicy.HARD_MAX_PIXELS.toLong()
      )
    }
  }

  @Test
  fun exifOrientationIsPartOfDisplayedGeometryAndOutputPlanning() {
    withTemporaryImage(jpeg(38_400, 1_114, exifOrientation = 6)) { file ->
      val plan = NemuLongStripImagePolicy.inspectAndPlan(
        file,
        outputPolicy,
        NemuLongStripImagePolicy.MAX_ENCODED_BYTES
      )

      assertEquals(NemuImageDimensions(38_400, 1_114), plan.container.encodedDimensions)
      assertEquals(NemuImageDimensions(1_114, 38_400), plan.container.displayedDimensions)
      assertEquals(6, plan.container.exifOrientation)
      assertEquals(NemuImageDimensions(475, 16_384), plan.outputDimensions)
    }
  }

  @Test
  fun stripesAreBoundedContiguousAndIncludeTheLastSourceRow() {
    val ranges = NemuLongStripImagePolicy.stripeRanges(38_400, 1_114, 2)

    assertEquals(0, ranges.first().start)
    assertEquals(38_400, ranges.last().endExclusive)
    ranges.zipWithNext().forEach { (current, next) ->
      assertEquals(current.endExclusive, next.start)
    }
    ranges.forEach { range ->
      val sampledLong = ceilDivide(range.endExclusive - range.start, 2)
      val sampledShort = ceilDivide(1_114, 2)
      assertTrue(
        sampledLong.toLong() * sampledShort.toLong() <=
          NemuLongStripImagePolicy.MAX_DECODED_STRIPE_PIXELS.toLong()
      )
    }
  }

  @Test
  fun segmentsPreserveObservedSourceWidthWithBoundedContiguousTiles() {
    val container = NemuStaticImageContainer(
      NemuStaticImageFormat.PNG,
      NemuImageDimensions(1_114, 38_400),
      1
    )
    val segments = NemuLongStripImagePolicy.segmentPlans(container, outputPolicy)

    assertEquals(21, segments.size)
    assertEquals(0, segments.first().displayedStart)
    assertEquals(38_400, segments.sumOf { it.outputDimensions.height }.toInt())
    segments.zipWithNext().forEach { (current, next) ->
      assertEquals(
        current.displayedStart + current.outputDimensions.height.toInt(),
        next.displayedStart
      )
    }
    segments.forEach { segment ->
      assertEquals(1_114L, segment.outputDimensions.width)
      val pixels = segment.outputDimensions.width * segment.outputDimensions.height
      assertTrue(pixels <= NemuImageMetadataPolicy.HARD_MAX_PIXELS.toLong())
      assertTrue(
        pixels <=
          NemuLongStripImagePolicy.TARGET_SEGMENT_PIXELS.toLong() +
          segment.outputDimensions.width
      )
    }
  }

  @Test
  fun fullAggregateEnvelopeUsesExactlyThirtyTwoCompliantTiles() {
    val container = NemuStaticImageContainer(
      NemuStaticImageFormat.PNG,
      NemuImageDimensions(2_048, 32_768),
      1
    )

    val segments = NemuLongStripImagePolicy.segmentPlans(container, outputPolicy)

    assertEquals(NemuLongStripImagePolicy.MAX_SEGMENTS, segments.size)
    assertEquals(NemuLongStripImagePolicy.MAX_INPUT_PIXELS, segments.sumOf {
      it.outputDimensions.width * it.outputDimensions.height
    })
    segments.forEach { segment ->
      assertEquals(NemuImageDimensions(2_048, 1_024), segment.outputDimensions)
      assertTrue(
        segment.outputDimensions.width * segment.outputDimensions.height <=
          NemuLongStripImagePolicy.TARGET_SEGMENT_PIXELS.toLong()
      )
    }
  }

  @Test
  fun reversedExifSegmentsStayInDisplayedTopToBottomOrder() {
    val container = NemuStaticImageContainer(
      NemuStaticImageFormat.JPEG,
      NemuImageDimensions(38_400, 1_114),
      8
    )
    val segments = NemuLongStripImagePolicy.segmentPlans(container, outputPolicy)

    assertEquals(21, segments.size)
    assertEquals(0, segments.first().displayedStart)
    assertTrue(
      segments.first().sourceRange.start > segments.last().sourceRange.start
    )
    assertEquals(38_400, segments.sumOf { it.outputDimensions.height }.toInt())
  }

  @Test
  fun baselineJpegSegmentBoundariesStayMcuAligned() {
    withTemporaryImage(jpeg(1_114, 38_400)) { file ->
      val plan = NemuLongStripImagePolicy.inspectAndPlan(
        file,
        outputPolicy,
        NemuLongStripImagePolicy.MAX_ENCODED_BYTES
      )
      assertEquals(8, plan.container.encodedLongAxisAlignment)
      val segments = NemuLongStripImagePolicy.segmentPlans(plan.container, outputPolicy)
      segments.dropLast(1).forEach { segment ->
        assertEquals(0, segment.sourceRange.endExclusive % 8)
      }
      assertEquals(38_400, segments.last().sourceRange.endExclusive)
      segments.forEach { segment ->
        assertTrue(
          segment.outputDimensions.width * segment.outputDimensions.height <=
            NemuLongStripImagePolicy.TARGET_SEGMENT_PIXELS.toLong() +
            (NemuLongStripImagePolicy.MAX_JPEG_MCU_ALIGNMENT - 1L) *
            segment.outputDimensions.width
        )
      }
    }
  }

  @Test
  fun segmentPlanningRejectsHorizontalAndOverCountGeometry() {
    assertThrows(IOException::class.java) {
      NemuLongStripImagePolicy.segmentPlans(
        NemuStaticImageContainer(
          NemuStaticImageFormat.PNG,
          NemuImageDimensions(38_400, 1_114),
          1
        ),
        outputPolicy
      )
    }
    assertThrows(IOException::class.java) {
      NemuLongStripImagePolicy.segmentPlans(
        NemuStaticImageContainer(
          NemuStaticImageFormat.PNG,
          NemuImageDimensions(2_048, 65_535),
          1
        ),
        outputPolicy
      )
    }
  }

  @Test
  fun rejectsEveryInputOutsideTheStrictLongStripEnvelope() {
    listOf(
      png(65_536, 512),
      png(20_000, 2_049),
      png(40_000, 2_048),
      png(12_000, 2_048)
    ).forEach { bytes ->
      withTemporaryImage(bytes) { file ->
        assertThrows(IOException::class.java) {
          NemuLongStripImagePolicy.inspectAndPlan(
            file,
            outputPolicy,
            NemuLongStripImagePolicy.MAX_ENCODED_BYTES
          )
        }
      }
    }
  }

  @Test
  fun rejectsAnimatedMultiImageUnsupportedAndAmbiguousContainers() {
    val animatedPng = png(
      1_114,
      38_400,
      chunksBeforeData = listOf(pngChunk("acTL", be32(2) + be32(0)))
    )
    val mpo = jpeg(1_114, 38_400, app2 = "MPF\u0000".toByteArray())
    val secondFrame = jpeg(1_114, 38_400, duplicateFrame = true)
    val unsupportedGif = "GIF89a".toByteArray() + ByteArray(32)

    listOf(animatedPng, mpo, secondFrame, unsupportedGif).forEach { bytes ->
      withTemporaryImage(bytes) { file ->
        assertThrows(IOException::class.java) {
          NemuLongStripImagePolicy.inspectAndPlan(
            file,
            outputPolicy,
            NemuLongStripImagePolicy.MAX_ENCODED_BYTES
          )
        }
      }
    }
  }

  @Test
  fun rejectsInterlacedPngToBoundRepeatedRegionDecodeWork() {
    withTemporaryImage(png(1_114, 38_400, interlace = 1)) { file ->
      assertThrows(IOException::class.java) {
        NemuLongStripImagePolicy.inspectAndPlan(
          file,
          outputPolicy,
          NemuLongStripImagePolicy.MAX_ENCODED_BYTES
        )
      }
    }
  }

  @Test
  fun rejectsProgressiveJpegToBoundRepeatedRegionDecodeWork() {
    withTemporaryImage(jpeg(1_114, 38_400, frameMarker = 0xc2)) { file ->
      assertThrows(IOException::class.java) {
        NemuLongStripImagePolicy.inspectAndPlan(
          file,
          outputPolicy,
          NemuLongStripImagePolicy.MAX_ENCODED_BYTES
        )
      }
    }
  }

  @Test
  fun rejectsCorruptTruncatedTrailingAndDimensionBombContainers() {
    val corruptCrc = png(1_114, 38_400).also { bytes ->
      bytes[bytes.lastIndex - 4] = (bytes[bytes.lastIndex - 4].toInt() xor 0x01).toByte()
    }
    val valid = png(1_114, 38_400)
    val truncated = valid.copyOf(valid.size - 2)
    val missingEntireEndChunk = valid.copyOf(valid.size - 12)
    val trailing = valid + byteArrayOf(0x00)
    val pixelBomb = png(65_535, 2_048)

    listOf(
      corruptCrc,
      truncated,
      missingEntireEndChunk,
      trailing,
      pixelBomb
    ).forEach { bytes ->
      withTemporaryImage(bytes) { file ->
        assertThrows(IOException::class.java) {
          NemuLongStripImagePolicy.inspectAndPlan(
            file,
            outputPolicy,
            NemuLongStripImagePolicy.MAX_ENCODED_BYTES
          )
        }
      }
    }
  }

  @Test
  fun rejectsContainersWithPathologicalRecordCounts() {
    val tooManyPngChunks = png(
      1_114,
      38_400,
      chunksBeforeData = List(
        NemuStaticImageContainerInspector.MAX_PNG_CHUNKS
      ) { pngChunk("tEXt", ByteArray(0)) }
    )
    val jpegWithTooManyMarkers = ByteArrayOutputStream().apply {
      write(byteArrayOf(0xff.toByte(), 0xd8.toByte()))
      repeat(NemuStaticImageContainerInspector.MAX_JPEG_MARKERS) {
        write(jpegSegment(0xfe, ByteArray(0)))
      }
      write(jpeg(1_114, 38_400).copyOfRange(2, jpeg(1_114, 38_400).size))
    }.toByteArray()

    listOf(tooManyPngChunks, jpegWithTooManyMarkers).forEach { bytes ->
      withTemporaryImage(bytes) { file ->
        assertThrows(IOException::class.java) {
          NemuLongStripImagePolicy.inspectAndPlan(
            file,
            outputPolicy,
            NemuLongStripImagePolicy.MAX_ENCODED_BYTES
          )
        }
      }
    }
  }

  @Test
  fun rejectsMalformedOrInvalidExifOrientation() {
    listOf(
      jpeg(38_400, 1_114, exifOrientation = 9),
      jpeg(38_400, 1_114, exifOrientation = 6, duplicateExif = true),
      jpeg(38_400, 1_114, truncated = true)
    ).forEach { bytes ->
      withTemporaryImage(bytes) { file ->
        assertThrows(IOException::class.java) {
          NemuLongStripImagePolicy.inspectAndPlan(
            file,
            outputPolicy,
            NemuLongStripImagePolicy.MAX_ENCODED_BYTES
          )
        }
      }
    }
  }

  @Test
  fun rejectsPngExifBeforeAllocatingUnboundedMetadata() {
    val oversizedExif = png(
      1_114,
      38_400,
      chunksBeforeData = listOf(
        pngChunk(
          "eXIf",
          ByteArray(NemuStaticImageContainerInspector.MAX_PNG_EXIF_BYTES + 1)
        )
      )
    )

    withTemporaryImage(oversizedExif) { file ->
      assertThrows(IOException::class.java) {
        NemuLongStripImagePolicy.inspectAndPlan(
          file,
          outputPolicy,
          NemuLongStripImagePolicy.MAX_ENCODED_BYTES
        )
      }
    }
  }

  private fun png(
    width: Int,
    height: Int,
    chunksBeforeData: List<ByteArray> = emptyList(),
    interlace: Int = 0
  ): ByteArray {
    val header = be32(width) + be32(height) +
      byteArrayOf(8, 6, 0, 0, interlace.toByte())
    return byteArrayOf(
      0x89.toByte(), 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
    ) +
      pngChunk("IHDR", header) +
      chunksBeforeData.fold(ByteArray(0), ByteArray::plus) +
      pngChunk("IDAT", byteArrayOf(0x78, 0x01, 0x00)) +
      pngChunk("IEND", ByteArray(0))
  }

  private fun pngChunk(type: String, data: ByteArray): ByteArray {
    val typeBytes = type.toByteArray(Charsets.US_ASCII)
    val crc = CRC32().apply {
      update(typeBytes)
      update(data)
    }
    return be32(data.size) + typeBytes + data + be32(crc.value.toInt())
  }

  private fun jpeg(
    width: Int,
    height: Int,
    exifOrientation: Int? = null,
    duplicateExif: Boolean = false,
    app2: ByteArray? = null,
    duplicateFrame: Boolean = false,
    truncated: Boolean = false,
    frameMarker: Int = 0xc0
  ): ByteArray {
    val output = ByteArrayOutputStream()
    output.write(byteArrayOf(0xff.toByte(), 0xd8.toByte()))
    if (exifOrientation != null) {
      val exif = "Exif\u0000\u0000".toByteArray() + tiffOrientation(exifOrientation)
      output.write(jpegSegment(0xe1, exif))
      if (duplicateExif) output.write(jpegSegment(0xe1, exif))
    }
    app2?.let { output.write(jpegSegment(0xe2, it)) }
    val frame = byteArrayOf(
      8,
      (height ushr 8).toByte(), height.toByte(),
      (width ushr 8).toByte(), width.toByte(),
      1,
      1, 0x11, 0
    )
    output.write(jpegSegment(frameMarker, frame))
    if (duplicateFrame) output.write(jpegSegment(frameMarker, frame))
    output.write(jpegSegment(0xda, byteArrayOf(1, 1, 0, 0, 63, 0)))
    output.write(byteArrayOf(0x11, 0xff.toByte(), 0x00, 0x22))
    output.write(byteArrayOf(0xff.toByte(), 0xd9.toByte()))
    val bytes = output.toByteArray()
    return if (truncated) bytes.copyOf(bytes.size - 1) else bytes
  }

  private fun tiffOrientation(orientation: Int): ByteArray {
    return byteArrayOf(
      'I'.code.toByte(), 'I'.code.toByte(),
      42, 0,
      8, 0, 0, 0,
      1, 0,
      0x12, 0x01,
      3, 0,
      1, 0, 0, 0,
      orientation.toByte(), 0, 0, 0,
      0, 0, 0, 0
    )
  }

  private fun jpegSegment(marker: Int, data: ByteArray): ByteArray {
    val length = data.size + 2
    return byteArrayOf(
      0xff.toByte(), marker.toByte(),
      (length ushr 8).toByte(), length.toByte()
    ) + data
  }

  private fun be32(value: Int): ByteArray {
    return byteArrayOf(
      (value ushr 24).toByte(),
      (value ushr 16).toByte(),
      (value ushr 8).toByte(),
      value.toByte()
    )
  }

  private fun withTemporaryImage(bytes: ByteArray, action: (File) -> Unit) {
    val file = File.createTempFile("nemu-long-strip-policy-", ".img")
    try {
      file.writeBytes(bytes)
      action(file)
    } finally {
      file.delete()
    }
  }

  private fun ceilDivide(value: Int, divisor: Int): Int {
    return ((value.toLong() + divisor - 1L) / divisor).toInt()
  }
}
