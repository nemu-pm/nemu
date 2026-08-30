package pm.nemu.mobile.aidoku

import java.util.concurrent.CompletableFuture
import java.util.concurrent.Executor
import java.util.concurrent.Future

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
