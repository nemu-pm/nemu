package pm.nemu.mobile.aidoku

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.BitmapRegionDecoder
import android.graphics.Color
import android.graphics.Rect
import android.os.Debug
import android.os.SystemClock
import java.io.ByteArrayOutputStream
import java.io.DataOutputStream
import java.io.File
import java.io.FileOutputStream
import java.io.InterruptedIOException
import java.io.IOException
import java.util.zip.CRC32
import java.util.zip.Deflater
import java.util.zip.DeflaterOutputStream
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class NemuLongStripImageTranscoderInstrumentedTest {
  private val outputPolicy = NemuImageDimensionPolicy(
    NemuImageMetadataPolicy.HARD_MAX_DIMENSION,
    NemuImageMetadataPolicy.HARD_MAX_PIXELS
  )

  @Test
  fun real1114By38400PngBecomesACompliantSeamFreeStaticImage() {
    val source = File.createTempFile("nemu-real-long-strip-", ".png")
    var published: File? = null
    try {
      writeStripedPng(source, width = 1_114, height = 38_400)
      assertTrue(source.length() in 1..NemuLongStripImagePolicy.MAX_ENCODED_BYTES)
      assertThrows(NemuImageDimensionLimitException::class.java) {
        NemuImageMetadataPolicy.validateFile(source, outputPolicy)
      }
      val plan = NemuLongStripImagePolicy.inspectAndPlan(
        source,
        outputPolicy,
        NemuLongStripImagePolicy.MAX_ENCODED_BYTES
      )
      assertEquals(NemuImageDimensions(475, 16_384), plan.outputDimensions)

      val stageNamesBefore = stageNames(source.parentFile!!)
      assertThrows(InterruptedIOException::class.java) {
        NemuLongStripImageTranscoder.transcode(
          source,
          plan,
          outputPolicy,
          NemuLongStripImagePolicy.MAX_ENCODED_BYTES,
          isCancelled = { true }
        )
      }
      assertEquals(stageNamesBefore, stageNames(source.parentFile!!))
      assertTrue(source.exists())

      val result = NemuLongStripImageTranscoder.transcode(
        source,
        plan,
        outputPolicy,
        NemuLongStripImagePolicy.MAX_ENCODED_BYTES
      )
      published = result.file
      assertTrue(source.exists())
      assertTrue(result.file.exists())
      assertTrue(result.file.name.startsWith("nemu-http-output-"))
      assertTrue(result.file.name.endsWith(".part"))
      assertEquals("image/png", result.mimeType)
      assertEquals(result.file.length(), result.byteLength)
      assertTrue(result.byteLength in 1..NemuLongStripImagePolicy.MAX_ENCODED_BYTES)
      assertEquals(
        NemuImageDimensions(475, 16_384),
        NemuImageMetadataPolicy.validateFile(result.file, outputPolicy)
      )
      assertEquals(
        NemuStaticImageContainer(
          NemuStaticImageFormat.PNG,
          NemuImageDimensions(475, 16_384),
          1
        ),
        NemuStaticImageContainerInspector.inspect(
          result.file,
          NemuLongStripImagePolicy.MAX_ENCODED_BYTES
        )
      )

      assertNoTransparentSeamsOrMissingLastStripe(result.file, plan)
      assertEquals(stageNamesBefore, stageNames(source.parentFile!!))
    } finally {
      source.delete()
      published?.delete()
    }
  }

  @Test
  fun cancellationAfterAtomicMoveRemovesEveryTranscodeArtifact() {
    val source = File.createTempFile("nemu-cancelled-long-strip-", ".png")
    try {
      writeStripedPng(source, width = 64, height = 17_000)
      val plan = NemuLongStripImagePolicy.inspectAndPlan(
        source,
        outputPolicy,
        NemuLongStripImagePolicy.MAX_ENCODED_BYTES
      )
      val namesBefore = transcodeArtifactNames(source.parentFile!!)
      var cancellationChecks = 0

      assertThrows(InterruptedIOException::class.java) {
        NemuLongStripImageTranscoder.transcode(
          source,
          plan,
          outputPolicy,
          NemuLongStripImagePolicy.MAX_ENCODED_BYTES,
          isCancelled = {
            cancellationChecks += 1
            cancellationChecks >= 5
          }
        )
      }

      assertTrue(source.exists())
      assertEquals(namesBefore, transcodeArtifactNames(source.parentFile!!))
    } finally {
      source.delete()
    }
  }

  @Test
  fun exifOrientationsTwoThroughEightAreRasterizedPixelForPixel() {
    val expectedCorners = mapOf(
      2 to intArrayOf(Color.GREEN, Color.RED, Color.YELLOW, Color.BLUE),
      3 to intArrayOf(Color.YELLOW, Color.BLUE, Color.GREEN, Color.RED),
      4 to intArrayOf(Color.BLUE, Color.YELLOW, Color.RED, Color.GREEN),
      5 to intArrayOf(Color.RED, Color.BLUE, Color.GREEN, Color.YELLOW),
      6 to intArrayOf(Color.BLUE, Color.RED, Color.YELLOW, Color.GREEN),
      7 to intArrayOf(Color.YELLOW, Color.GREEN, Color.BLUE, Color.RED),
      8 to intArrayOf(Color.GREEN, Color.YELLOW, Color.RED, Color.BLUE)
    )

    expectedCorners.forEach { (orientation, corners) ->
      val source = File.createTempFile("nemu-oriented-long-strip-", ".png")
      var published: File? = null
      try {
        writeCornerPng(source, width = 17_000, height = 64, exifOrientation = orientation)
        val plan = NemuLongStripImagePolicy.inspectAndPlan(
          source,
          outputPolicy,
          NemuLongStripImagePolicy.MAX_ENCODED_BYTES
        )
        val expectedDimensions = if (orientation in 5..8) {
          NemuImageDimensions(61, 16_384)
        } else {
          NemuImageDimensions(16_384, 61)
        }
        assertEquals(expectedDimensions, plan.outputDimensions)

        val result = NemuLongStripImageTranscoder.transcode(
          source,
          plan,
          outputPolicy,
          NemuLongStripImagePolicy.MAX_ENCODED_BYTES
        )
        published = result.file
        assertTrue(result.file.name.startsWith("nemu-http-output-"))
        assertTrue(result.file.name.endsWith(".part"))
        assertEquals("image/png", result.mimeType)
        assertEquals(
          NemuStaticImageContainer(
            NemuStaticImageFormat.PNG,
            expectedDimensions,
            1
          ),
          NemuStaticImageContainerInspector.inspect(
            result.file,
            NemuLongStripImagePolicy.MAX_ENCODED_BYTES
          )
        )
        assertCornerColors(result.file, corners)
      } finally {
        source.delete()
        published?.delete()
      }
    }
  }

  @Test
  fun real1114By38400PngBecomesTwentyOneSourceWidthSegments() {
    val source = File.createTempFile("nemu-real-segmented-strip-", ".png")
    var result: NemuLongStripSegmentTranscodeResult? = null
    try {
      writeStripedPng(source, width = 1_114, height = 38_400)
      val plan = NemuLongStripImagePolicy.inspectAndPlan(
        source,
        outputPolicy,
        NemuLongStripImagePolicy.MAX_ENCODED_BYTES
      )
      val transcoded = benchmarkTranscode("png-1114x38400-segmented") {
        NemuLongStripImageTranscoder.transcodeSegments(
          source,
          plan,
          outputPolicy,
          NemuLongStripImagePolicy.MAX_ENCODED_BYTES
        )
      }
      result = transcoded

      assertEquals(NemuImageDimensions(1_114, 38_400), transcoded.dimensions)
      assertEquals(21, transcoded.segments.size)
      assertEquals(transcoded.byteLength, transcoded.segments.sumOf { it.byteLength })
      assertEquals(38_400L, transcoded.segments.sumOf { it.dimensions.height })
      transcoded.segments.forEach { segment ->
        assertEquals(1_114L, segment.dimensions.width)
        assertEquals("image/png", segment.mimeType)
        assertEquals(segment.byteLength, segment.file.length())
        assertEquals(
          segment.dimensions,
          NemuImageMetadataPolicy.validateFile(segment.file, outputPolicy)
        )
      }
      assertOpaqueSegmentEdges(transcoded)
      assertGlobalSegmentPixel(transcoded, 1_114 / 2, 38_399, Color.GREEN)
    } finally {
      source.delete()
      result?.segments?.forEach { it.file.delete() }
    }
  }

  @Test
  fun segmentedExifOrientationsThreeThroughEightAreDisplayOrderedPixelForPixel() {
    val expectedCorners = mapOf(
      3 to intArrayOf(Color.YELLOW, Color.BLUE, Color.GREEN, Color.RED),
      4 to intArrayOf(Color.BLUE, Color.YELLOW, Color.RED, Color.GREEN),
      5 to intArrayOf(Color.RED, Color.BLUE, Color.GREEN, Color.YELLOW),
      6 to intArrayOf(Color.BLUE, Color.RED, Color.YELLOW, Color.GREEN),
      7 to intArrayOf(Color.YELLOW, Color.GREEN, Color.BLUE, Color.RED),
      8 to intArrayOf(Color.GREEN, Color.YELLOW, Color.RED, Color.BLUE)
    )
    expectedCorners.forEach { (orientation, corners) ->
      val source = File.createTempFile("nemu-oriented-segments-", ".png")
      var result: NemuLongStripSegmentTranscodeResult? = null
      try {
        val encodedWidth = if (orientation in 3..4) 64 else 17_000
        val encodedHeight = if (orientation in 3..4) 17_000 else 64
        writeCornerPng(source, encodedWidth, encodedHeight, orientation)
        val plan = NemuLongStripImagePolicy.inspectAndPlan(
          source,
          outputPolicy,
          NemuLongStripImagePolicy.MAX_ENCODED_BYTES
        )
        val transcoded = NemuLongStripImageTranscoder.transcodeSegments(
          source,
          plan,
          outputPolicy,
          NemuLongStripImagePolicy.MAX_ENCODED_BYTES
        )
        result = transcoded
        assertEquals(NemuImageDimensions(64, 17_000), transcoded.dimensions)
        assertEquals(2, transcoded.segments.size)
        assertSegmentedCornerColors(transcoded, corners)
        assertOpaqueSegmentEdges(transcoded)
      } finally {
        source.delete()
        result?.segments?.forEach { it.file.delete() }
      }
    }
  }

  @Test
  fun baselineJpegUsesMcuAlignedSegmentsWithoutVisibleGradientJoins() {
    val source = File.createTempFile("nemu-segmented-jpeg-", ".jpg")
    var result: NemuLongStripSegmentTranscodeResult? = null
    try {
      writeVerticalGradientJpeg(source, width = 64, height = 17_000)
      val plan = NemuLongStripImagePolicy.inspectAndPlan(
        source,
        outputPolicy,
        NemuLongStripImagePolicy.MAX_ENCODED_BYTES
      )
      assertEquals(NemuStaticImageFormat.JPEG, plan.container.format)
      assertTrue(plan.container.encodedLongAxisAlignment in 8..32)
      val transcoded = NemuLongStripImageTranscoder.transcodeSegments(
        source,
        plan,
        outputPolicy,
        NemuLongStripImagePolicy.MAX_ENCODED_BYTES
      )
      result = transcoded
      assertEquals(NemuImageDimensions(64, 17_000), transcoded.dimensions)
      assertEquals(2, transcoded.segments.size)
      transcoded.segments.zipWithNext().forEach { (before, after) ->
        val beforeColor = readPixel(
          before.file,
          before.dimensions.width.toInt() / 2,
          before.dimensions.height.toInt() - 1
        )
        val afterColor = readPixel(after.file, after.dimensions.width.toInt() / 2, 0)
        assertTrue(kotlin.math.abs(Color.red(beforeColor) - Color.red(afterColor)) <= 12)
        assertTrue(kotlin.math.abs(Color.green(beforeColor) - Color.green(afterColor)) <= 12)
        assertTrue(kotlin.math.abs(Color.blue(beforeColor) - Color.blue(afterColor)) <= 12)
      }
    } finally {
      source.delete()
      result?.segments?.forEach { it.file.delete() }
    }
  }

  @Test
  fun segmentedCancellationAfterFirstPublishAndAggregateBudgetFailureCleanAllArtifacts() {
    val source = File.createTempFile("nemu-segment-cleanup-", ".png")
    try {
      writeStripedPng(source, width = 64, height = 17_000)
      val plan = NemuLongStripImagePolicy.inspectAndPlan(
        source,
        outputPolicy,
        NemuLongStripImagePolicy.MAX_ENCODED_BYTES
      )
      val namesBefore = transcodeArtifactNames(source.parentFile!!)
      assertThrows(InterruptedIOException::class.java) {
        NemuLongStripImageTranscoder.transcodeSegments(
          source,
          plan,
          outputPolicy,
          NemuLongStripImagePolicy.MAX_ENCODED_BYTES,
          isCancelled = {
            transcodeArtifactNames(source.parentFile!!).any {
              it.startsWith("nemu-http-output-segment-")
            }
          }
        )
      }
      assertEquals(namesBefore, transcodeArtifactNames(source.parentFile!!))

      val baseline = NemuLongStripImageTranscoder.transcodeSegments(
        source,
        plan,
        outputPolicy,
        NemuLongStripImagePolicy.MAX_ENCODED_BYTES
      )
      val firstTileBytes = baseline.segments.first().byteLength
      baseline.segments.forEach { it.file.delete() }
      assertThrows(IOException::class.java) {
        NemuLongStripImageTranscoder.transcodeSegments(
          source,
          plan,
          outputPolicy,
          firstTileBytes + 1L
        )
      }
      assertEquals(namesBefore, transcodeArtifactNames(source.parentFile!!))
    } finally {
      source.delete()
    }
  }

  @Test
  fun cancelledWaiterLeavesTheSerializedTranscodeQueuePromptly() {
    val source = File.createTempFile("nemu-segment-waiter-", ".png")
    val holderResult = AtomicReference<NemuLongStripTranscodeResult?>()
    try {
      writeStripedPng(source, width = 64, height = 17_000)
      val plan = NemuLongStripImagePolicy.inspectAndPlan(
        source,
        outputPolicy,
        NemuLongStripImagePolicy.MAX_ENCODED_BYTES
      )
      val holderHasPermit = CountDownLatch(1)
      val releaseHolder = CountDownLatch(1)
      val holderChecks = AtomicInteger(0)
      val holderError = AtomicReference<Throwable?>()
      val holder = Thread {
        try {
          holderResult.set(
            NemuLongStripImageTranscoder.transcode(
              source,
              plan,
              outputPolicy,
              NemuLongStripImagePolicy.MAX_ENCODED_BYTES,
              isCancelled = {
                if (holderChecks.incrementAndGet() == 2) {
                  holderHasPermit.countDown()
                  releaseHolder.await(5, TimeUnit.SECONDS)
                }
                false
              }
            )
          )
        } catch (error: Throwable) {
          holderError.set(error)
        }
      }
      holder.start()
      assertTrue(holderHasPermit.await(2, TimeUnit.SECONDS))

      val waiterStarted = CountDownLatch(1)
      val cancelWaiter = AtomicBoolean(false)
      val waiterError = AtomicReference<Throwable?>()
      val waiter = Thread {
        try {
          NemuLongStripImageTranscoder.transcode(
            source,
            plan,
            outputPolicy,
            NemuLongStripImagePolicy.MAX_ENCODED_BYTES,
            isCancelled = {
              waiterStarted.countDown()
              cancelWaiter.get()
            }
          )
        } catch (error: Throwable) {
          waiterError.set(error)
        }
      }
      waiter.start()
      assertTrue(waiterStarted.await(1, TimeUnit.SECONDS))
      cancelWaiter.set(true)
      waiter.join(1_000)
      assertFalse("cancelled waiter remained blocked on the permit", waiter.isAlive)
      assertTrue(waiterError.get() is InterruptedIOException)

      releaseHolder.countDown()
      holder.join(10_000)
      assertFalse(holder.isAlive)
      holderError.get()?.let { throw AssertionError(it) }
    } finally {
      source.delete()
      holderResult.get()?.file?.delete()
    }
  }

  @Suppress("DEPRECATION")
  private fun assertNoTransparentSeamsOrMissingLastStripe(
    output: File,
    plan: NemuLongStripTranscodePlan
  ) {
    val decoder = BitmapRegionDecoder.newInstance(output.absolutePath, false)
    try {
      val rows = mutableSetOf(0, plan.outputDimensions.height.toInt() - 1)
      plan.ranges.dropLast(1).forEach { range ->
        val mapped = (
          range.endExclusive.toLong() * plan.outputDimensions.height /
            plan.container.encodedDimensions.height
          ).toInt()
        rows += (mapped - 1).coerceIn(0, plan.outputDimensions.height.toInt() - 1)
        rows += mapped.coerceIn(0, plan.outputDimensions.height.toInt() - 1)
        rows += (mapped + 1).coerceIn(0, plan.outputDimensions.height.toInt() - 1)
      }
      rows.forEach { row ->
        val pixel = decoder.decodeRegion(
          Rect(plan.outputDimensions.width.toInt() / 2, row,
            plan.outputDimensions.width.toInt() / 2 + 1, row + 1),
          BitmapFactory.Options()
        )
        try {
          assertEquals("transparent seam at output row $row", 255, Color.alpha(pixel.getPixel(0, 0)))
        } finally {
          pixel.recycle()
        }
      }
      val lastPixel = decoder.decodeRegion(
        Rect(
          plan.outputDimensions.width.toInt() / 2,
          plan.outputDimensions.height.toInt() - 1,
          plan.outputDimensions.width.toInt() / 2 + 1,
          plan.outputDimensions.height.toInt()
        ),
        BitmapFactory.Options()
      )
      try {
        assertTrue(Color.green(lastPixel.getPixel(0, 0)) > 200)
        assertFalse(Color.alpha(lastPixel.getPixel(0, 0)) == 0)
      } finally {
        lastPixel.recycle()
      }
    } finally {
      decoder.recycle()
    }
  }

  @Suppress("DEPRECATION")
  private fun assertCornerColors(output: File, expected: IntArray) {
    val decoder = BitmapRegionDecoder.newInstance(output.absolutePath, false)
    try {
      val insetX = (decoder.width / 8).coerceAtLeast(1)
      val insetY = (decoder.height / 8).coerceAtLeast(1)
      val positions = arrayOf(
        insetX to insetY,
        decoder.width - insetX - 1 to insetY,
        insetX to decoder.height - insetY - 1,
        decoder.width - insetX - 1 to decoder.height - insetY - 1
      )
      positions.forEachIndexed { index, (x, y) ->
        val pixel = decoder.decodeRegion(
          Rect(x, y, x + 1, y + 1),
          BitmapFactory.Options()
        )
        try {
          val actual = pixel.getPixel(0, 0)
          assertEquals(255, Color.alpha(actual))
          assertTrue(kotlin.math.abs(Color.red(expected[index]) - Color.red(actual)) <= 8)
          assertTrue(kotlin.math.abs(Color.green(expected[index]) - Color.green(actual)) <= 8)
          assertTrue(kotlin.math.abs(Color.blue(expected[index]) - Color.blue(actual)) <= 8)
        } finally {
          pixel.recycle()
        }
      }
    } finally {
      decoder.recycle()
    }
  }

  private fun assertSegmentedCornerColors(
    result: NemuLongStripSegmentTranscodeResult,
    expected: IntArray
  ) {
    val inset = 8
    assertGlobalSegmentPixel(result, inset, inset, expected[0])
    assertGlobalSegmentPixel(result, result.dimensions.width.toInt() - inset - 1, inset, expected[1])
    assertGlobalSegmentPixel(
      result,
      inset,
      result.dimensions.height.toInt() - inset - 1,
      expected[2]
    )
    assertGlobalSegmentPixel(
      result,
      result.dimensions.width.toInt() - inset - 1,
      result.dimensions.height.toInt() - inset - 1,
      expected[3]
    )
  }

  @Suppress("DEPRECATION")
  private fun assertOpaqueSegmentEdges(result: NemuLongStripSegmentTranscodeResult) {
    result.segments.forEach { segment ->
      val decoder = BitmapRegionDecoder.newInstance(segment.file.absolutePath, false)
      try {
        listOf(0, decoder.height - 1).forEach { y ->
          val pixel = decoder.decodeRegion(
            Rect(decoder.width / 2, y, decoder.width / 2 + 1, y + 1),
            BitmapFactory.Options()
          )
          try {
            assertEquals(255, Color.alpha(pixel.getPixel(0, 0)))
          } finally {
            pixel.recycle()
          }
        }
      } finally {
        decoder.recycle()
      }
    }
  }

  @Suppress("DEPRECATION")
  private fun assertGlobalSegmentPixel(
    result: NemuLongStripSegmentTranscodeResult,
    x: Int,
    y: Int,
    expected: Int
  ) {
    var remainingY = y
    val segment = result.segments.first { candidate ->
      if (remainingY < candidate.dimensions.height.toInt()) {
        true
      } else {
        remainingY -= candidate.dimensions.height.toInt()
        false
      }
    }
    val decoder = BitmapRegionDecoder.newInstance(segment.file.absolutePath, false)
    try {
      val pixel = decoder.decodeRegion(
        Rect(x, remainingY, x + 1, remainingY + 1),
        BitmapFactory.Options()
      )
      try {
        val actual = pixel.getPixel(0, 0)
        assertEquals(255, Color.alpha(actual))
        assertTrue(kotlin.math.abs(Color.red(expected) - Color.red(actual)) <= 8)
        assertTrue(kotlin.math.abs(Color.green(expected) - Color.green(actual)) <= 8)
        assertTrue(kotlin.math.abs(Color.blue(expected) - Color.blue(actual)) <= 8)
      } finally {
        pixel.recycle()
      }
    } finally {
      decoder.recycle()
    }
  }

  private fun writeStripedPng(
    file: File,
    width: Int,
    height: Int,
    exifOrientation: Int? = null
  ) {
    val rows = arrayOf(
      pngRow(width, 0xff, 0x00, 0x00),
      pngRow(width, 0x00, 0xff, 0x00),
      pngRow(width, 0x00, 0x00, 0xff),
      pngRow(width, 0xff, 0xff, 0x00)
    )
    writePngRows(file, width, height, exifOrientation) { row ->
      rows[(row / 1_024) % rows.size]
    }
  }

  /** Emits device-specific evidence without relaxing the transcoder deadline. */
  private fun <T> benchmarkTranscode(label: String, block: () -> T): T {
    val runtime = Runtime.getRuntime()
    fun usedJavaHeap(): Long = runtime.totalMemory() - runtime.freeMemory()

    val baselineJava = usedJavaHeap()
    val baselineNative = Debug.getNativeHeapAllocatedSize()
    val peakJava = AtomicLong(baselineJava)
    val peakNative = AtomicLong(baselineNative)
    val sampling = AtomicBoolean(true)
    val sampler = Thread {
      while (sampling.get()) {
        peakJava.updateAndGet { current -> maxOf(current, usedJavaHeap()) }
        peakNative.updateAndGet { current ->
          maxOf(current, Debug.getNativeHeapAllocatedSize())
        }
        try {
          Thread.sleep(10)
        } catch (_: InterruptedException) {
          return@Thread
        }
      }
    }.apply {
      isDaemon = true
      name = "nemu-long-strip-memory-sampler"
    }
    val startedAt = SystemClock.elapsedRealtimeNanos()
    sampler.start()
    return try {
      block()
    } finally {
      sampling.set(false)
      sampler.interrupt()
      sampler.join(1_000)
      val elapsedMs = (SystemClock.elapsedRealtimeNanos() - startedAt) / 1_000_000L
      println(
        "NEMU_LONG_STRIP_BENCHMARK label=$label elapsedMs=$elapsedMs " +
          "javaHeapPeakDeltaBytes=${maxOf(0L, peakJava.get() - baselineJava)} " +
          "nativeHeapPeakDeltaBytes=${maxOf(0L, peakNative.get() - baselineNative)}"
      )
    }
  }

  private fun writeCornerPng(
    file: File,
    width: Int,
    height: Int,
    exifOrientation: Int
  ) {
    val top = pngSplitRow(width, Color.RED, Color.GREEN)
    val bottom = pngSplitRow(width, Color.BLUE, Color.YELLOW)
    writePngRows(file, width, height, exifOrientation) { row ->
      if (row < height / 2) top else bottom
    }
  }

  private fun writeVerticalGradientJpeg(file: File, width: Int, height: Int) {
    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    try {
      val row = IntArray(width)
      repeat(height) { y ->
        val value = y * 255 / (height - 1).coerceAtLeast(1)
        row.fill(Color.rgb(value, value, value))
        bitmap.setPixels(row, 0, width, 0, y, width, 1)
      }
      FileOutputStream(file).use { output ->
        assertTrue(bitmap.compress(Bitmap.CompressFormat.JPEG, 96, output))
        output.fd.sync()
      }
    } finally {
      bitmap.recycle()
    }
  }

  private fun writePngRows(
    file: File,
    width: Int,
    height: Int,
    exifOrientation: Int?,
    rowAt: (Int) -> ByteArray
  ) {
    val compressed = ByteArrayOutputStream()
    DeflaterOutputStream(
      compressed,
      Deflater(Deflater.BEST_SPEED, false),
      16 * 1_024
    ).use { deflater ->
      repeat(height) { row ->
        deflater.write(rowAt(row))
      }
    }
    FileOutputStream(file).use { fileOutput ->
      DataOutputStream(fileOutput).use { output ->
        output.write(byteArrayOf(
          0x89.toByte(), 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
        ))
        val header = ByteArrayOutputStream().also { bytes ->
          DataOutputStream(bytes).use { data ->
            data.writeInt(width)
            data.writeInt(height)
            data.write(byteArrayOf(8, 6, 0, 0, 0))
          }
        }.toByteArray()
        writePngChunk(output, "IHDR", header)
        exifOrientation?.let {
          writePngChunk(output, "eXIf", tiffOrientation(it))
        }
        writePngChunk(output, "IDAT", compressed.toByteArray())
        writePngChunk(output, "IEND", ByteArray(0))
        output.flush()
        fileOutput.fd.sync()
      }
    }
  }

  private fun pngRow(width: Int, red: Int, green: Int, blue: Int): ByteArray {
    return ByteArray(1 + width * 4).also { row ->
      row[0] = 0
      repeat(width) { column ->
        val offset = 1 + column * 4
        row[offset] = red.toByte()
        row[offset + 1] = green.toByte()
        row[offset + 2] = blue.toByte()
        row[offset + 3] = 0xff.toByte()
      }
    }
  }

  private fun pngSplitRow(width: Int, leftColor: Int, rightColor: Int): ByteArray {
    return ByteArray(1 + width * 4).also { row ->
      row[0] = 0
      repeat(width) { column ->
        val color = if (column < width / 2) leftColor else rightColor
        val offset = 1 + column * 4
        row[offset] = Color.red(color).toByte()
        row[offset + 1] = Color.green(color).toByte()
        row[offset + 2] = Color.blue(color).toByte()
        row[offset + 3] = 0xff.toByte()
      }
    }
  }

  private fun writePngChunk(
    output: DataOutputStream,
    type: String,
    data: ByteArray
  ) {
    val typeBytes = type.toByteArray(Charsets.US_ASCII)
    val crc = CRC32().apply {
      update(typeBytes)
      update(data)
    }
    output.writeInt(data.size)
    output.write(typeBytes)
    output.write(data)
    output.writeInt(crc.value.toInt())
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

  @Suppress("DEPRECATION")
  private fun readPixel(file: File, x: Int, y: Int): Int {
    val decoder = BitmapRegionDecoder.newInstance(file.absolutePath, false)
    try {
      val pixel = decoder.decodeRegion(
        Rect(x, y, x + 1, y + 1),
        BitmapFactory.Options()
      )
      return try {
        pixel.getPixel(0, 0)
      } finally {
        pixel.recycle()
      }
    } finally {
      decoder.recycle()
    }
  }

  private fun stageNames(directory: File): Set<String> {
    return directory.listFiles()
      ?.asSequence()
      ?.map(File::getName)
      ?.filter { it.startsWith("nemu-http-stage-") && it.endsWith(".part") }
      ?.toSet()
      .orEmpty()
  }

  private fun transcodeArtifactNames(directory: File): Set<String> {
    return directory.listFiles()
      ?.asSequence()
      ?.map(File::getName)
      ?.filter {
        (it.startsWith("nemu-http-stage-") ||
          it.startsWith("nemu-http-output-")) &&
          it.endsWith(".part")
      }
      ?.toSet()
      .orEmpty()
  }
}
