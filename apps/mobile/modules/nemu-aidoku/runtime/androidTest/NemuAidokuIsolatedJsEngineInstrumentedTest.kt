package pm.nemu.mobile.aidoku

import android.annotation.SuppressLint
import android.util.Log
import androidx.javascriptengine.IsolateStartupParameters
import androidx.javascriptengine.JavaScriptIsolate
import androidx.javascriptengine.JavaScriptSandbox
import androidx.test.platform.app.InstrumentationRegistry
import java.util.concurrent.TimeUnit
import org.json.JSONArray
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Test

/**
 * Hostile source scripts against the real AndroidX JavaScriptSandbox: the
 * same isolates, heap ceilings and termination the app uses. Mirrors
 * NemuAidokuIsolatedJSEngineTests.swift and adds what only Android can prove
 * (termination at the deadline, a contained heap bomb).
 */
class NemuAidokuIsolatedJsEngineInstrumentedTest {
  private companion object {
    const val TAG = "NemuJsEngineTest"
  }

  private lateinit var sandbox: JavaScriptSandbox
  private val engines = mutableListOf<NemuAidokuIsolatedJsEngine>()

  @Before
  fun connect() {
    assumeTrue("JavaScriptSandbox unsupported on this device", JavaScriptSandbox.isSupported())
    val context = InstrumentationRegistry.getInstrumentation().targetContext
    sandbox = JavaScriptSandbox.createConnectedInstanceAsync(context).get(20, TimeUnit.SECONDS)
    for (feature in listOf(
      JavaScriptSandbox.JS_FEATURE_ISOLATE_TERMINATION,
      JavaScriptSandbox.JS_FEATURE_ISOLATE_MAX_HEAP_SIZE,
      JavaScriptSandbox.JS_FEATURE_PROMISE_RETURN
    )) {
      assumeTrue("missing sandbox feature $feature", sandbox.isFeatureSupported(feature))
    }
  }

  @After
  fun disconnect() {
    engines.forEach { it.close() }
    if (::sandbox.isInitialized) sandbox.close()
  }

  private fun engine(
    limits: NemuAidokuIsolatedJsEngine.Limits = NemuAidokuIsolatedJsEngine.Limits()
  ): NemuAidokuIsolatedJsEngine =
    NemuAidokuIsolatedJsEngine(NemuAidokuSandboxJsIsolateFactory { sandbox }, limits)
      .also { engines += it }

  private fun NemuAidokuIsolatedJsEngine.eval(
    script: String,
    context: Int = 1,
    kind: NemuAidokuIsolatedJsEngine.Kind = NemuAidokuIsolatedJsEngine.Kind.EVAL
  ): String? = evaluate(context, kind, script, 5_000)

  private fun failure(block: () -> Unit): NemuAidokuIsolatedJsEngine.Failure? = try {
    block()
    null
  } catch (error: NemuAidokuIsolatedJsEngine.FailureException) {
    error.failure
  }

  @SuppressLint("RequiresFeature")
  private fun plainIsolate(): JavaScriptIsolate =
    sandbox.createIsolate(IsolateStartupParameters().apply { maxHeapSizeBytes = 64L shl 20 })

  @Test
  fun copymangaListLiteralParses() {
    // zh.copymanga v21: JsContext::new().eval("JSON.stringify(<list attr>)")
    val engine = engine()
    val literal =
      "[{'name':'\\u9032\\u64ca\\u7684\\u5de8\\u4eba','path_word':'jinjidejuren'," +
        "'author':[{'name':'\\u8aeb\\u5c71\\u5275'}]}]"
    val first = JSONArray(engine.eval("JSON.stringify($literal)")!!).getJSONObject(0)
    assertEquals("進擊的巨人", first.getString("name"))
    assertEquals("jinjidejuren", first.getString("path_word"))
  }

  @Test
  fun aNearCapListingLiteralFitsTheContextHeap() {
    // ~900 KiB of listing entries: the script cap is 1 MiB and every entry
    // must survive parse + stringify under the per-context heap ceiling.
    val entry = "{'name':'\\u9032\\u64ca\\u7684\\u5de8\\u4eba','path_word':'jinjidejuren'," +
      "'author':[{'name':'\\u8aeb\\u5c71\\u5275','path_word':'jianshanchuang'}]," +
      "'cover':'https://example.test/c/jinjidejuren/cover/1.jpg.328x422.jpg'},"
    val count = (900 * 1024) / entry.length
    val literal = "[" + entry.repeat(count).trimEnd(',') + "]"
    val engine = engine()
    val parsed = JSONArray(engine.eval("JSON.stringify($literal)")!!)
    assertEquals(count, parsed.length())
    assertEquals("進擊的巨人", parsed.getJSONObject(count - 1).getString("name"))
  }

