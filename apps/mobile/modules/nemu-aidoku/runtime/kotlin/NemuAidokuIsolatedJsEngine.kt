package pm.nemu.mobile.aidoku

// Compiled into the Android module from the tracked cross-runtime source tree.

import androidx.javascriptengine.EvaluationFailedException
import androidx.javascriptengine.EvaluationResultSizeLimitExceededException
import androidx.javascriptengine.IsolateStartupParameters
import androidx.javascriptengine.IsolateTerminatedException
import androidx.javascriptengine.JavaScriptIsolate
import androidx.javascriptengine.JavaScriptSandbox
import androidx.javascriptengine.MemoryLimitExceededException
import androidx.javascriptengine.SandboxDeadException
import java.util.UUID
import java.util.concurrent.CancellationException
import java.util.concurrent.ExecutionException
import java.util.concurrent.Future
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException
import org.json.JSONObject

// Mirrors MAX_SANDBOX_JS_* in runtime/aidokuSandboxJs.ts and the iOS
// NemuAidokuIsolatedJSEngine limits.
internal const val NEMU_AIDOKU_JS_MAX_CONTEXTS = 16
internal const val NEMU_AIDOKU_JS_MAX_EVALUATIONS = 64
internal const val NEMU_AIDOKU_JS_MAX_SCRIPT_LENGTH = 1024 * 1024
internal const val NEMU_AIDOKU_JS_MAX_RESULT_LENGTH = 4 * 1024 * 1024
internal const val NEMU_AIDOKU_JS_EVALUATION_TIMEOUT_MS = 5_000L
// V8 heap per source context. zh.copymanga's largest listing literal is well
// under the 1 MiB script cap; parsing and stringifying it needs a few MiB.
internal const val NEMU_AIDOKU_JS_CONTEXT_HEAP_BYTES = 16L * 1024L * 1024L

/** One isolated engine instance per source JS context. */
internal interface NemuAidokuJsIsolate : AutoCloseable {
  fun evaluateAsync(script: String): Future<String>
  override fun close()
}

internal fun interface NemuAidokuJsIsolateFactory {
  fun create(maxHeapBytes: Long, maxResultBytes: Int): NemuAidokuJsIsolate
}

/** Real isolates: separate V8 isolates inside the app's JavaScriptSandbox. */
internal class NemuAidokuSandboxJsIsolateFactory(
  private val sandbox: () -> JavaScriptSandbox
) : NemuAidokuJsIsolateFactory {
  // JS_FEATURE_ISOLATE_MAX_HEAP_SIZE and JS_FEATURE_ISOLATE_TERMINATION are
  // mandatory features of the sandbox connection (AidokuSandboxManager).
  @android.annotation.SuppressLint("RequiresFeature")
  override fun create(maxHeapBytes: Long, maxResultBytes: Int): NemuAidokuJsIsolate {
    val startup = IsolateStartupParameters().apply {
      maxHeapSizeBytes = maxHeapBytes
      maxEvaluationReturnSizeBytes = maxResultBytes
    }
    val isolate = sandbox().createIsolate(startup)
    return object : NemuAidokuJsIsolate {
      private val delegate: JavaScriptIsolate = isolate
      override fun evaluateAsync(script: String): Future<String> =
        delegate.evaluateJavaScriptAsync(script)
      override fun close() = delegate.close()
    }
  }
}

/**
 * Evaluates Aidoku source scripts (`aidoku::imports::js::JsContext`) outside
 * the sandbox isolate that runs the WebAssembly source and holds the `android`
 * data bridge and `NemuAidokuSandbox`, with Aidoku iOS semantics.
 *
 * Every source context is its own V8 isolate (its own heap and globals) in
 * the JavaScriptSandbox process. Nothing is provided to it: no named data, no
 * message ports, no console callback, and the sandbox's `android` global is
 * deleted before the source's first script runs. A bare isolate has only the
 * ECMAScript built-ins (plus WebAssembly): no fetch/XMLHttpRequest, no timers,
 * no storage. Each isolate is created with a heap ceiling, and a script that
 * outlives its deadline is stopped by closing its isolate, which terminates
 * the running evaluation (JS_FEATURE_ISOLATE_TERMINATION). One engine lives for
 * one sandbox operation; `close()` releases every isolate it opened.
 *
 * Confined to the manager's single executor thread; not thread-safe.
 */
