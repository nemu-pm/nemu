package pm.nemu.mobile.aidoku

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.BitmapRegionDecoder
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Rect
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.io.InterruptedIOException
import java.io.OutputStream
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.util.concurrent.Semaphore
import java.util.concurrent.TimeUnit

internal data class NemuLongStripTranscodeResult(
  val file: File,
  val byteLength: Long,
  val mimeType: String,
  val dimensions: NemuImageDimensions
)

internal data class NemuLongStripSegmentResult(
  val file: File,
  val byteLength: Long,
  val mimeType: String,
  val dimensions: NemuImageDimensions
)

internal data class NemuLongStripSegmentTranscodeResult(
  val segments: List<NemuLongStripSegmentResult>,
  val byteLength: Long,
  val dimensions: NemuImageDimensions
)

internal class NemuLongStripSegmentOutputLimitException(
  message: String,
  cause: Throwable? = null
) : IOException(message, cause)

private class NemuTranscodedImageOutputLimitException(message: String) :
  IOException(message)

internal object NemuLongStripImageTranscoder {
  // JS publishes a small generation manifest alongside the encoded members.
  // Reserve its entire independently enforced envelope so the cache group can
  // never exceed the caller's existing max-response/max-entry byte cap.
  internal const val SEGMENTED_MANIFEST_RESERVE_BYTES = 64L * 1024L
  private const val BYTES_PER_OUTPUT_PIXEL = 4L
  private const val MAX_STRIPE_ALLOCATION_BYTES =
    NemuLongStripImagePolicy.MAX_DECODED_STRIPE_PIXELS * 4L
  private const val JPEG_QUALITY = 92
  // A real 800 x 43,206 comic strip needs more than 30 seconds to region-decode,
  // encode, inspect, and atomically publish all 17 tiles on a Pixel 7. Size,
  // memory, output bytes, concurrency, and cancellation are independently
  // bounded, so allow the full 64 MiPixel envelope enough serialized CPU time
  // to complete instead of deterministically discarding valid work near 65%.
  internal val MAX_TRANSCODE_DURATION_NANOS = TimeUnit.SECONDS.toNanos(120)
  private const val PERMIT_POLL_MILLIS = 50L
  private val transcodePermit = Semaphore(1, true)

  internal fun transcode(
    source: File,
    plan: NemuLongStripTranscodePlan,
    outputPolicy: NemuImageDimensionPolicy,
    maximumOutputBytes: Long,
    isCancelled: () -> Boolean = { Thread.currentThread().isInterrupted },
    deadlineNanos: Long = newRequestDeadlineNanos()
  ): NemuLongStripTranscodeResult {
    ensureActive(isCancelled, deadlineNanos)
    acquireTranscodePermit(isCancelled, deadlineNanos)
    try {
      ensureActive(isCancelled, deadlineNanos)
      return transcodeWithPermit(
        source,
        plan,
        outputPolicy,
        maximumOutputBytes,
        isCancelled,
        deadlineNanos
      )
    } finally {
      transcodePermit.release()
    }
  }