  @Test
  fun aidokuStringification() {
    val engine = engine()
    assertEquals("3", engine.eval("1 + 2"))
    assertEquals("undefined", engine.eval("undefined"))
    assertEquals("null", engine.eval("null"))
    assertEquals("[object Object]", engine.eval("({})"))
    assertEquals("1,2", engine.eval("[1, 2]"))
    assertEquals("true", engine.eval("true"))
    assertEquals("undefined", engine.eval("throw new Error('boom')"))
    assertEquals("undefined", engine.eval("syntax error here("))
    assertEquals("after", engine.eval("'after'"))
  }

  @Test
  fun contextStatePersistsAndContextsAreIsolated() {
    val engine = engine()
    engine.eval("var token = 'abc'; function sign(x) { return token + x; }", context = 1)
    assertEquals("abc1", engine.eval("sign(1)", context = 1))
    assertEquals("abc", engine.eval("token", 1, NemuAidokuIsolatedJsEngine.Kind.GET))
    assertEquals("undefined", engine.eval("token", 2, NemuAidokuIsolatedJsEngine.Kind.GET))
    assertEquals("undefined", engine.eval("typeof sign", context = 2))
    // Known difference from JavaScriptCore: top-level let/const/class are local
    // to one evaluation (the script runs through the context's global eval).
    // Every shipped Aidoku source (zh.copymanga, zh.dm5, en.mangago) shares
    // state across evaluations only through var/function declarations.
    assertEquals("8", engine.eval("const secret = 7; let counter = 1; secret + counter", context = 1))
    assertEquals("undefined", engine.eval("typeof secret", context = 1))
  }

  @Test
  fun packedScriptsAndAReassignedEvalKeepWorking() {
    val engine = engine()
    // zh.dm5: `eval(function(p,a,c,k,e,d){...}(...))\nJSON.stringify(d)`.
    val packed = "eval(function(p,a,c,k,e,d){return p.replace('X', a)}('var d=[\"https://img/1.jpg\"];', 'unused', 0, [], 0, {}))\nJSON.stringify(d)"
    assertEquals("[\"https://img/1.jpg\"]", engine.eval(packed))
    // en.mangago: a helper function defined by one eval is used by the next.
    engine.eval("function replacePos(s, p, r) { return s.substr(0, p) + r + s.substring(p + 1); }")
    assertEquals("aXc", engine.eval("replacePos('abc', 1, 'X')"))
    // Site scripts sometimes hijack eval; later evaluations are unaffected.
    engine.eval("eval = function () { return 'hijacked'; }; globalThis.String = () => 'hijacked'; 1")
    assertEquals("3", engine.eval("1 + 2"))
    engine.eval("try { __nemuEvaluate = () => 'hijacked'; } catch (e) {} 1")
    engine.eval("try { Object.defineProperty(globalThis, '__nemuEvaluate', { value: () => 'x' }); } catch (e) {} 1")
    assertEquals("4", engine.eval("2 + 2"))
  }

  @Test
  fun monkeyPatchedBuiltInsStayInTheirContext() {
    val engine = engine()
    engine.eval(
      """
        JSON.stringify = () => 'pwned';
        Array.prototype.push = function () { return 'pwned'; };
        Object.defineProperty(Object.prototype, 'headers', { get() { return 'pwned'; } });
        String.prototype.toString = () => 'pwned';
        'patched'
      """.trimIndent(),
      context = 1
    )
    assertEquals("pwned", engine.eval("JSON.stringify({a: 1})", context = 1))
    assertEquals("{\"a\":1}", engine.eval("JSON.stringify({a: 1})", context = 2))
    assertEquals("undefined", engine.eval("typeof ({}).headers", context = 2))

    // A different isolate of the same sandbox process (the WebAssembly
    // runtime's, in the app) never sees the patch either.
    plainIsolate().use { other ->
      assertEquals(
        "{\"a\":1}|1|undefined",
        other.evaluateJavaScriptAsync(
          "JSON.stringify({a: 1}) + '|' + [].push(0) + '|' + typeof ({}).headers"
        ).get(5, TimeUnit.SECONDS)
      )
    }
  }

