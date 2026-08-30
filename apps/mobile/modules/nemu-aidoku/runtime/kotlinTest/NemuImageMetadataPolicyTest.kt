package pm.nemu.mobile.aidoku

import java.io.IOException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class NemuImageMetadataPolicyTest {
  private val policy = NemuImageDimensionPolicy(
    maxDimension = NemuImageMetadataPolicy.HARD_MAX_DIMENSION,
    maxPixels = NemuImageMetadataPolicy.HARD_MAX_PIXELS
  )

  @Test
  fun acceptsCommonImageHeadersAtTheSharedBoundary() {
    listOf(
      png(16_384, 512),
      gif(16_384, 512),
      jpeg(16_384, 512),
      webp(16_384, 512),
      isoImage("avif", listOf(16_384 to 512)),
      isoImage("heic", listOf(16_384 to 512))
    ).forEach { header ->
      assertEquals(
        NemuImageDimensions(16_384, 512),
        NemuImageMetadataPolicy.validateHeader(header, policy)
      )
    }
  }

  @Test
  fun rejectsCraftedOversizedHeadersInEverySupportedContainer() {
    listOf(
      png(16_385, 1),
      gif(16_385, 1),
      jpeg(16_385, 1),
      webp(16_385, 1),
      isoImage("avif", listOf(16_385 to 1))
    ).forEach { header ->
      assertThrows(IOException::class.java) {
        NemuImageMetadataPolicy.validateHeader(header, policy)
      }
    }
    assertThrows(IOException::class.java) {
      NemuImageMetadataPolicy.validateHeader(png(4_096, 4_096), policy)
    }
  }

  @Test
  fun validatesEveryIsoSpatialExtentInsteadOfTrustingASmallDecoy() {
    val crafted = isoImage(
      "avif",
      listOf(100 to 100, 8_192 to 8_192)
    )
    assertThrows(IOException::class.java) {
      NemuImageMetadataPolicy.validateHeader(crafted, policy)
    }
  }

  @Test
  fun rejectsAnimatedOrUnboundedContainersBeforeNativeDecode() {
    assertThrows(IOException::class.java) {
      NemuImageMetadataPolicy.validateHeader(gif(1_000, 1_000, frameCount = 2), policy)
    }
    assertThrows(IOException::class.java) {
      NemuImageMetadataPolicy.validateHeader(
        gif(1_000, 1_000),
        policy,
        completeFile = false
      )
    }
    assertThrows(IOException::class.java) {
      NemuImageMetadataPolicy.validateHeader(
        webp(1_000, 1_000).apply { this[20] = 0x02 },
        policy
      )
    }
  }

  @Test
  fun requiresBothOptionalPolicyFieldsAndCapsCallerControlledLimits() {
    assertEquals(null, NemuImageMetadataPolicy.requestedPolicy(null, null))
    assertEquals(policy, NemuImageMetadataPolicy.requestedPolicy(16_384, 8 * 1_024 * 1_024))
    assertThrows(IOException::class.java) {
      NemuImageMetadataPolicy.requestedPolicy(16_384, null)
    }
    assertThrows(IOException::class.java) {
      NemuImageMetadataPolicy.requestedPolicy(16_385, 8 * 1_024 * 1_024)
    }
    assertThrows(IOException::class.java) {
      NemuImageMetadataPolicy.requestedPolicy(16_384, 8 * 1_024 * 1_024 + 1)
    }
  }

  @Test
  fun failsClosedOnMalformedTruncatedAndUnsupportedHeaders() {
    listOf(
      png(0, 100),
      byteArrayOf(0xff.toByte(), 0xd8.toByte()),
      ByteArray(24)
    ).forEach { header ->
      assertThrows(IOException::class.java) {
        NemuImageMetadataPolicy.validateHeader(header, policy)
      }
    }
  }

  private fun png(width: Int, height: Int): ByteArray {
    return ByteArray(24).apply {
      setBytes(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
      setAscii(12, "IHDR")
      setBe32(16, width)
      setBe32(20, height)
    }
  }

  private fun gif(width: Int, height: Int, frameCount: Int = 1): ByteArray {
    return ByteArray(13 + 6 + frameCount * 14 + 1).apply {
      setAscii(0, "GIF89a")
      this[6] = width.toByte()
      this[7] = (width ushr 8).toByte()
      this[8] = height.toByte()
      this[9] = (height ushr 8).toByte()
      this[10] = 0x80.toByte() // Two-entry global color table.
      var offset = 19
      repeat(frameCount) {
        this[offset] = 0x2c
        this[offset + 5] = width.toByte()
        this[offset + 6] = (width ushr 8).toByte()
        this[offset + 7] = height.toByte()
        this[offset + 8] = (height ushr 8).toByte()
        this[offset + 10] = 0x02 // LZW minimum code size.
        this[offset + 11] = 0x01 // One compressed data byte.
        this[offset + 12] = 0x00
        this[offset + 13] = 0x00 // Data terminator.
        offset += 14
      }
      this[offset] = 0x3b
    }
  }

  private fun jpeg(width: Int, height: Int): ByteArray {
    return byteArrayOf(
      0xff.toByte(), 0xd8.toByte(),
      0xff.toByte(), 0xe0.toByte(), 0x00, 0x04, 0x00, 0x00,
      0xff.toByte(), 0xc2.toByte(), 0x00, 0x07, 0x08,
      (height ushr 8).toByte(), height.toByte(),
      (width ushr 8).toByte(), width.toByte()
    )
  }

  private fun webp(width: Int, height: Int): ByteArray {
    return ByteArray(30).apply {
      setAscii(0, "RIFF")
      setAscii(8, "WEBP")
      setAscii(12, "VP8X")
      setLe24(24, width - 1)
      setLe24(27, height - 1)
    }
  }

  private fun isoImage(brand: String, dimensions: List<Pair<Int, Int>>): ByteArray {
    val ftypSize = 24
    return ByteArray(ftypSize + dimensions.size * 20).apply {
      setBe32(0, ftypSize)
      setAscii(4, "ftyp")
      setAscii(8, brand)
      setAscii(16, "mif1")
      setAscii(20, brand)
      dimensions.forEachIndexed { index, (width, height) ->
        val offset = ftypSize + index * 20
        setBe32(offset, 20)
        setAscii(offset + 4, "ispe")
        setBe32(offset + 12, width)
        setBe32(offset + 16, height)
      }
    }
  }

  private fun ByteArray.setAscii(offset: Int, value: String) {
    value.forEachIndexed { index, character ->
      this[offset + index] = character.code.toByte()
    }
  }

  private fun ByteArray.setBytes(offset: Int, vararg values: Int) {
    values.forEachIndexed { index, value -> this[offset + index] = value.toByte() }
  }

  private fun ByteArray.setBe32(offset: Int, value: Int) {
    this[offset] = (value ushr 24).toByte()
    this[offset + 1] = (value ushr 16).toByte()
    this[offset + 2] = (value ushr 8).toByte()
    this[offset + 3] = value.toByte()
  }

  private fun ByteArray.setLe24(offset: Int, value: Int) {
    this[offset] = value.toByte()
    this[offset + 1] = (value ushr 8).toByte()
    this[offset + 2] = (value ushr 16).toByte()
  }
}
