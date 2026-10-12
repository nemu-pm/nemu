package pm.nemu.mobile.aidoku

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class AidokuSandboxCancellationTest {
  private fun assertPreempted(block: () -> Unit) {
    try {
      block()
      fail("expected the operation to be preempted")
    } catch (error: IllegalStateException) {
      assertEquals(AidokuSandboxCancellation.PREEMPTED_MESSAGE, error.message)
    }
  }

  @Test
  fun takesAndStripsWellFormedTokens() {
    val operation = JSONObject("""{"kind":"chapters","cancelToken":"op-12_ab"}""")
    assertEquals("op-12_ab", AidokuSandboxCancellation.takeToken(operation))
    assertFalse(operation.has("cancelToken"))
    assertEquals("chapters", operation.getString("kind"))

    val hostile = JSONObject("""{"kind":"details","cancelToken":"a\"b"}""")
    assertNull(AidokuSandboxCancellation.takeToken(hostile))
    assertFalse(hostile.has("cancelToken"))
    assertNull(AidokuSandboxCancellation.takeToken(JSONObject("""{"cancelToken":7}""")))
    assertNull(
      AidokuSandboxCancellation.takeToken(JSONObject(mapOf("cancelToken" to "a".repeat(129))))
    )
  }

  @Test
  fun cancelBeforeStartStopsTheOperation() {
    val cancellation = AidokuSandboxCancellation {}
    cancellation.cancel("t1")
    assertPreempted { cancellation.throwIfCancelled("t1") }
    assertPreempted { cancellation.beginHttp("t1", 1) }
    cancellation.finish("t1")
    assertFalse(cancellation.isCancelled("t1"))
  }

  @Test
  fun cancelReachesTheInFlightRequest() {
    val cancelled = mutableListOf<String>()
    val cancellation = AidokuSandboxCancellation { cancelled += it }
    assertEquals("aidoku-op-t2-3", cancellation.beginHttp("t2", 3))
    cancellation.cancel("t2")
    assertEquals(listOf("aidoku-op-t2-3"), cancelled)
    cancellation.endHttp("t2")
    assertPreempted { cancellation.throwIfCancelled("t2") }
    cancellation.cancel("t2")
    assertEquals(1, cancelled.size)
  }

  @Test
  fun untokenedOperationsAreNeverCancelled() {
    val cancellation = AidokuSandboxCancellation {}
    assertFalse(cancellation.isCancelled(null))
    assertNull(cancellation.beginHttp(null, 1))
  }

  @Test
  fun rememberedCancellationsAreBounded() {
    val cancellation = AidokuSandboxCancellation {}
    repeat(AidokuSandboxCancellation.MAX_REMEMBERED_CANCELLATIONS + 10) {
      cancellation.cancel("never-started-$it")
    }
    assertFalse(cancellation.isCancelled("never-started-0"))
    assertTrue(
      cancellation.isCancelled(
        "never-started-${AidokuSandboxCancellation.MAX_REMEMBERED_CANCELLATIONS + 9}"
      )
    )
  }
}
