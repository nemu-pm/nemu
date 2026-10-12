package pm.nemu.mobile.aidoku

import androidx.javascriptengine.EvaluationFailedException
import androidx.javascriptengine.EvaluationResultSizeLimitExceededException
import androidx.javascriptengine.IsolateTerminatedException
import androidx.javascriptengine.MemoryLimitExceededException
import androidx.javascriptengine.SandboxDeadException
import java.util.concurrent.CompletableFuture
import java.util.concurrent.Future
import org.json.JSONArray
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/**
 * Engine bookkeeping against a scripted isolate. The real V8 behaviour
 * (hostile scripts, termination, heap ceiling) is covered on a device by
 * NemuAidokuIsolatedJsEngineInstrumentedTest.
 */
class NemuAidokuIsolatedJsEngineTest {
  private class FakeIsolate(
    private val respond: (String) -> Future<String>
  ) : NemuAidokuJsIsolate {
    val scripts = mutableListOf<String>()
    var closed = false
    val pending = mutableListOf<CompletableFuture<String>>()

    override fun evaluateAsync(script: String): Future<String> {
      check(!closed) { "evaluated a closed isolate" }
      scripts += script
      return respond(script)
    }

    override fun close() {
      closed = true
    }
  }

  private class FakeFactory(
    private val respond: (String) -> Future<String>
  ) : NemuAidokuJsIsolateFactory {
    val created = mutableListOf<FakeIsolate>()
    var heapBytes = 0L
    var resultBytes = 0

    override fun create(maxHeapBytes: Long, maxResultBytes: Int): NemuAidokuJsIsolate {
      heapBytes = maxHeapBytes
      resultBytes = maxResultBytes
      return FakeIsolate(respond).also { created += it }
    }
  }

  private fun done(value: String): Future<String> = CompletableFuture.completedFuture(value)

  /** The source text of an EVAL request, as the engine hands it to the helper. */
  private fun unwrap(script: String): String {
    val prefix = NemuAidokuIsolatedJsEngine.RUN_HELPER + "("
    if (!script.startsWith(prefix) || !script.endsWith(")")) return script
    return JSONArray("[" + script.substring(prefix.length, script.length - 1) + "]").getString(0)
  }

  private fun failed(error: Throwable): Future<String> =
    CompletableFuture<String>().apply { completeExceptionally(error) }

  private fun echoFactory() = FakeFactory { script ->
    if (script == PREPARE) done("") else done("ok:" + unwrap(script))
  }

  private fun failure(block: () -> Unit): NemuAidokuIsolatedJsEngine.Failure? = try {
    block()
    null
  } catch (error: NemuAidokuIsolatedJsEngine.FailureException) {
    error.failure
  }

  private val eval = NemuAidokuIsolatedJsEngine.Kind.EVAL
  private val PREPARE = NemuAidokuIsolatedJsEngine.PREPARE_CONTEXT

  @Test
  fun wireKindsMatchTheSandboxProtocol() {
    assertEquals(NemuAidokuIsolatedJsEngine.Kind.EVAL, NemuAidokuIsolatedJsEngine.Kind.fromWire("eval"))
    assertEquals(
      NemuAidokuIsolatedJsEngine.Kind.EVAL_ASYNC,
      NemuAidokuIsolatedJsEngine.Kind.fromWire("eval-async")
    )
    assertEquals(NemuAidokuIsolatedJsEngine.Kind.GET, NemuAidokuIsolatedJsEngine.Kind.fromWire("get"))
    assertNull(NemuAidokuIsolatedJsEngine.Kind.fromWire("Eval"))
    assertNull(NemuAidokuIsolatedJsEngine.Kind.fromWire(null))
  }

  @Test
  fun limitsMirrorTheSandboxAndIOSCaps() {
    assertEquals(16, NEMU_AIDOKU_JS_MAX_CONTEXTS)
    assertEquals(64, NEMU_AIDOKU_JS_MAX_EVALUATIONS)
    assertEquals(1024 * 1024, NEMU_AIDOKU_JS_MAX_SCRIPT_LENGTH)
    assertEquals(4 * 1024 * 1024, NEMU_AIDOKU_JS_MAX_RESULT_LENGTH)
    assertEquals(5_000L, NEMU_AIDOKU_JS_EVALUATION_TIMEOUT_MS)
  }

