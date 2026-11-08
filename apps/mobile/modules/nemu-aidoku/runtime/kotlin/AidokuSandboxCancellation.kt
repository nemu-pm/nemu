package pm.nemu.mobile.aidoku

import org.json.JSONObject

/**
 * Cooperative cancellation of isolated Aidoku operations.
 *
 * The sandbox runs one operation at a time, and most of an operation's time
 * is spent waiting on the source's HTTP requests. React Native schedules
 * operations by priority; when the user needs the runtime while a background
 * operation (a library update check, another tab's refresh, a request the
 * user already walked away from) is running, it cancels that operation by the
 * token it attached, re-queues it, and runs the user's operation next.
 *
 * A cancelled operation stops at its next replay round, and the HTTP request
 * it is waiting on is cancelled at once, so the runtime is free within
 * milliseconds instead of after the source's full timeout. Only operations
 * that carry a token (read-only content fetches) can be cancelled. Mirrors
 * `NemuAidokuSandboxCancellation.swift`.
 */
internal class AidokuSandboxCancellation(
  private val cancelHttpRequest: (String) -> Unit
) {
  private val lock = Any()
  private val cancelled = ArrayDeque<String>()
  private val cancelledSet = HashSet<String>()
  private val activeHttp = HashMap<String, String>()

  /** Cancels [token]'s operation: now if it is running, or as soon as it starts. */
  fun cancel(token: String): Boolean {
    val requestId: String?
    synchronized(lock) {
      if (cancelledSet.add(token)) {
        cancelled.addLast(token)
        while (cancelled.size > MAX_REMEMBERED_CANCELLATIONS) {
          cancelledSet.remove(cancelled.removeFirst())
        }
      }
      requestId = activeHttp[token]
    }
    requestId?.let(cancelHttpRequest)
    return true
  }

  fun isCancelled(token: String?): Boolean {
    if (token == null) return false
    synchronized(lock) { return cancelledSet.contains(token) }
  }

  fun throwIfCancelled(token: String?) {
    if (isCancelled(token)) throw IllegalStateException(PREEMPTED_MESSAGE)
  }

  /**
   * The request id [token]'s next HTTP request must use, registered so a
   * cancellation can reach it; null for an untokened operation. Throws when
   * the operation was already cancelled.
   */
  fun beginHttp(token: String?, round: Int): String? {
    if (token == null) return null
    val requestId = "aidoku-op-$token-$round"
    synchronized(lock) {
      if (!cancelledSet.contains(token)) {
        activeHttp[token] = requestId
        return requestId
      }
    }
    throw IllegalStateException(PREEMPTED_MESSAGE)
  }

  fun endHttp(token: String?) {
    if (token == null) return
    synchronized(lock) { activeHttp.remove(token) }
  }

  /** The operation is over; forget its token. */
  fun finish(token: String?) {
    if (token == null) return
    synchronized(lock) {
      activeHttp.remove(token)
      if (cancelledSet.remove(token)) cancelled.remove(token)
    }
  }

  companion object {
    /** Marker React Native recognises to re-queue instead of failing the caller. */
    const val PREEMPTED_MESSAGE =
      "[nemu-preempted] The Aidoku operation was paused for a user request."
    const val MAX_TOKEN_LENGTH = 128
    const val MAX_REMEMBERED_CANCELLATIONS = 64
    private val TOKEN_PATTERN = Regex("^[A-Za-z0-9_-]+$")

    fun isValidToken(token: String): Boolean =
      token.isNotEmpty() && token.length <= MAX_TOKEN_LENGTH && TOKEN_PATTERN.matches(token)

    /**
     * A token from an operation, removed from it. Anything that is not a short
     * identifier is ignored (the operation just is not cancellable).
     */
    fun takeToken(operation: JSONObject): String? {
      if (!operation.has("cancelToken")) return null
      val raw = operation.opt("cancelToken")
      operation.remove("cancelToken")
      return (raw as? String)?.takeIf(::isValidToken)
    }
  }
}