  private fun transcodeWithPermit(
    source: File,
    plan: NemuLongStripTranscodePlan,
    outputPolicy: NemuImageDimensionPolicy,
    maximumOutputBytes: Long,
    isCancelled: () -> Boolean,
    deadlineNanos: Long
  ): NemuLongStripTranscodeResult {
    if (maximumOutputBytes <= 0L) throw IOException("Invalid image output byte limit.")
    val outputPixels = checkedPixels(plan.outputDimensions)
    if (
      outputPixels > outputPolicy.maxPixels.toLong() ||
      plan.outputDimensions.width > outputPolicy.maxDimension.toLong() ||
      plan.outputDimensions.height > outputPolicy.maxDimension.toLong()
    ) {
      throw IOException("Long-strip output exceeds the requested image policy.")
    }
    if (outputPixels * BYTES_PER_OUTPUT_PIXEL >
      NemuImageMetadataPolicy.HARD_MAX_PIXELS.toLong() * BYTES_PER_OUTPUT_PIXEL
    ) {
      throw IOException("Long-strip output allocation exceeds the hard memory limit.")
    }

    val mimeType = when (plan.container.format) {
      NemuStaticImageFormat.JPEG -> "image/jpeg"
      NemuStaticImageFormat.PNG -> "image/png"
    }
    val outputDirectory = source.parentFile
      ?: throw IOException("Long-strip source has no cache directory.")
    // Keep every artifact in the pre-existing native-download `.part`
    // namespace. The startup/pressure pruner already applies its exact
    // age/grace/count/byte policy to this namespace, including process death
    // between native publication and the JS cache move.
    val staged = File.createTempFile("nemu-http-stage-", ".part", outputDirectory)
    val published = File(
      outputDirectory,
      staged.name
        .replaceFirst("nemu-http-stage-", "nemu-http-output-")
    )
    var outputBitmap: Bitmap? = null
    var decoder: BitmapRegionDecoder? = null
    var publishedSuccessfully = false
    try {
      ensureActive(isCancelled, deadlineNanos)
      decoder = createRegionDecoder(source)
      if (
        decoder.width.toLong() != plan.container.encodedDimensions.width ||
        decoder.height.toLong() != plan.container.encodedDimensions.height
      ) {
        throw IOException("Decoded image dimensions disagree with inspected metadata.")
      }

      outputBitmap = createOutputBitmap(plan.outputDimensions)
      outputBitmap.eraseColor(
        if (plan.container.format == NemuStaticImageFormat.PNG) {
          Color.TRANSPARENT
        } else {
          Color.WHITE
        }
      )
      val canvas = Canvas(outputBitmap)
      val paint = Paint(Paint.FILTER_BITMAP_FLAG or Paint.DITHER_FLAG)
      val encodedWidth = plan.container.encodedDimensions.width.toInt()
      val encodedHeight = plan.container.encodedDimensions.height.toInt()
      val vertical = encodedHeight >= encodedWidth

      plan.ranges.forEach { range ->
        ensureActive(isCancelled, deadlineNanos)
        val region = if (vertical) {
          Rect(0, range.start, encodedWidth, range.endExclusive)
        } else {
          Rect(range.start, 0, range.endExclusive, encodedHeight)
        }
        val stripe = decodeStripe(decoder, region, plan.decodeSampleSize)
        try {
          if (
            stripe.width <= 0 ||
            stripe.height <= 0 ||
            stripe.allocationByteCount.toLong() > MAX_STRIPE_ALLOCATION_BYTES
          ) {
            throw IOException("Decoded long-strip region exceeds its memory limit.")
          }
          canvas.drawBitmap(
            stripe,
            stripeMatrix(
              stripe.width,
              stripe.height,
              region,
              encodedWidth,
              encodedHeight,
              plan.container.exifOrientation,
              plan.outputDimensions.width.toInt(),
              plan.outputDimensions.height.toInt()
            ),
            paint
          )
        } finally {
          stripe.recycle()
        }
      }

      ensureActive(isCancelled, deadlineNanos)
      encodeBounded(outputBitmap, plan.container.format, staged, maximumOutputBytes)
      outputBitmap.recycle()
      outputBitmap = null
      val stagedLength = staged.length()
      validateOutput(staged, stagedLength, maximumOutputBytes, plan, outputPolicy)
      ensureActive(isCancelled, deadlineNanos)
      try {
        Files.move(staged.toPath(), published.toPath(), StandardCopyOption.ATOMIC_MOVE)
      } catch (error: Exception) {
        throw IOException("Could not atomically publish the long-strip image.", error)
      }
      ensureActive(isCancelled, deadlineNanos)
      publishedSuccessfully = true
      return NemuLongStripTranscodeResult(
        file = published,
        byteLength = stagedLength,
        mimeType = mimeType,
        dimensions = plan.outputDimensions
      )
    } finally {
      outputBitmap?.recycle()
      decoder?.recycle()
      if (staged.exists()) staged.delete()
      if (!publishedSuccessfully && published.exists()) published.delete()
    }
  }