internal class NemuAidokuIsolatedJsEngine(
  private val factory: NemuAidokuJsIsolateFactory,
  private val limits: Limits = Limits()
) : AutoCloseable {
  enum class Kind(val wire: String) {
    EVAL("eval"),
    EVAL_ASYNC("eval-async"),
    GET("get");

    companion object {
      fun fromWire(value: String?): Kind? = entries.firstOrNull { it.wire == value }
    }
  }

  /** Same cases and messages as the iOS engine, plus the heap ceiling. */
  enum class Failure(val code: String, val detail: String) {
    DISABLED(
      "disabled",
      "Source JavaScript evaluation was stopped for this operation."
    ),
    INVALID_REQUEST("invalid-request", "The Aidoku JavaScript request is invalid."),
    TOO_MANY_CONTEXTS("too-many-contexts", "Aidoku source exceeded the JavaScript context limit."),
    SCRIPT_TOO_LARGE("script-too-large", "Aidoku source script exceeds the safety limit."),
    RESULT_TOO_LARGE("result-too-large", "Aidoku JavaScript result exceeds the safety limit."),
    TIMED_OUT("timed-out", "Aidoku source script exceeded its time limit."),
    MEMORY_LIMIT("memory-limit", "Aidoku source script exceeded its memory limit.");

    /** The sandbox process is gone; reconnect before the next operation. */
    val sandboxLost: Boolean
      get() = this == MEMORY_LIMIT
  }

  class FailureException(val failure: Failure, cause: Throwable? = null) :
    IllegalStateException(failure.detail, cause)

  data class Limits(
    val maxContexts: Int = NEMU_AIDOKU_JS_MAX_CONTEXTS,
    val maxScriptLength: Int = NEMU_AIDOKU_JS_MAX_SCRIPT_LENGTH,
    val maxResultLength: Int = NEMU_AIDOKU_JS_MAX_RESULT_LENGTH,
    val evaluationTimeoutMs: Long = NEMU_AIDOKU_JS_EVALUATION_TIMEOUT_MS,
    val contextHeapBytes: Long = NEMU_AIDOKU_JS_CONTEXT_HEAP_BYTES
  ) {
    // UTF-16 units become at most three UTF-8 bytes on the Binder transport;
    // the exact character cap is enforced after the transfer.
    val maxResultBytes: Int
      get() = (maxResultLength.toLong() * 3L + 64L).coerceAtMost(Int.MAX_VALUE.toLong()).toInt()
  }

  private val contexts = HashMap<Int, NemuAidokuJsIsolate>()
  private var poisoned = false
  private var closed = false

  val openContextCount: Int
    get() = contexts.size

  /**
   * Evaluate one source request. Returns the stringified result, or null for
   * Aidoku's `MissingResult`. Throws [FailureException] when the request breaks
   * a limit; the operation must then fail. Other exceptions (a dead sandbox
   * connection) propagate unchanged so the manager can reset its runtime.
   */
  fun evaluate(contextId: Int, kind: Kind, script: String, timeoutMs: Long): String? {
    if (poisoned || closed) throw FailureException(Failure.DISABLED)
    if (contextId < 1) throw FailureException(Failure.INVALID_REQUEST)
    if (contextId > limits.maxContexts) throw FailureException(Failure.TOO_MANY_CONTEXTS)
    if (script.length > limits.maxScriptLength) throw FailureException(Failure.SCRIPT_TOO_LARGE)

    val deadline = System.nanoTime() +
      TimeUnit.MILLISECONDS.toNanos(timeoutMs.coerceIn(10L, limits.evaluationTimeoutMs))
    val isolate = context(contextId, deadline)
    val output = when (kind) {
      // IsolatedJSContext.evaluateScript: `evaluateScript(script)?.toString()`.
      // The sandbox returns only string completion values (anything else is
      // ""), so the script goes through the context's own global eval and the
      // completion value is stringified in the context. `var` and function
      // declarations persist on the context's global, as with JavaScriptCore;
      // top-level `let`/`const`/`class` are local to that one evaluation. A
      // thrown script is `undefined`, as JavaScriptCore reports it.
      Kind.EVAL -> run(
        contextId,
        isolate,
        "$RUN_HELPER(${JSONObject.quote(script)})",
        deadline
      ) ?: "undefined"
      // IsolatedJSContext.objectForKeyedSubscript: a global property, stringified.
      Kind.GET -> run(
        contextId,
        isolate,
        "String(globalThis[${JSONObject.quote(script)}])",
        deadline
      ) ?: "undefined"
      Kind.EVAL_ASYNC -> runAsync(contextId, isolate, script, deadline)
    }
    if (output != null && output.length > limits.maxResultLength) {
      poison()
      throw FailureException(Failure.RESULT_TOO_LARGE)
    }
    return output
  }

  /** Terminate and release every isolate. Safe to call more than once. */
  override fun close() {
    closed = true
    releaseAll()
  }

  private fun context(contextId: Int, deadline: Long): NemuAidokuJsIsolate {
    contexts[contextId]?.let { return it }
    val isolate = factory.create(limits.contextHeapBytes, limits.maxResultBytes)
    contexts[contextId] = isolate
    // The sandbox installs an `android` global (named data / message ports) in
    // every isolate. This isolate is given neither, but drop the object so the
    // source's scripts see only ECMAScript built-ins, as on iOS. The same
    // script pins the evaluation helper before any source script can run.
    run(contextId, isolate, PREPARE_CONTEXT, deadline)
    return isolate
  }

  /**
   * Evaluate and wait until [deadline]. Returns null when the script threw.
   * Anything that ends the isolate fails the operation and poisons the engine.
   */
  private fun run(
    contextId: Int,
    isolate: NemuAidokuJsIsolate,
    script: String,
    deadline: Long
  ): String? {
    val future = isolate.evaluateAsync(script)
    try {
      val remaining = deadline - System.nanoTime()
      if (remaining <= 0) throw TimeoutException()
      return future.get(remaining, TimeUnit.NANOSECONDS)
    } catch (error: TimeoutException) {
      // Closing the isolate terminates the running script in the sandbox
      // process (JS_FEATURE_ISOLATE_TERMINATION); nothing keeps spinning.
      future.cancel(true)
      terminate(contextId)
      throw FailureException(Failure.TIMED_OUT, error)
    } catch (error: ExecutionException) {
      val cause = error.cause ?: error
      return when (cause) {
        is EvaluationFailedException -> null
        is EvaluationResultSizeLimitExceededException -> {
          terminate(contextId)
          throw FailureException(Failure.RESULT_TOO_LARGE, cause)
        }
        is SandboxDeadException -> {
          terminate(contextId)
          throw cause
        }
        // AndroidX kills the whole sandbox process when any isolate exhausts
        // its heap ("isolate exceeded its heap memory limit - killing
        // sandbox"): the WebAssembly isolate goes with it, and the manager must
        // reconnect ([Failure.MEMORY_LIMIT] carries that contract).
        is MemoryLimitExceededException -> {
          terminate(contextId)
          throw FailureException(Failure.MEMORY_LIMIT, cause)
        }
        is IsolateTerminatedException -> {
          // Heap exhaustion is reported as a bare termination on some builds.
          terminate(contextId)
          throw FailureException(Failure.MEMORY_LIMIT, cause)
        }
        else -> {
          terminate(contextId)
          throw cause
        }
      }
    } catch (error: CancellationException) {
      terminate(contextId)
      throw FailureException(Failure.DISABLED, error)
    } catch (error: InterruptedException) {
      terminate(contextId)
      Thread.currentThread().interrupt()
      throw error
    }
  }

  /**
   * IsolatedJSContext.evaluateAsyncScript awaits `(script)` and stringifies the
   * settled value; a rejection is a missing result. The settled value is parked
   * on a one-off global and read by a second evaluation, so the sandbox never
   * awaits a source promise. Microtasks drain when an evaluation finishes and
   * the isolate has no timers, so a promise still pending by then can never
   * settle: that is a missing result, as on iOS, not a wait until the deadline.
   */
  private fun runAsync(
    contextId: Int,
    isolate: NemuAidokuJsIsolate,
    script: String,
    deadline: Long
  ): String? {
    val slot = "__nemuAsync_" + UUID.randomUUID().toString().replace("-", "")
    val wrapped = """
      (async () => await (
      $script
      ))().then(
        (value) => { globalThis.$slot = { settled: true, value: value }; },
        () => { globalThis.$slot = { settled: false }; }
      );
      "";
    """.trimIndent()
    run(contextId, isolate, wrapped, deadline)
    val settled = run(
      contextId,
      isolate,
      """
        (() => {
          const s = globalThis.$slot;
          delete globalThis.$slot;
          return s && s.settled === true ? "1" + String(s.value) : "0";
        })();
      """.trimIndent(),
      deadline
    ) ?: return null
    return if (settled.startsWith("1")) settled.substring(1) else null
  }

  private fun terminate(contextId: Int) {
    poison()
    contexts.remove(contextId)?.let { runCatching { it.close() } }
  }

  private fun poison() {
    poisoned = true
    releaseAll()
  }

  private fun releaseAll() {
    val open = contexts.values.toList()
    contexts.clear()
    open.forEach { runCatching { it.close() } }
  }

  companion object {
    internal const val RUN_HELPER = "__nemuEvaluate"

    /**
     * Runs once per context, before the source's first script. The helper
     * closes over the context's original `eval` and `String` and is pinned
     * (non-writable, non-configurable), so a source that reassigns the global
     * `eval` (common in packed site scripts) cannot break later evaluations.
     */
    internal const val PREPARE_CONTEXT = """
(() => {
  try { delete globalThis.android; } catch (e) {}
  const indirectEval = eval;
  const text = String;
  Object.defineProperty(globalThis, "$RUN_HELPER", {
    value: (source) => {
      try { return text(indirectEval(source)); } catch (e) { return "undefined"; }
    },
    writable: false, enumerable: false, configurable: false,
  });
})();
""
"""
  }
}