  @Test
  fun asyncEvaluation() {
    val engine = engine()
    val async = NemuAidokuIsolatedJsEngine.Kind.EVAL_ASYNC
    assertEquals("42", engine.eval("Promise.resolve(41).then((x) => x + 1)", kind = async))
    assertEquals("7", engine.eval("7", kind = async))
    assertNull(engine.eval("Promise.reject(new Error('x'))", kind = async))
    assertNull(engine.eval("new Promise(() => {})", kind = async))
    assertNull(engine.eval("syntax error here(", kind = async))
    assertEquals("", engine.eval("Object.keys(globalThis).join(',')"))
    assertEquals(
      "",
      engine.eval("Object.getOwnPropertyNames(globalThis).filter((n) => n.startsWith('__nemuAsync')).join(',')")
    )
  }

  @Test
  fun noHostCapabilitiesAreReachable() {
    val engine = engine()
    for (name in listOf(
      "android", "NemuAidokuSandbox", "fetch", "XMLHttpRequest", "WebSocket", "window",
      "document", "setTimeout", "setInterval", "setImmediate", "queueMicrotask_host",
      "importScripts", "localStorage", "indexedDB", "require", "process", "postMessage",
      "Worker", "navigator", "location", "caches"
    )) {
      assertEquals("$name is not exposed", "undefined", engine.eval("typeof $name"))
    }
    assertEquals(
      "ReferenceError",
      engine.eval(
        "try { android.consumeNamedDataAsArrayBuffer('aix'); 'reached' } catch (e) { e.name }"
      )
    )
    assertEquals(
      "ReferenceError",
      engine.eval("try { NemuAidokuSandbox.registerSession(); 'reached' } catch (e) { e.name }")
    )
    assertEquals(
      "ReferenceError",
      engine.eval("try { fetch('https://example.com'); 'reached' } catch (e) { e.name }")
    )
    assertEquals(
      "ReferenceError",
      engine.eval("try { setTimeout(() => {}, 0); 'reached' } catch (e) { e.name }")
    )
    // Nothing the source adds to its global leaks into a sibling context.
    engine.eval("globalThis.android = { consumeNamedDataAsArrayBuffer() { return 'fake'; } }", context = 3)
    assertEquals("undefined", engine.eval("typeof android", context = 4))
  }

  @Test
  fun anInfiniteLoopIsTerminatedAtTheDeadline() {
    val engine = engine(NemuAidokuIsolatedJsEngine.Limits(evaluationTimeoutMs = 500))
    assertEquals("warm", engine.eval("'warm'", context = 2))
    val started = System.nanoTime()
    assertEquals(
      NemuAidokuIsolatedJsEngine.Failure.TIMED_OUT,
      failure { engine.evaluate(1, NemuAidokuIsolatedJsEngine.Kind.EVAL, "while (true) {}", 60_000) }
    )
    val elapsedMs = (System.nanoTime() - started) / 1_000_000
    Log.i(TAG, "infinite loop terminated after $elapsedMs ms (deadline 500 ms)")
    assertTrue("deadline enforced ($elapsedMs ms)", elapsedMs < 2_000)
    assertEquals(0, engine.openContextCount)
    assertEquals(
      NemuAidokuIsolatedJsEngine.Failure.DISABLED,
      failure { engine.eval("1") }
    )
    // The loop was terminated, not abandoned: the sandbox process is healthy
    // and a fresh engine runs immediately.
    assertEquals("2", engine().eval("1 + 1"))
  }

  @Test
  fun anAsyncLoopIsTerminatedAtTheDeadline() {
    val engine = engine(NemuAidokuIsolatedJsEngine.Limits(evaluationTimeoutMs = 500))
    assertEquals(
      NemuAidokuIsolatedJsEngine.Failure.TIMED_OUT,
      failure {
        engine.evaluate(
          1,
          NemuAidokuIsolatedJsEngine.Kind.EVAL_ASYNC,
          "(async () => { for (;;) { await null; } })()",
          60_000
        )
      }
    )
    assertEquals("ok", engine().eval("'ok'"))
  }