  /**
   * Preserves the EXIF-normalized source width by publishing a bounded set of
   * independently safe static images. No member is returned unless every
   * member has been encoded, reinspected, and atomically moved successfully.
   */
  internal fun transcodeSegments(
    source: File,
    plan: NemuLongStripTranscodePlan,
    outputPolicy: NemuImageDimensionPolicy,
    maximumOutputBytes: Long,
    isCancelled: () -> Boolean = { Thread.currentThread().isInterrupted },
    deadlineNanos: Long = newRequestDeadlineNanos()
  ): NemuLongStripSegmentTranscodeResult {
    if (maximumOutputBytes <= 0L) throw IOException("Invalid image output byte limit.")
    ensureActive(isCancelled, deadlineNanos)
    acquireTranscodePermit(isCancelled, deadlineNanos)
    try {
      ensureActive(isCancelled, deadlineNanos)
      return transcodeSegmentsWithPermit(
        source,
        plan,
        outputPolicy,
        maximumOutputBytes,
        isCancelled,
        deadlineNanos
      )
    } finally {
      transcodePermit.release()
    }
  }

  private fun transcodeSegmentsWithPermit(
    source: File,
    plan: NemuLongStripTranscodePlan,
    outputPolicy: NemuImageDimensionPolicy,
    maximumOutputBytes: Long,
    isCancelled: () -> Boolean,
    deadlineNanos: Long
  ): NemuLongStripSegmentTranscodeResult {
    val segmentPlans = NemuLongStripImagePolicy.segmentPlans(plan.container, outputPolicy)
    val aggregateDimensions = plan.container.displayedDimensions
    val aggregatePixels = checkedPixels(aggregateDimensions)
    if (aggregatePixels > NemuLongStripImagePolicy.MAX_INPUT_PIXELS) {
      throw IOException("Segmented image exceeds the aggregate pixel safety limit.")
    }
    val mimeType = mimeType(plan.container.format)
    val outputDirectory = source.parentFile
      ?: throw IOException("Long-strip source has no cache directory.")
    val stagedFiles = mutableListOf<File>()
    val publishedFiles = mutableListOf<File>()
    val completed = mutableListOf<NemuLongStripSegmentResult>()
    var decoder: BitmapRegionDecoder? = null
    var succeeded = false
    var aggregateBytes = 0L
    try {
      decoder = createRegionDecoder(source)
      if (
        decoder.width.toLong() != plan.container.encodedDimensions.width ||
        decoder.height.toLong() != plan.container.encodedDimensions.height
      ) {
        throw IOException("Decoded image dimensions disagree with inspected metadata.")
      }
      val encodedWidth = decoder.width
      val encodedHeight = decoder.height
      val vertical = encodedHeight >= encodedWidth

      segmentPlans.forEachIndexed { index, segmentPlan ->
        ensureActive(isCancelled, deadlineNanos)
        val tilePixels = checkedPixels(segmentPlan.outputDimensions)
        val maximumTilePixels =
          NemuLongStripImagePolicy.TARGET_SEGMENT_PIXELS.toLong() +
            (NemuLongStripImagePolicy.MAX_JPEG_MCU_ALIGNMENT - 1L) *
            NemuLongStripImagePolicy.MAX_INPUT_SHORT_SIDE.toLong()
        if (tilePixels > maximumTilePixels) {
          throw IOException("Segmented image tile exceeds its working memory limit.")
        }
        val region = if (vertical) {
          Rect(
            0,
            segmentPlan.sourceRange.start,
            encodedWidth,
            segmentPlan.sourceRange.endExclusive
          )
        } else {
          Rect(
            segmentPlan.sourceRange.start,
            0,
            segmentPlan.sourceRange.endExclusive,
            encodedHeight
          )
        }
        val decoded = decodeStripe(decoder, region, 1)
        var outputBitmap: Bitmap? = null
        try {
          ensureActive(isCancelled, deadlineNanos)
          if (
            decoded.width <= 0 ||
            decoded.height <= 0 ||
            decoded.allocationByteCount.toLong() > maximumTilePixels * BYTES_PER_OUTPUT_PIXEL
          ) {
            throw IOException("Decoded segmented image tile exceeds its memory limit.")
          }
          val bitmapToEncode = if (
            plan.container.exifOrientation == 1 &&
            decoded.width.toLong() == segmentPlan.outputDimensions.width &&
            decoded.height.toLong() == segmentPlan.outputDimensions.height
          ) {
            // The common unrotated path is already the exact normalized tile.
            // Encoding it directly avoids holding a second ~2 MP bitmap while
            // Skia's decoder and encoder native working sets overlap.
            decoded
          } else {
            createOutputBitmap(segmentPlan.outputDimensions).also { output ->
              outputBitmap = output
              output.eraseColor(
                if (plan.container.format == NemuStaticImageFormat.PNG) {
                  Color.TRANSPARENT
                } else {
                  Color.WHITE
                }
              )
              Canvas(output).drawBitmap(
                decoded,
                segmentMatrix(
                  decoded.width,
                  decoded.height,
                  region,
                  encodedWidth,
                  encodedHeight,
                  plan.container.exifOrientation,
                  segmentPlan.displayedStart
                ),
                Paint(Paint.FILTER_BITMAP_FLAG or Paint.DITHER_FLAG)
              )
            }
          }
          ensureActive(isCancelled, deadlineNanos)

          val remainingBytes = maximumOutputBytes - aggregateBytes
          if (remainingBytes <= 0L) {
            throw NemuLongStripSegmentOutputLimitException(
              "Segmented image exceeds the aggregate encoded byte safety limit."
            )
          }
          val staged = File.createTempFile(
            "nemu-http-stage-segment-${index.toString().padStart(2, '0')}-",
            ".part",
            outputDirectory
          )
          stagedFiles += staged
          try {
            encodeBounded(bitmapToEncode, plan.container.format, staged, remainingBytes)
          } catch (error: NemuTranscodedImageOutputLimitException) {
            throw NemuLongStripSegmentOutputLimitException(
              "Segmented image exceeds the aggregate encoded byte safety limit.",
              error
            )
          }
          outputBitmap?.recycle()
          outputBitmap = null
          ensureActive(isCancelled, deadlineNanos)
          val length = staged.length()
          validateSegmentOutput(
            staged,
            length,
            remainingBytes,
            plan.container.format,
            segmentPlan.outputDimensions,
            outputPolicy
          )
          if (length > maximumOutputBytes - aggregateBytes) {
            throw NemuLongStripSegmentOutputLimitException(
              "Segmented image exceeds the aggregate encoded byte safety limit."
            )
          }
          aggregateBytes += length
          completed += NemuLongStripSegmentResult(
            file = staged,
            byteLength = length,
            mimeType = mimeType,
            dimensions = segmentPlan.outputDimensions
          )
        } finally {
          outputBitmap?.recycle()
          decoded.recycle()
        }
      }

      ensureActive(isCancelled, deadlineNanos)
      completed.forEachIndexed { index, segment ->
        val published = File(
          outputDirectory,
          segment.file.name.replaceFirst(
            "nemu-http-stage-segment-",
            "nemu-http-output-segment-"
          )
        )
        try {
          Files.move(segment.file.toPath(), published.toPath(), StandardCopyOption.ATOMIC_MOVE)
        } catch (error: Exception) {
          throw IOException("Could not atomically publish segmented image tile $index.", error)
        }
        publishedFiles += published
        ensureActive(isCancelled, deadlineNanos)
      }
      if (
        completed.size !in 1..NemuLongStripImagePolicy.MAX_SEGMENTS ||
        publishedFiles.size != completed.size ||
        aggregateBytes !in 1..maximumOutputBytes
      ) {
        throw IOException("Segmented image failed aggregate publication checks.")
      }
      succeeded = true
      return NemuLongStripSegmentTranscodeResult(
        segments = completed.mapIndexed { index, segment ->
          segment.copy(file = publishedFiles[index])
        },
        byteLength = aggregateBytes,
        dimensions = aggregateDimensions
      )
    } finally {
      decoder?.recycle()
      stagedFiles.forEach { if (it.exists()) it.delete() }
      if (!succeeded) publishedFiles.forEach { if (it.exists()) it.delete() }
    }
  }