  @Test
  fun eachContextIsItsOwnIsolateStrippedBeforeTheSourceRuns() {
    val factory = echoFactory()
    val engine = NemuAidokuIsolatedJsEngine(factory)

    assertEquals("ok:1", engine.evaluate(1, eval, "1", 1_000))
    assertEquals("ok:2", engine.evaluate(1, eval, "2", 1_000))
    assertEquals("ok:3", engine.evaluate(2, eval, "3", 1_000))

    assertEquals(2, factory.created.size)
    assertEquals(2, engine.openContextCount)
    assertEquals(listOf(PREPARE, "1", "2"), factory.created[0].scripts.map(::unwrap))
    assertEquals(listOf(PREPARE, "3"), factory.created[1].scripts.map(::unwrap))
    assertEquals(
      "__nemuEvaluate(\"1\")",
      factory.created[0].scripts[1]
    )
    assertEquals(NEMU_AIDOKU_JS_CONTEXT_HEAP_BYTES, factory.heapBytes)
    assertTrue(factory.resultBytes >= NEMU_AIDOKU_JS_MAX_RESULT_LENGTH * 3)

    engine.close()
    assertTrue(factory.created.all { it.closed })
    assertEquals(0, engine.openContextCount)
    assertEquals(NemuAidokuIsolatedJsEngine.Failure.DISABLED, failure { engine.evaluate(1, eval, "1", 1_000) })
  }

  @Test
  fun requestLimitsAreCheckedBeforeAnIsolateIsCreated() {
    val factory = echoFactory()
    val engine = NemuAidokuIsolatedJsEngine(
      factory,
      NemuAidokuIsolatedJsEngine.Limits(maxContexts = 2, maxScriptLength = 64, maxResultLength = 16)
    )
    assertEquals(
      NemuAidokuIsolatedJsEngine.Failure.TOO_MANY_CONTEXTS,
      failure { engine.evaluate(3, eval, "1", 1_000) }
    )
    assertEquals(
      NemuAidokuIsolatedJsEngine.Failure.INVALID_REQUEST,
      failure { engine.evaluate(0, eval, "1", 1_000) }
    )
    assertEquals(
      NemuAidokuIsolatedJsEngine.Failure.SCRIPT_TOO_LARGE,
      failure { engine.evaluate(1, eval, "1".repeat(65), 1_000) }
    )
    assertTrue(factory.created.isEmpty())

    // "ok:" + 14 characters = 17 > 16.
    assertEquals(
      NemuAidokuIsolatedJsEngine.Failure.RESULT_TOO_LARGE,
      failure { engine.evaluate(1, eval, "x".repeat(14), 1_000) }
    )
    assertTrue(factory.created.single().closed)
    engine.close()
  }

  @Test
  fun aThrownScriptIsUndefinedAndTheContextStaysUsable() {
    val factory = FakeFactory { script ->
      when (unwrap(script)) {
        PREPARE -> done("")
        "throw 1" -> failed(EvaluationFailedException("Uncaught 1"))
        else -> done(unwrap(script))
      }
    }
    val engine = NemuAidokuIsolatedJsEngine(factory)
    assertEquals("undefined", engine.evaluate(1, eval, "throw 1", 1_000))
    assertEquals("after", engine.evaluate(1, eval, "after", 1_000))
    assertFalse(factory.created.single().closed)
    engine.close()
  }

  @Test
  fun getReadsAQuotedGlobalName() {
    val factory = echoFactory()
    val engine = NemuAidokuIsolatedJsEngine(factory)
    assertEquals(
      "ok:String(globalThis[\"a\\\"]; evil()//\"])",
      engine.evaluate(1, NemuAidokuIsolatedJsEngine.Kind.GET, "a\"]; evil()//", 1_000)
    )
    engine.close()
  }

  @Test
  fun asyncReadsTheParkedSlotAndTreatsPendingAsMissing() {
    var settled = "1" + "42"
    val factory = FakeFactory { script ->
      when {
        script == PREPARE -> done("")
        script.startsWith("(async () =>") -> done("")
        script.contains("delete globalThis.__nemuAsync_") -> done(settled)
        else -> throw AssertionError("unexpected script $script")
      }
    }
    val engine = NemuAidokuIsolatedJsEngine(factory)
    val async = NemuAidokuIsolatedJsEngine.Kind.EVAL_ASYNC
    assertEquals("42", engine.evaluate(1, async, "p", 1_000))
    settled = "1"
    assertEquals("", engine.evaluate(1, async, "p", 1_000))
    settled = "0"
    assertNull(engine.evaluate(1, async, "p", 1_000))

    val scripts = factory.created.single().scripts
    val slots = scripts.filter { it.startsWith("(async") }
      .map { Regex("__nemuAsync_[0-9a-f]{32}").find(it)!!.value }
    assertEquals("every async evaluation gets its own slot", 3, slots.toSet().size)
    engine.close()
  }