/**
 * Evaluated in the sandbox isolate right after the runtime bundle loads and
 * before any source is registered. Source scripts never run there (the host
 * evaluator above answers every `js` import), so nothing legitimate generates
 * code from strings in that isolate; this removes `eval` and every reachable
 * Function constructor so a regression (for example a runtime that ignores
 * `jsEvaluator` and falls back to its built-in `new Function` evaluator) fails
 * closed instead of running source text next to the `android` bridge.
 *
 * AndroidX JavaScriptEngine exposes no V8 flag or code-generation callback,
 * so this is done in JavaScript. `instanceof Function` keeps working because
 * the replacement's `prototype` is the real Function.prototype.
 */
internal const val NEMU_AIDOKU_SANDBOX_CODEGEN_LOCKDOWN = """
(() => {
  "use strict";
  const blocked = function () {
    throw new EvalError("Code generation from strings is disabled in the Aidoku sandbox.");
  };
  const seal = (target, key, value) => Object.defineProperty(target, key, {
    value, writable: false, enumerable: false, configurable: false,
  });
  blocked.prototype = Function.prototype;
  for (const proto of [
    Function.prototype,
    Object.getPrototypeOf(async function () {}),
    Object.getPrototypeOf(function* () {}),
    Object.getPrototypeOf(async function* () {}),
  ]) {
    seal(proto, "constructor", blocked);
  }
  seal(globalThis, "Function", blocked);
  seal(globalThis, "eval", blocked);
  const attempts = [
    () => (0, eval)("1"),
    () => new Function("return 1"),
    () => (() => {}).constructor("return 1"),
    () => (async () => {}).constructor("return 1"),
    () => (function* () {}).constructor("return 1"),
    () => (async function* () {}).constructor("return 1"),
    () => Reflect.construct(Object.getPrototypeOf(() => {}).constructor, ["return 1"]),
  ];
  for (const attempt of attempts) {
    try { attempt(); return "open"; } catch (error) { if (!(error instanceof EvalError)) return "open"; }
  }
  return "locked";
})()
"""