  private fun createOutputBitmap(dimensions: NemuImageDimensions): Bitmap {
    return try {
      Bitmap.createBitmap(
        dimensions.width.toInt(),
        dimensions.height.toInt(),
        Bitmap.Config.ARGB_8888
      )
    } catch (error: OutOfMemoryError) {
      throw IOException("Could not allocate the bounded long-strip output bitmap.", error)
    }
  }

  @Suppress("DEPRECATION")
  private fun createRegionDecoder(file: File): BitmapRegionDecoder {
    return try {
      BitmapRegionDecoder.newInstance(file.absolutePath, false)
        ?: throw IOException("Android does not support region decoding this image.")
    } catch (error: OutOfMemoryError) {
      throw IOException("Image container initialization exceeded its memory limit.", error)
    }
  }

  private fun decodeStripe(
    decoder: BitmapRegionDecoder,
    region: Rect,
    sampleSize: Int
  ): Bitmap {
    val options = BitmapFactory.Options().apply {
      inSampleSize = sampleSize
      inPreferredConfig = Bitmap.Config.ARGB_8888
      inScaled = false
    }
    return try {
      decoder.decodeRegion(region, options)
        ?: throw IOException("Android could not decode a long-strip image region.")
    } catch (error: OutOfMemoryError) {
      throw IOException("Long-strip region decode exceeded its memory limit.", error)
    }
  }

