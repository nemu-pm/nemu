package pm.nemu.mobile.aidoku

import java.util.concurrent.CompletableFuture
import java.util.concurrent.Executor
import java.util.concurrent.Future
import org.json.JSONObject

/**
 * Queues cleanup independently of the completion Future returned to JS. Expo
 * may cancel that Future after a Promise timeout; cancellation must not remove
 * the executor command that owns native session cleanup.
 */
internal fun <T> enqueueNonCancellableAidokuCleanup(
  executor: Executor,
  onRejected: (Throwable) -> Unit = {},
  cleanup: () -> T
): Future<T> {
  val completion = CompletableFuture<T>()
  try {
    executor.execute {
      try {
        completion.complete(cleanup())
      } catch (error: Throwable) {
        completion.completeExceptionally(error)
      }
    }
  } catch (error: Throwable) {
    onRejected(error)
    completion.completeExceptionally(error)
  }
  return completion
}

/**
 * Keeps ownership of an asynchronous sandbox bind until somebody either
 * consumes its result or explicitly transfers it to shutdown cleanup.
 *
 * AndroidX JavaScriptEngine permits only one connection attempt per process.
 * Dropping its Future after an interrupted/timed-out wait can leave that
 * process-wide gate occupied while the service bind is still completing. A
 * later attempt then fails with `Binding to already bound service`.
 */
internal class AidokuPendingSandboxConnection<T : Any> {
  private var pending: T? = null

  @Synchronized
  fun getOrCreate(factory: () -> T): T = pending ?: factory().also { pending = it }

  @Synchronized
  fun clearIfSame(candidate: T): Boolean {
    if (pending !== candidate) return false
    pending = null
    return true
  }

  @Synchronized
  fun detach(): T? = pending.also { pending = null }

  @Synchronized
  internal fun currentForTesting(): T? = pending
}

/** Atomically prevents a native manager from being created after OnDestroy. */
internal class AidokuSandboxManagerOwner<T> {
  private val lock = Any()
  private var value: T? = null
  private var destroyed = false

  fun getOrCreate(factory: () -> T): T = synchronized(lock) {
    check(!destroyed) { "The Aidoku native module has been destroyed." }
    value ?: factory().also { value = it }
  }

  fun current(): T? = synchronized(lock) { value }

  fun destroy(close: (T) -> Unit) {
    val owned = synchronized(lock) {
      if (destroyed) return
      destroyed = true
      value.also { value = null }
    }
    if (owned != null) close(owned)
  }

  internal fun isDestroyedForTesting(): Boolean = synchronized(lock) { destroyed }
}

/**
 * Error names the React Native protocol layer can rebuild
 * (`RECONSTRUCTABLE_SANDBOX_ERROR_NAMES` in `mobileAidokuSandboxProtocol.ts`).
 * Closed on purpose: a hostile source must not be able to make the host
 * reconstruct an arbitrary error class.
 */
internal val AIDOKU_SANDBOX_PROPAGATED_ERROR_NAMES: Set<String> =
  setOf("AidokuResultError", "CloudflareBlockedError")

/**
 * The bounded subset of a `status: "error"` envelope that may cross to React
 * Native as the operation's *result* instead of a bare native exception, or
 * null when the failure is not a typed source error.
 *
 * Only a typed source failure qualifies. Throwing just `detail` for it used to
 * flatten `CloudflareBlockedError` into a plain `Error`, which left the
 * Cloudflare sheet with no structured `url` to solve (the message text is never
 * an operational url). Every other failure — runtime faults, replay violations,
 * expired sessions — keeps throwing so [aidokuSandboxResetScope] and the retry
 * paths that key on those exceptions are untouched.
 */
internal fun aidokuSandboxPropagatedErrorEnvelope(parsed: JSONObject): JSONObject? {
  if (parsed.optString("status") != "error") return null
  val name = parsed.optString("errorName", "")
  if (name !in AIDOKU_SANDBOX_PROPAGATED_ERROR_NAMES) return null
  val envelope = JSONObject().put("status", "error").put("errorName", name)
  if (parsed.has("code") && !parsed.isNull("code")) envelope.put("code", parsed.optString("code").take(64))
  if (parsed.has("detail") && !parsed.isNull("detail")) {
    envelope.put("detail", parsed.optString("detail").take(2_048))
  }
  if (parsed.has("errorCode") && !parsed.isNull("errorCode")) {
    val errorCode = parsed.opt("errorCode")
    if (errorCode is Number) envelope.put("errorCode", errorCode)
  }
  for ((key, limit) in listOf("errorUrl" to 2_048, "errorHost" to 253, "errorUserAgent" to 512)) {
    val value = parsed.optString(key, "")
    if (value.isNotEmpty()) envelope.put(key, value.take(limit))
  }
  return envelope
}