  @Test
  fun aHeapBombStopsAtTheCeilingWithoutTakingTheAppDown() {
    val engine = engine()
    assertEquals("ok", engine.eval("'ok'", context = 2))
    val started = System.nanoTime()
    assertEquals(
      NemuAidokuIsolatedJsEngine.Failure.MEMORY_LIMIT,
      failure { engine.eval("const a = []; for (;;) { a.push({ x: 'y'.repeat(1024) + a.length }); }") }
    )
    assertTrue(NemuAidokuIsolatedJsEngine.Failure.MEMORY_LIMIT.sandboxLost)
    val elapsedMs = (System.nanoTime() - started) / 1_000_000
    Log.i(TAG, "heap bomb stopped at the ceiling after $elapsedMs ms")
    assertTrue("stopped promptly", elapsedMs < 5_000)
    assertEquals(0, engine.openContextCount)
    // AndroidX kills the sandbox process on an isolate OOM. This (app-side)
    // process is untouched, and a reconnected sandbox is immediately usable,
    // which is what AidokuSandboxManager does after MEMORY_LIMIT.
    val context = InstrumentationRegistry.getInstrumentation().targetContext
    sandbox.close()
    sandbox = JavaScriptSandbox.createConnectedInstanceAsync(context).get(20, TimeUnit.SECONDS)
    assertEquals("2", engine().eval("1 + 1"))
  }

  @Test
  fun anArrayBufferBombIsBounded() {
    val engine = engine()
    val outcome = try {
      engine.eval(
        "const b = []; try { for (;;) { b.push(new Uint8Array(8 << 20).fill(1)); } } " +
          "catch (e) { e.name + ':' + b.length }"
      )
    } catch (error: NemuAidokuIsolatedJsEngine.FailureException) {
      error.failure.name
    }
    Log.i(TAG, "array buffer bomb outcome: $outcome")
    // Either the allocator refuses the buffer inside the script, or the
    // isolate is stopped at its ceiling; it never grows without bound.
    val refused = outcome?.startsWith("RangeError:") == true &&
      outcome.substringAfter(':').toInt() * 8 <= 512
    assertTrue(
      "array buffer bomb bounded: $outcome",
      refused || outcome == NemuAidokuIsolatedJsEngine.Failure.MEMORY_LIMIT.name
    )
  }

  @Test
  fun aHugeResultIsRejected() {
    val engine = engine(NemuAidokuIsolatedJsEngine.Limits(maxResultLength = 1024))
    assertEquals(
      NemuAidokuIsolatedJsEngine.Failure.RESULT_TOO_LARGE,
      failure { engine.eval("'x'.repeat(1025)") }
    )
    val transport = engine(NemuAidokuIsolatedJsEngine.Limits(maxResultLength = 1024))
    assertEquals(
      NemuAidokuIsolatedJsEngine.Failure.RESULT_TOO_LARGE,
      failure { transport.eval("'x'.repeat(64 * 1024)") }
    )
  }

  @Test
  fun contextCapIsEnforced() {
    val engine = engine()
    for (id in 1..NEMU_AIDOKU_JS_MAX_CONTEXTS) assertEquals("$id", engine.eval("$id", context = id))
    assertEquals(NEMU_AIDOKU_JS_MAX_CONTEXTS, engine.openContextCount)
    assertEquals(
      NemuAidokuIsolatedJsEngine.Failure.TOO_MANY_CONTEXTS,
      failure { engine.eval("1", context = NEMU_AIDOKU_JS_MAX_CONTEXTS + 1) }
    )
    engine.close()
    assertEquals(0, engine.openContextCount)
  }

  @Test
  fun codegenLockdownDisablesEvalWithoutBreakingFunctions() {
    plainIsolate().use { isolate ->
      fun run(script: String) = isolate.evaluateJavaScriptAsync(script).get(5, TimeUnit.SECONDS)
      run("globalThis.before = (0, eval)('6 * 7'); ''")
      assertEquals("locked", run(NEMU_AIDOKU_SANDBOX_CODEGEN_LOCKDOWN))
      assertEquals(
        "EvalError|EvalError|EvalError|EvalError|TypeError",
        run(
          """
            [
              () => eval('1'),
              () => Function('return 1')(),
              () => (async () => {}).constructor('return 1'),
              () => Object.getPrototypeOf(function* () {}).constructor('yield 1'),
              () => { "use strict"; globalThis.eval = (s) => s; return eval('1'); },
            ].map((f) => { try { f(); return 'reached'; } catch (e) { return e.name; } }).join('|')
          """.trimIndent()
        )
      )
      assertEquals(
        "42|true|true|3|function",
        run(
          "[before, (() => {}) instanceof Function, (async () => {}) instanceof Function, " +
            "Math.max.apply(null, [1, 3, 2]), typeof Function.prototype.bind].join('|')"
        )
      )
      assertEquals("wasm", run(
        "WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0])) ? 'wasm' : 'no'"
      ))
    }
  }
}