  private fun encodeBounded(
    bitmap: Bitmap,
    format: NemuStaticImageFormat,
    output: File,
    maximumOutputBytes: Long
  ) {
    val compressionFormat = when (format) {
      NemuStaticImageFormat.JPEG -> Bitmap.CompressFormat.JPEG
      NemuStaticImageFormat.PNG -> Bitmap.CompressFormat.PNG
    }
    FileOutputStream(output).use { fileOutput ->
      val boundedOutput = BoundedOutputStream(fileOutput, maximumOutputBytes)
      val compressed = bitmap.compress(
        compressionFormat,
        if (compressionFormat == Bitmap.CompressFormat.JPEG) JPEG_QUALITY else 100,
        boundedOutput
      )
      boundedOutput.flush()
      if (boundedOutput.exceededLimit) {
        throw NemuTranscodedImageOutputLimitException(
          "Transcoded image exceeds the encoded byte safety limit."
        )
      }
      if (!compressed) throw IOException("Android could not encode the long-strip image.")
      fileOutput.fd.sync()
    }
  }

  private fun validateOutput(
    staged: File,
    stagedLength: Long,
    maximumOutputBytes: Long,
    plan: NemuLongStripTranscodePlan,
    outputPolicy: NemuImageDimensionPolicy
  ) {
    if (stagedLength !in 1..maximumOutputBytes) {
      throw IOException("Transcoded image exceeds the encoded byte safety limit.")
    }
    val outputContainer = NemuStaticImageContainerInspector.inspect(
      staged,
      maximumOutputBytes
    )
    if (
      outputContainer.format != plan.container.format ||
      outputContainer.exifOrientation != 1 ||
      outputContainer.displayedDimensions != plan.outputDimensions
    ) {
      throw IOException("Transcoded image metadata failed safe publication checks.")
    }
    NemuImageMetadataPolicy.validateFile(staged, outputPolicy)
  }