  @Test
  fun aScriptPastItsDeadlineTerminatesItsIsolateAndPoisonsTheEngine() {
    val never = CompletableFuture<String>()
    val factory = FakeFactory { script ->
      when (unwrap(script)) {
        PREPARE -> done("")
        "while (true) {}" -> never
        else -> done(unwrap(script))
      }
    }
    val engine = NemuAidokuIsolatedJsEngine(factory)
    assertEquals("warm", engine.evaluate(2, eval, "warm", 1_000))

    val started = System.nanoTime()
    assertEquals(
      NemuAidokuIsolatedJsEngine.Failure.TIMED_OUT,
      failure { engine.evaluate(1, eval, "while (true) {}", 200) }
    )
    val elapsedMs = (System.nanoTime() - started) / 1_000_000
    assertTrue("deadline enforced ($elapsedMs ms)", elapsedMs in 150..2_000)
    assertTrue("the looping isolate is closed", factory.created[1].closed)
    assertTrue("every other isolate is released", factory.created[0].closed)
    assertTrue(never.isCancelled)
    assertEquals(0, engine.openContextCount)
    assertEquals(
      NemuAidokuIsolatedJsEngine.Failure.DISABLED,
      failure { engine.evaluate(3, eval, "1", 1_000) }
    )
    assertEquals(2, factory.created.size)
  }

  @Test
  fun theDeadlineNeverExceedsTheEngineCap() {
    val never = CompletableFuture<String>()
    val factory = FakeFactory { script ->
      if (script == PREPARE) done("") else never
    }
    val engine = NemuAidokuIsolatedJsEngine(
      factory,
      NemuAidokuIsolatedJsEngine.Limits(evaluationTimeoutMs = 150)
    )
    val started = System.nanoTime()
    assertEquals(
      NemuAidokuIsolatedJsEngine.Failure.TIMED_OUT,
      failure { engine.evaluate(1, eval, "x", 60_000) }
    )
    assertTrue((System.nanoTime() - started) / 1_000_000 < 2_000)
  }

  @Test
  fun heapExhaustionAndTerminationFailTheOperation() {
    for (error in listOf(MemoryLimitExceededException("heap"), IsolateTerminatedException("gone"))) {
      val factory = FakeFactory { script ->
        if (script == PREPARE) done("") else failed(error)
      }
      val engine = NemuAidokuIsolatedJsEngine(factory)
      assertEquals(
        NemuAidokuIsolatedJsEngine.Failure.MEMORY_LIMIT,
        failure { engine.evaluate(1, eval, "bomb", 1_000) }
      )
      assertTrue(factory.created.single().closed)
      assertEquals(NemuAidokuIsolatedJsEngine.Failure.DISABLED, failure { engine.evaluate(1, eval, "1", 1_000) })
    }
  }

  @Test
  fun anOversizedTransferIsAResultLimitFailure() {
    val factory = FakeFactory { script ->
      if (script == PREPARE) done("")
      else failed(EvaluationResultSizeLimitExceededException("big"))
    }
    val engine = NemuAidokuIsolatedJsEngine(factory)
    assertEquals(
      NemuAidokuIsolatedJsEngine.Failure.RESULT_TOO_LARGE,
      failure { engine.evaluate(1, eval, "big", 1_000) }
    )
    assertTrue(factory.created.single().closed)
  }

  @Test
  fun onlyAHeapOverrunReportsTheSandboxAsLost() {
    for (failure in NemuAidokuIsolatedJsEngine.Failure.entries) {
      assertEquals(
        failure.name,
        failure == NemuAidokuIsolatedJsEngine.Failure.MEMORY_LIMIT,
        failure.sandboxLost
      )
    }
  }

  @Test
  fun thePreparedContextPinsTheHelperAndDropsTheBridge() {
    assertTrue(PREPARE.contains("delete globalThis.android"))
    assertTrue(PREPARE.contains("\"${NemuAidokuIsolatedJsEngine.RUN_HELPER}\""))
    assertTrue(PREPARE.contains("writable: false, enumerable: false, configurable: false"))
  }

  @Test
  fun aDeadSandboxPropagatesUnchangedForTheManagerToReset() {
    val dead = SandboxDeadException("dead")
    val factory = FakeFactory { script ->
      if (script == PREPARE) done("") else failed(dead)
    }
    val engine = NemuAidokuIsolatedJsEngine(factory)
    try {
      engine.evaluate(1, eval, "x", 1_000)
      fail("expected the dead sandbox to propagate")
    } catch (error: SandboxDeadException) {
      assertSame(dead, error)
      assertEquals(AidokuSandboxResetScope.SANDBOX_CONNECTION, aidokuSandboxResetScope(error))
    }
    assertTrue(factory.created.single().closed)
  }

  @Test
  fun lockdownScriptCoversEveryFunctionConstructor() {
    val script = NEMU_AIDOKU_SANDBOX_CODEGEN_LOCKDOWN
    for (needle in listOf(
      "seal(globalThis, \"eval\"",
      "seal(globalThis, \"Function\"",
      "async function () {}",
      "function* () {}",
      "async function* () {}",
      "return \"locked\""
    )) {
      assertTrue("lockdown covers $needle", script.contains(needle))
    }
  }
}