  private fun validateSegmentOutput(
    staged: File,
    stagedLength: Long,
    maximumOutputBytes: Long,
    format: NemuStaticImageFormat,
    dimensions: NemuImageDimensions,
    outputPolicy: NemuImageDimensionPolicy
  ) {
    if (stagedLength !in 1..maximumOutputBytes) {
      throw IOException("Segmented image tile exceeds the encoded byte safety limit.")
    }
    val outputContainer = NemuStaticImageContainerInspector.inspect(
      staged,
      maximumOutputBytes
    )
    if (
      outputContainer.format != format ||
      outputContainer.exifOrientation != 1 ||
      outputContainer.displayedDimensions != dimensions
    ) {
      throw IOException("Segmented image tile metadata failed safe publication checks.")
    }
    NemuImageMetadataPolicy.validateFile(staged, outputPolicy)
  }

  private fun mimeType(format: NemuStaticImageFormat): String {
    return when (format) {
      NemuStaticImageFormat.JPEG -> "image/jpeg"
      NemuStaticImageFormat.PNG -> "image/png"
    }
  }

  private fun segmentMatrix(
    sourceWidth: Int,
    sourceHeight: Int,
    region: Rect,
    encodedWidth: Int,
    encodedHeight: Int,
    orientation: Int,
    displayedStart: Int
  ): Matrix {
    val source = floatArrayOf(
      0f, 0f,
      sourceWidth.toFloat(), 0f,
      0f, sourceHeight.toFloat()
    )
    val points = arrayOf(
      orientedPoint(
        region.left.toDouble(),
        region.top.toDouble(),
        encodedWidth.toDouble(),
        encodedHeight.toDouble(),
        orientation
      ),
      orientedPoint(
        region.right.toDouble(),
        region.top.toDouble(),
        encodedWidth.toDouble(),
        encodedHeight.toDouble(),
        orientation
      ),
      orientedPoint(
        region.left.toDouble(),
        region.bottom.toDouble(),
        encodedWidth.toDouble(),
        encodedHeight.toDouble(),
        orientation
      )
    )
    val destination = FloatArray(6)
    points.forEachIndexed { index, point ->
      destination[index * 2] = point.first.toFloat()
      destination[index * 2 + 1] = (point.second - displayedStart.toDouble()).toFloat()
    }
    return Matrix().also { matrix ->
      if (!matrix.setPolyToPoly(source, 0, destination, 0, 3)) {
        throw IOException("Could not map a segmented image tile safely.")
      }
    }
  }

  private fun stripeMatrix(
    stripeWidth: Int,
    stripeHeight: Int,
    region: Rect,
    encodedWidth: Int,
    encodedHeight: Int,
    orientation: Int,
    outputWidth: Int,
    outputHeight: Int
  ): Matrix {
    val source = floatArrayOf(
      0f, 0f,
      stripeWidth.toFloat(), 0f,
      0f, stripeHeight.toFloat()
    )
    val points = arrayOf(
      orientedPoint(
        region.left.toDouble(),
        region.top.toDouble(),
        encodedWidth.toDouble(),
        encodedHeight.toDouble(),
        orientation
      ),
      orientedPoint(
        region.right.toDouble(),
        region.top.toDouble(),
        encodedWidth.toDouble(),
        encodedHeight.toDouble(),
        orientation
      ),
      orientedPoint(
        region.left.toDouble(),
        region.bottom.toDouble(),
        encodedWidth.toDouble(),
        encodedHeight.toDouble(),
        orientation
      )
    )
    val displayedWidth = if (orientation in 5..8) encodedHeight else encodedWidth
    val displayedHeight = if (orientation in 5..8) encodedWidth else encodedHeight
    val destination = FloatArray(6)
    points.forEachIndexed { index, point ->
      destination[index * 2] =
        (point.first * outputWidth.toDouble() / displayedWidth.toDouble()).toFloat()
      destination[index * 2 + 1] =
        (point.second * outputHeight.toDouble() / displayedHeight.toDouble()).toFloat()
    }
    return Matrix().also { matrix ->
      if (!matrix.setPolyToPoly(source, 0, destination, 0, 3)) {
        throw IOException("Could not map a long-strip decode region safely.")
      }
    }
  }

  private fun orientedPoint(
    x: Double,
    y: Double,
    width: Double,
    height: Double,
    orientation: Int
  ): Pair<Double, Double> {
    return when (orientation) {
      1 -> x to y
      2 -> (width - x) to y
      3 -> (width - x) to (height - y)
      4 -> x to (height - y)
      5 -> y to x
      6 -> (height - y) to x
      7 -> (height - y) to (width - x)
      8 -> y to (width - x)
      else -> throw IOException("Invalid EXIF orientation.")
    }
  }

  /**
   * One deadline must be created per downloaded source and shared by a
   * segmented attempt and its bounded single-image fallback. Starting a new
   * clock for the fallback would permit nearly twice the intended CPU window.
   */
  internal fun newRequestDeadlineNanos(): Long {
    val now = System.nanoTime()
    return if (Long.MAX_VALUE - now < MAX_TRANSCODE_DURATION_NANOS) {
      Long.MAX_VALUE
    } else {
      now + MAX_TRANSCODE_DURATION_NANOS
    }
  }

  private fun acquireTranscodePermit(
    isCancelled: () -> Boolean,
    deadlineNanos: Long
  ) {
    while (true) {
      ensureActive(isCancelled, deadlineNanos)
      try {
        if (transcodePermit.tryAcquire(PERMIT_POLL_MILLIS, TimeUnit.MILLISECONDS)) {
          return
        }
      } catch (error: InterruptedException) {
        Thread.currentThread().interrupt()
        throw InterruptedIOException("Image download was cancelled.")
      }
    }
  }

  private fun ensureActive(isCancelled: () -> Boolean, deadlineNanos: Long) {
    if (isCancelled()) throw InterruptedIOException("Image download was cancelled.")
    if (System.nanoTime() - deadlineNanos >= 0L) {
      throw InterruptedIOException("Long-strip image processing timed out safely.")
    }
  }

  private fun checkedPixels(dimensions: NemuImageDimensions): Long {
    if (
      dimensions.width <= 0L ||
      dimensions.height <= 0L ||
      dimensions.width > Long.MAX_VALUE / dimensions.height
    ) {
      throw IOException("Invalid long-strip output dimensions.")
    }
    return dimensions.width * dimensions.height
  }

  private class BoundedOutputStream(
    private val delegate: OutputStream,
    private val maximumBytes: Long
  ) : OutputStream() {
    var exceededLimit = false
      private set
    private var total = 0L

    override fun write(value: Int) {
      ensureCapacity(1)
      delegate.write(value)
      total += 1L
    }

    override fun write(buffer: ByteArray, offset: Int, length: Int) {
      if (offset < 0 || length < 0 || offset + length > buffer.size) {
        throw IndexOutOfBoundsException()
      }
      ensureCapacity(length)
      delegate.write(buffer, offset, length)
      total += length.toLong()
    }

    override fun flush() = delegate.flush()

    private fun ensureCapacity(count: Int) {
      if (count.toLong() > maximumBytes - total) {
        exceededLimit = true
        throw NemuTranscodedImageOutputLimitException(
          "Transcoded image exceeds the encoded byte safety limit."
        )
      }
    }
  }
}
