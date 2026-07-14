package pm.nemu.mobile.aidoku

// Compiled into the Android module from the tracked cross-runtime source tree.

import android.annotation.SuppressLint
import android.content.Context
import android.content.SharedPreferences
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.os.DeadObjectException
import android.os.RemoteException
import androidx.javascriptengine.IsolateStartupParameters
import androidx.javascriptengine.JavaScriptIsolate
import androidx.javascriptengine.JavaScriptSandbox
import androidx.javascriptengine.Message
import androidx.javascriptengine.MessagePort
import androidx.javascriptengine.MessagePortClient
import androidx.javascriptengine.SandboxDeadException
import com.google.common.util.concurrent.ListenableFuture
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import java.io.OutputStream
import java.net.URI
import java.util.UUID
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.Future
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException
import kotlin.math.abs
import kotlin.math.roundToInt
import org.json.JSONArray
import org.json.JSONObject

internal const val NEMU_AIDOKU_SANDBOX_MAX_PACKAGE_BYTES = 32 * 1024 * 1024
internal const val NEMU_AIDOKU_SANDBOX_MAX_HTTP_BYTES = 16 * 1024 * 1024
internal const val NEMU_AIDOKU_SANDBOX_MAX_EVALUATIONS = 1_024

private const val SANDBOX_MAX_SESSIONS = 32
private const val SANDBOX_MAX_SETTINGS_JSON_LENGTH = 256 * 1024
private const val SANDBOX_MAX_PERSISTED_SETTINGS_PER_SOURCE = 64 * 1024
private const val SANDBOX_MAX_PERSISTED_SETTINGS_TOTAL = 512 * 1024
private const val SANDBOX_MAX_PERSISTED_SOURCES = 128
// MangaDex's current home implementation deterministically performs twelve
// requests (multiple curated lists plus partial sections). The operation time
// and aggregate 32 MiB response ceilings remain the primary resource bounds;
// 32 rounds leaves headroom for other legitimate multi-section home sources.
private const val SANDBOX_MAX_REPLAY_ROUNDS = 32
private const val SANDBOX_HEAP_BYTES = 96L * 1024L * 1024L
private const val SANDBOX_MAX_RESULT_BYTES = 4 * 1024 * 1024
private const val SANDBOX_MAX_REPLAY_BYTES = 32 * 1024 * 1024
private const val SANDBOX_CONNECT_TIMEOUT_MS = 10_000L
private const val SANDBOX_BOOT_TIMEOUT_MS = 15_000L
private const val SANDBOX_OPERATION_TIMEOUT_MS = 20_000L
private const val SANDBOX_HTTP_TIMEOUT_MS = 12_000
private const val SANDBOX_ASSET = "nemu_aidoku_sandbox.js"
private const val SANDBOX_SETTINGS_FILE = "nemu_aidoku_runtime_settings_v1"
private const val SANDBOX_IMAGE_MAX_BYTES = 8 * 1024 * 1024
private const val SANDBOX_IMAGE_MAX_DIMENSION = 8_192
private const val SANDBOX_IMAGE_MAX_PIXELS = 12_000_000L
private const val SANDBOX_IMAGE_MAX_TOTAL_PIXELS = 20_000_000L
private const val SANDBOX_IMAGE_MAX_CONTEXTS = 16
private const val SANDBOX_IMAGE_MAX_COMMANDS = 512
private const val SANDBOX_IMAGE_MAX_HEADERS = 96
private const val SANDBOX_IMAGE_MAX_HEADER_CHARACTERS = 64 * 1024
private const val SANDBOX_IMAGE_BITMAP_BYTES_PER_PIXEL = 4L
private const val SANDBOX_IMAGE_MIN_HEAP_RESERVE_BYTES = 32L * 1024L * 1024L

internal data class AidokuSandboxHttpRequest(
  val sourceKey: String,
  val url: String,
  val method: String,
  val headers: Map<String, String>,
  val body: String?,
  val timeoutMs: Int
)

internal data class AidokuSandboxHttpResponse(
  val status: Int,
  val headers: Map<String, String>,
  val bytes: ByteArray,
  val error: String? = null
)

internal data class AidokuSandboxStatus(
  val available: Boolean,
  val detail: String
) {
  fun toMap(): Map<String, Any?> = mapOf(
    "available" to available,
    "platform" to "android",
    "detail" to detail
  )
}

private data class NativeSandboxSession(
  val id: String,
  val packageUri: String,
  val sourceKey: String,
  val expectedSourceId: String,
  val expectedVersion: Int,
  var settingsJson: String,
  var registeredGeneration: Long = -1
)

/**
 * Android System WebView keeps one Binder callback for every JavaScript
 * evaluation. Some released WebView builds retain those callbacks until the
 * isolate closes, even after the evaluation Future has completed. Bound the
 * lifetime of an isolate so a long source/reader session cannot exhaust the
 * process Binder table. The manager consults this policy only at top-level
 * operation boundaries, never while a replay or image message is in flight.
 */
internal class AidokuSandboxRecyclePolicy(
  private val maxEvaluations: Int = NEMU_AIDOKU_SANDBOX_MAX_EVALUATIONS
) {
  private var evaluationCount = 0
  private var recycleRequested = false

  init {
    require(maxEvaluations > 0) { "The Aidoku recycle threshold must be positive." }
  }

  @Synchronized
  fun recordEvaluation() {
    if (evaluationCount < Int.MAX_VALUE) evaluationCount += 1
    if (evaluationCount >= maxEvaluations) recycleRequested = true
  }

  @Synchronized
  fun requestRecycle() {
    recycleRequested = true
  }

  @Synchronized
  fun takeRecycleAtBoundary(): Boolean {
    if (!recycleRequested) return false
    recycleRequested = false
    evaluationCount = 0
    return true
  }

  @Synchronized
  fun markIsolateReset() {
    evaluationCount = 0
    recycleRequested = false
  }

  @Synchronized
  fun evaluationCountForTesting(): Int = evaluationCount
}

internal fun aidokuSandboxSessionNeedsRegistration(
  registeredGeneration: Long,
  runtimeGeneration: Long
): Boolean = registeredGeneration != runtimeGeneration

internal enum class AidokuSandboxResetScope {
  ISOLATE,
  SANDBOX_CONNECTION
}

/** A dead Binder/service invalidates the connection; other failures do not. */
internal fun aidokuSandboxResetScope(error: Throwable): AidokuSandboxResetScope {
  var current: Throwable? = error
  repeat(16) {
    when (current) {
      is SandboxDeadException,
      is DeadObjectException,
      is RemoteException -> return AidokuSandboxResetScope.SANDBOX_CONNECTION
    }
    val next = current?.cause
    if (next == null || next === current) return AidokuSandboxResetScope.ISOLATE
    current = next
  }
  return AidokuSandboxResetScope.ISOLATE
}

private class AidokuSandboxSettingsStore(context: Context) {
  private val preferences: SharedPreferences = context.getSharedPreferences(
    SANDBOX_SETTINGS_FILE,
    Context.MODE_PRIVATE
  )

  @Synchronized
  @SuppressLint("ApplySharedPref", "UseKtx")
  fun load(sourceKey: String): String {
    val stored = preferences.getString(sourceKey, null) ?: return "{}"
    return try {
      check(stored.length <= SANDBOX_MAX_PERSISTED_SETTINGS_PER_SOURCE)
      JSONObject(stored)
      stored
    } catch (_: Throwable) {
      preferences.edit().remove(sourceKey).commit()
      "{}"
    }
  }

  @Synchronized
  @SuppressLint("ApplySharedPref", "UseKtx")
  fun commitPatch(sourceKey: String, patchJson: String): String {
    require(sourceKey.isNotBlank() && sourceKey.length <= 512) {
      "Invalid Aidoku settings source key."
    }
    require(patchJson.length <= SANDBOX_MAX_PERSISTED_SETTINGS_PER_SOURCE) {
      "Aidoku settings patch exceeds the safety limit."
    }
    val patch = JSONObject(patchJson)
    val current = JSONObject(load(sourceKey))
    patch.keys().forEach { key ->
      require(key.isNotBlank() && key.length <= 256) {
        "Aidoku persisted setting key is invalid."
      }
      current.put(key, patch.get(key))
    }
    require(current.length() <= 128) { "Aidoku persisted settings exceed the key limit." }
    val serialized = current.toString()
    require(serialized.length <= SANDBOX_MAX_PERSISTED_SETTINGS_PER_SOURCE) {
      "Aidoku persisted settings exceed the safety limit."
    }

    val previous = preferences.getString(sourceKey, null)
    val existingSources = preferences.all.values.count { it is String }
    require(previous != null || existingSources < SANDBOX_MAX_PERSISTED_SOURCES) {
      "Too many Aidoku sources have persisted runtime settings."
    }
    val aggregateLength = preferences.all.values.sumOf {
      (it as? String)?.length ?: 0
    } - (previous?.length ?: 0) + serialized.length
    require(aggregateLength <= SANDBOX_MAX_PERSISTED_SETTINGS_TOTAL) {
      "Aidoku persisted settings exceed the aggregate safety limit."
    }
    // This patch is part of the completed source operation. A synchronous
    // commit is intentional: reporting success before apply() reaches disk
    // would lose a source-authored setting if Android kills the process.
    check(preferences.edit().putString(sourceKey, serialized).commit()) {
      "Failed to persist Aidoku source settings."
    }
    return serialized
  }

  @Synchronized
  @SuppressLint("ApplySharedPref", "UseKtx")
  fun clearMatching(key: String, matchPrefix: Boolean): Int {
    require(key.isNotBlank() && key.length <= 512) {
      "Invalid Aidoku settings key."
    }
    val matchingKeys = preferences.all.keys.filter {
      if (matchPrefix) it.startsWith(key) else it == key
    }
    if (matchingKeys.isEmpty()) return 0
    val editor = preferences.edit()
    matchingKeys.forEach(editor::remove)
    check(editor.commit()) { "Failed to clear Aidoku source settings." }
    return matchingKeys.size
  }
}

private class BoundedImageOutputStream(
  private val maxBytes: Int
) : OutputStream() {
  private val output = ByteArrayOutputStream(minOf(maxBytes, 64 * 1024))

  override fun write(value: Int) {
    ensureCapacity(1)
    output.write(value)
  }

  override fun write(buffer: ByteArray, offset: Int, length: Int) {
    require(offset >= 0 && length >= 0 && offset + length <= buffer.size)
    ensureCapacity(length)
    output.write(buffer, offset, length)
  }

  private fun ensureCapacity(additionalBytes: Int) {
    if (additionalBytes > maxBytes - output.size()) {
      throw IOException("Aidoku processed image exceeds the safety limit.")
    }
  }

  fun toByteArray(): ByteArray = output.toByteArray()
}

/**
 * Owns the AndroidX JavaScriptEngine process used when React Native's JSC was
 * compiled without WebAssembly. AIX code runs out-of-process with a bounded
 * heap. The isolate has no network capability: every synchronous Aidoku HTTP
 * import is replayed, while the actual request is performed by Nemu's native
 * OkHttp client so device VPN/Tailscale routing and cookies remain effective.
 *
 * All work is serialized on one native executor. This matches Aidoku's sync
 * host ABI, prevents operation replay state from interleaving, and keeps every
 * `Future.get` off the UI and React Native JS threads.
 */
internal class AidokuSandboxManager(
  context: Context,
  private val httpRequest: (AidokuSandboxHttpRequest) -> AidokuSandboxHttpResponse,
  private val decorateImageHeaders:
    (String, String, Map<String, String>) -> Map<String, String>
) {
  private val applicationContext = context.applicationContext
  private val settingsStore = AidokuSandboxSettingsStore(applicationContext)
  private val executor: ExecutorService = Executors.newSingleThreadExecutor { runnable ->
    Thread(runnable, "nemu-aidoku-sandbox").apply { isDaemon = true }
  }
  private val messagePortExecutor: ExecutorService = Executors.newSingleThreadExecutor { runnable ->
    Thread(runnable, "nemu-aidoku-message-port").apply { isDaemon = true }
  }
  private val recyclePolicy = AidokuSandboxRecyclePolicy()
  private val pendingSandboxConnection =
    AidokuPendingSandboxConnection<ListenableFuture<JavaScriptSandbox>>()
  private val sessions = LinkedHashMap<String, NativeSandboxSession>()
  private val disposeRequestedSessionIds = ConcurrentHashMap.newKeySet<String>()

  private var sandbox: JavaScriptSandbox? = null
  private var isolate: JavaScriptIsolate? = null
  private var generation = 0L
  private var closed = false

  fun status(): AidokuSandboxStatus {
    if (!JavaScriptSandbox.isSupported()) {
      return AidokuSandboxStatus(
        false,
        "Android System WebView does not provide the isolated JavaScript sandbox."
      )
    }
    return AidokuSandboxStatus(
      true,
      "Isolated Android WebAssembly runtime is available."
    )
  }

  fun createSession(
    sessionId: String,
    packageUri: String,
    sourceKey: String,
    expectedSourceId: String,
    expectedVersion: Int,
    settingsJson: String
  ): Future<String> = submit {
    withRuntimeRecycleBoundary {
      require(sessionId.isNotBlank() && sessionId.length <= 256) { "Invalid Aidoku session ID." }
      require(sourceKey.isNotBlank() && sourceKey.length <= 512) { "Invalid Aidoku source key." }
      require(expectedSourceId.isNotBlank() && expectedSourceId.length <= 256) {
        "Invalid expected Aidoku source ID."
      }
      require(expectedVersion >= 0) { "Invalid expected Aidoku source version." }
      require(settingsJson.length <= SANDBOX_MAX_SETTINGS_JSON_LENGTH) {
        "Aidoku settings exceed the safety limit."
      }
      JSONObject(settingsJson)
      if (!sessions.containsKey(sessionId) && sessions.size >= SANDBOX_MAX_SESSIONS) {
        throw IllegalStateException("Too many isolated Aidoku sessions are active.")
      }

      check(!disposeRequestedSessionIds.contains(sessionId)) {
        "Aidoku session creation was cancelled."
      }
      val session = NativeSandboxSession(
        sessionId,
        packageUri,
        sourceKey,
        expectedSourceId,
        expectedVersion,
        settingsJson
      )
      var retained = false
      try {
        ensureSessionRegistered(session)
        val capabilities = executeOperationLocked(session, "{\"kind\":\"capabilities\"}")
        check(!disposeRequestedSessionIds.contains(sessionId)) {
          "Aidoku session creation was cancelled."
        }
        sessions[sessionId] = session
        retained = true
        capabilities
      } finally {
        if (!retained) cleanupSandboxSession(sessionId)
      }
    }
  }

  fun executeOperation(sessionId: String, operationJson: String): Future<String> = submit {
    withRuntimeRecycleBoundary {
      require(operationJson.length <= 2 * 1024 * 1024) {
        "Aidoku operation exceeds the safety limit."
      }
      JSONObject(operationJson)
      check(!disposeRequestedSessionIds.contains(sessionId)) { "Aidoku session expired." }
      val session = sessions[sessionId] ?: throw IllegalStateException("Aidoku session expired.")
      ensureSessionRegistered(session)
      executeOperationLocked(session, operationJson)
    }
  }

  fun processImage(
    sessionId: String,
    operationJson: String,
    imageBytes: ByteArray
  ): Future<ByteArray?> = submit {
    withRuntimeRecycleBoundary {
      require(operationJson.length <= 2 * 1024 * 1024) {
        "Aidoku image operation exceeds the safety limit."
      }
      require(imageBytes.isNotEmpty() && imageBytes.size <= SANDBOX_IMAGE_MAX_BYTES) {
        "Aidoku image input exceeds the safety limit."
      }
      check(!disposeRequestedSessionIds.contains(sessionId)) { "Aidoku session expired." }
      val session = sessions[sessionId] ?: throw IllegalStateException("Aidoku session expired.")
      ensureSessionRegistered(session)
      val activeIsolate = ensureRuntime()
      check(isImageTransportSupported()) {
        "Android System WebView does not provide Aidoku image message ports."
      }

      val operation = JSONObject(operationJson)
      val dimensions = decodeImageBounds(imageBytes)
      val dataName = "image-input-${UUID.randomUUID()}"
      val portName = "image-output-${UUID.randomUUID()}"
      val deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(SANDBOX_OPERATION_TIMEOUT_MS)
      val outputFuture = CompletableFuture<ByteArray>()
      val port = createImageMessagePort(activeIsolate, portName, outputFuture)
      try {
        provideNamedData(activeIsolate, dataName, imageBytes)
        operation.put("kind", "process-page-image")
        operation.put("imageDataName", dataName)
        operation.put("imageWidth", dimensions.first)
        operation.put("imageHeight", dimensions.second)
        operation.put("outputPortName", portName)

        val result = JSONObject(executeOperationLocked(session, operation.toString(), deadline))
        if (result.isNull("value")) return@submit null
        val value = result.getJSONObject("value")
        return@submit when (value.getString("kind")) {
          "binary" -> {
            val expectedLength = value.getInt("byteLength")
            check(expectedLength in 1..SANDBOX_IMAGE_MAX_BYTES) {
              "Aidoku processed image exceeds the safety limit."
            }
            val bytes = outputFuture.get(remainingMillis(deadline), TimeUnit.MILLISECONDS)
            check(bytes.size == expectedLength) {
              "Aidoku processed image length does not match its message."
            }
            bytes
          }
          "canvas-plan" -> renderCanvasPlan(imageBytes, value.getJSONObject("plan"))
          else -> throw IllegalStateException("Invalid isolated Aidoku image result.")
        }
      } finally {
        outputFuture.cancel(true)
        runCatching { port.close() }
      }
    }
  }

  fun updateSettings(sessionId: String, settingsJson: String): Future<String> = submit {
    withRuntimeRecycleBoundary {
      require(settingsJson.length <= SANDBOX_MAX_SETTINGS_JSON_LENGTH) {
        "Aidoku settings exceed the safety limit."
      }
      JSONObject(settingsJson)
      check(!disposeRequestedSessionIds.contains(sessionId)) { "Aidoku session expired." }
      val session = sessions[sessionId] ?: throw IllegalStateException("Aidoku session expired.")
      session.settingsJson = settingsJson
      ensureSessionRegistered(session)
      val output = evaluate(
        "NemuAidokuSandbox.updateSessionSettings(" +
          "${quote(session.id)},JSON.parse(${quote(settingsJson)}))",
        SANDBOX_BOOT_TIMEOUT_MS
      )
      requireStatus(output, "updated")
      output
    }
  }

  fun disposeSession(sessionId: String): Future<String> {
    disposeRequestedSessionIds.add(sessionId)
    synchronized(this) {
      if (closed) {
        disposeRequestedSessionIds.remove(sessionId)
        return CompletableFuture.completedFuture("{\"status\":\"disposed\"}")
      }
      return enqueueNonCancellableAidokuCleanup(
        executor,
        onRejected = { disposeRequestedSessionIds.remove(sessionId) }
      ) {
        try {
          sessions.remove(sessionId)
          cleanupSandboxSession(sessionId)
        } finally {
          disposeRequestedSessionIds.remove(sessionId)
        }
      }
    }
  }

  fun clearPersistedSettings(key: String, matchPrefix: Boolean): Future<String> = submit {
    require(key.isNotBlank() && key.length <= 512) {
      "Invalid Aidoku settings key."
    }
    val cleared = settingsStore.clearMatching(key, matchPrefix)
    val matchingSessionIds = sessions.values
      .filter { if (matchPrefix) it.sourceKey.startsWith(key) else it.sourceKey == key }
      .map { it.id }
    matchingSessionIds.forEach { sessionId ->
      sessions.remove(sessionId)
      // Durable deletion must not fail because an already-dead isolate cannot
      // acknowledge its in-memory cleanup. Re-registration will now load {}.
      runCatching { cleanupSandboxSession(sessionId) }
    }
    JSONObject()
      .put("status", "cleared")
      .put("count", cleared)
      .toString()
  }

  fun close() {
    synchronized(this) {
      if (closed) return
      closed = true
    }
    // Manager state is otherwise confined to `executor`. Queue teardown there
    // too, so OnDestroy cannot race a finishing operation while it iterates or
    // clears the session map. `shutdown()` drains already-cancelled FutureTasks
    // and this cleanup without blocking the UI thread.
    executor.execute {
      try {
        recycleIsolate()
        closeSandboxConnection()
        closePendingSandboxConnection()
        sessions.clear()
        disposeRequestedSessionIds.clear()
      } finally {
        messagePortExecutor.shutdownNow()
      }
    }
    executor.shutdown()
  }

  /**
   * May be called from Android memory callbacks on the main thread. Queue the
   * actual isolate recycle behind any in-flight operation; its top-level
   * boundary may satisfy the request first, in which case the queued check is
   * a no-op. The app's expensive sandbox service connection stays alive.
   */
  fun requestRuntimeRecycle() {
    recyclePolicy.requestRecycle()
    synchronized(this) {
      if (closed) return
      executor.execute { recycleRuntimeAtBoundaryIfNeeded() }
    }
  }

  private inline fun <T> withRuntimeRecycleBoundary(block: () -> T): T {
    try {
      return block()
    } finally {
      recycleRuntimeAtBoundaryIfNeeded()
    }
  }

  private fun recycleRuntimeAtBoundaryIfNeeded() {
    if (recyclePolicy.takeRecycleAtBoundary()) recycleIsolate()
  }

  private fun <T> submit(block: () -> T): Future<T> {
    synchronized(this) {
      check(!closed) { "The isolated Aidoku runtime is closed." }
    }
    return executor.submit<T> {
      try {
        block()
      } catch (error: Throwable) {
        if (error is TimeoutException) recycleIsolate()
        throw error
      }
    }
  }

  // Lint cannot follow the mandatory-feature list plus the explicit branch
  // below; the call is guarded before the startup parameters are applied.
  @SuppressLint("RequiresFeature")
  private fun ensureRuntime(): JavaScriptIsolate {
    isolate?.let { return it }
    val runtimeStatus = status()
    check(runtimeStatus.available) { runtimeStatus.detail }

    val connected = sandbox ?: connectSandbox()
    val startup = IsolateStartupParameters().apply {
      maxHeapSizeBytes = SANDBOX_HEAP_BYTES
      maxEvaluationReturnSizeBytes = SANDBOX_MAX_RESULT_BYTES
    }
    val nextIsolate = try {
      connected.createIsolate(startup)
    } catch (error: Throwable) {
      resetAfterRuntimeFailure(error)
      throw error
    }
    try {
      val bundle = applicationContext.assets.open(SANDBOX_ASSET).bufferedReader().use { it.readText() }
      recyclePolicy.recordEvaluation()
      nextIsolate.evaluateJavaScriptAsync(bundle)
        .get(SANDBOX_BOOT_TIMEOUT_MS, TimeUnit.MILLISECONDS)
      recyclePolicy.recordEvaluation()
      val probe = nextIsolate.evaluateJavaScriptAsync("NemuAidokuSandbox.probeRuntime()")
        .get(SANDBOX_BOOT_TIMEOUT_MS, TimeUnit.MILLISECONDS)
      requireStatus(probe, "ready")
    } catch (error: Throwable) {
      runCatching { nextIsolate.close() }
      recyclePolicy.markIsolateReset()
      if (aidokuSandboxResetScope(error) == AidokuSandboxResetScope.SANDBOX_CONNECTION) {
        closeSandboxConnection()
      }
      throw error
    }

    isolate = nextIsolate
    generation += 1
    return nextIsolate
  }

  private fun connectSandbox(): JavaScriptSandbox {
    val connection = pendingSandboxConnection.getOrCreate {
      JavaScriptSandbox.createConnectedInstanceAsync(applicationContext)
    }
    val connected = try {
      connection.get(SANDBOX_CONNECT_TIMEOUT_MS, TimeUnit.MILLISECONDS)
    } catch (error: Throwable) {
      // A timeout/interruption abandons only this wait, not the underlying
      // process-wide bind. Retain and reuse its Future on the next operation.
      if (error !is TimeoutException && error !is InterruptedException) {
        pendingSandboxConnection.clearIfSame(connection)
      }
      throw error
    }
    pendingSandboxConnection.clearIfSame(connection)

    val mandatoryFeatures = listOf(
      JavaScriptSandbox.JS_FEATURE_WASM_COMPILATION,
      JavaScriptSandbox.JS_FEATURE_PROVIDE_CONSUME_ARRAY_BUFFER,
      JavaScriptSandbox.JS_FEATURE_PROMISE_RETURN,
      JavaScriptSandbox.JS_FEATURE_ISOLATE_TERMINATION,
      JavaScriptSandbox.JS_FEATURE_ISOLATE_MAX_HEAP_SIZE,
      JavaScriptSandbox.JS_FEATURE_EVALUATE_WITHOUT_TRANSACTION_LIMIT
    )
    val missing = mandatoryFeatures.filterNot(connected::isFeatureSupported)
    if (missing.isNotEmpty()) {
      connected.close()
      throw IllegalStateException(
        "Android System WebView is missing required isolated WebAssembly features."
      )
    }

    // Assign the app-wide expensive connection before creating/booting an
    // isolate. A normal isolate failure must not trigger another service bind.
    sandbox = connected
    return connected
  }

  private fun ensureSessionRegistered(session: NativeSandboxSession) {
    val activeIsolate = ensureRuntime()
    if (!aidokuSandboxSessionNeedsRegistration(session.registeredGeneration, generation)) return

    val bytes = readPackageBytes(session.packageUri)
    val dataName = "aix-${UUID.randomUUID()}"
    provideNamedData(activeIsolate, dataName, bytes)
    val persistedSettingsJson = settingsStore.load(session.sourceKey)
    val imageProcessorTransportAvailable = isImageTransportSupported()
    val output = evaluate(
      "NemuAidokuSandbox.registerSession(" +
        "${quote(session.id)},${quote(session.sourceKey)}," +
        "${quote(session.expectedSourceId)},${session.expectedVersion},${quote(dataName)}," +
        "JSON.parse(${quote(session.settingsJson)})," +
        "JSON.parse(${quote(persistedSettingsJson)})," +
        "$imageProcessorTransportAvailable)",
      SANDBOX_BOOT_TIMEOUT_MS
    )
    requireStatus(output, "registered")
    session.registeredGeneration = generation
  }

  private fun executeOperationLocked(
    session: NativeSandboxSession,
    operationJson: String,
    deadline: Long = System.nanoTime() +
      TimeUnit.MILLISECONDS.toNanos(SANDBOX_OPERATION_TIMEOUT_MS)
  ): String {
    val operationId = UUID.randomUUID().toString()
    val operationKind = JSONObject(operationJson).optString("kind")
    val startedAt = System.currentTimeMillis()
    val begin = evaluate(
      "NemuAidokuSandbox.beginOperation(" +
        "${quote(operationId)},${quote(session.id)}," +
        "JSON.parse(${quote(operationJson)}),$startedAt)",
      remainingMillis(deadline)
    )
    requireStatus(begin, "started")

    try {
      var replayedBytes = 0
      repeat(SANDBOX_MAX_REPLAY_ROUNDS + 1) { round ->
        val output = evaluate(
          "NemuAidokuSandbox.executeOperation(${quote(operationId)})",
          remainingMillis(deadline)
        )
        val parsed = JSONObject(output)
        when (parsed.optString("status")) {
          "complete" -> {
            applySettingsPatchLocked(session, parsed, deadline)
            if (operationKind == "modify-image-request") {
              decorateImageRequestLocked(session, parsed)
            }
            parsed.remove("settingsPatch")
            return parsed.toString()
          }
          "error" -> throw IllegalStateException(
            parsed.optString("detail", "The isolated Aidoku runtime failed.")
          )
          "http-request" -> {
            if (round >= SANDBOX_MAX_REPLAY_ROUNDS) {
              throw IllegalStateException("Aidoku source exceeded the HTTP replay limit.")
            }
            val cursor = parsed.getInt("cursor")
            val requestJson = parsed.getJSONObject("request")
            val remainingMs = remainingMillis(deadline)
            val request = AidokuSandboxHttpRequest(
              sourceKey = session.sourceKey,
              url = requestJson.getString("url"),
              method = requestJson.optString("method", "GET"),
              headers = jsonStringMap(requestJson.optJSONObject("headers")),
              body = if (requestJson.isNull("body")) null else requestJson.optString("body"),
              timeoutMs = minOf(SANDBOX_HTTP_TIMEOUT_MS, remainingMs.toInt())
            )
            val response = httpRequest(request)
            if (response.status == 0 || response.error != null) {
              throw IllegalStateException(response.error ?: "Aidoku HTTP request failed.")
            }
            check(response.bytes.size <= NEMU_AIDOKU_SANDBOX_MAX_HTTP_BYTES) {
              "Aidoku HTTP response exceeds the safety limit."
            }
            replayedBytes += response.bytes.size
            check(replayedBytes <= SANDBOX_MAX_REPLAY_BYTES) {
              "Aidoku HTTP replay data exceeds the memory safety limit."
            }

            val dataName = "http-${UUID.randomUUID()}"
            provideNamedData(ensureRuntime(), dataName, response.bytes)
            val append = evaluate(
              "NemuAidokuSandbox.appendReplayResponse(" +
                "${quote(operationId)},$cursor,${requestJson},${response.status}," +
                "${JSONObject(response.headers)},${quote(dataName)})",
              remainingMillis(deadline)
            )
            requireStatus(append, "appended")
          }
          else -> throw IllegalStateException("Invalid isolated Aidoku runtime response.")
        }
      }
      throw IllegalStateException("Aidoku source exceeded the HTTP replay limit.")
    } finally {
      runCatching {
        evaluate(
          "NemuAidokuSandbox.finishOperation(${quote(operationId)})",
          minOf(1_000L, remainingMillisOrDefault(deadline, 1_000L))
        )
      }
    }
  }

  private fun applySettingsPatchLocked(
    session: NativeSandboxSession,
    completed: JSONObject,
    deadline: Long
  ) {
    val patch = completed.optJSONObject("settingsPatch") ?: return
    if (patch.length() == 0) return
    val persisted = settingsStore.commitPatch(session.sourceKey, patch.toString())
    // The durable store is authoritative once commitPatch succeeds. If the
    // isolate dies while mirroring that committed snapshot, reset it and let
    // every session re-register from disk on the next operation. Rejecting the
    // already-completed source result here would expose a false failure even
    // though its settings side effect was durably committed.
    val mirrorFailure = runCatching {
      val output = evaluate(
        "NemuAidokuSandbox.applyPersistedSettings(" +
          "${quote(session.sourceKey)},JSON.parse(${quote(persisted)}))",
        remainingMillis(deadline)
      )
      requireStatus(output, "persisted")
    }.exceptionOrNull()
    if (mirrorFailure != null) resetAfterRuntimeFailure(mirrorFailure)
  }

  private fun decorateImageRequestLocked(
    session: NativeSandboxSession,
    completed: JSONObject
  ) {
    val value = completed.optJSONObject("value") ?: return
    val url = value.optString("url")
    if (url.isBlank()) return
    val existing = jsonStringMap(value.optJSONObject("headers"))
    val decorated = decorateImageHeaders(session.sourceKey, url, existing)
    check(decorated.size <= SANDBOX_IMAGE_MAX_HEADERS) {
      "Aidoku image headers exceed the safety limit."
    }
    check(decorated.entries.sumOf { it.key.length + it.value.length } <=
      SANDBOX_IMAGE_MAX_HEADER_CHARACTERS) {
      "Aidoku image headers exceed the safety limit."
    }
    value.put("headers", JSONObject(decorated))
  }

  private fun cleanupSandboxSession(sessionId: String): String {
    if (isolate == null) return "{\"status\":\"disposed\"}"
    return runCatching {
      evaluate(
        "NemuAidokuSandbox.disposeSession(${quote(sessionId)})",
        SANDBOX_BOOT_TIMEOUT_MS
      )
    }.getOrDefault("{\"status\":\"disposed\"}")
  }

  private fun isImageTransportSupported(): Boolean = sandbox?.isFeatureSupported(
    JavaScriptSandbox.JS_FEATURE_MESSAGE_PORTS
  ) == true

  @SuppressLint("RequiresFeature")
  private fun createImageMessagePort(
    activeIsolate: JavaScriptIsolate,
    name: String,
    output: CompletableFuture<ByteArray>
  ): MessagePort {
    check(isImageTransportSupported()) {
      "Android System WebView does not provide Aidoku image message ports."
    }
    return activeIsolate.createMessageChannel(
      name,
      messagePortExecutor,
      MessagePortClient { message ->
        try {
          check(message.type == Message.TYPE_ARRAY_BUFFER) {
            "Aidoku image processor returned an invalid message type."
          }
          val bytes = message.arrayBuffer
          check(bytes.isNotEmpty() && bytes.size <= SANDBOX_IMAGE_MAX_BYTES) {
            "Aidoku processed image exceeds the safety limit."
          }
          output.complete(bytes)
        } catch (error: Throwable) {
          output.completeExceptionally(error)
        }
      }
    )
  }

  private fun decodeImageBounds(bytes: ByteArray): Pair<Int, Int> {
    val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
    val width = options.outWidth
    val height = options.outHeight
    return if (validImageDimensions(width, height)) width to height else 0 to 0
  }

  private fun validImageDimensions(width: Int, height: Int): Boolean =
    width in 1..SANDBOX_IMAGE_MAX_DIMENSION &&
      height in 1..SANDBOX_IMAGE_MAX_DIMENSION &&
      width.toLong() * height.toLong() <= SANDBOX_IMAGE_MAX_PIXELS

  private fun finitePlanNumber(value: Double): Float {
    check(value.isFinite() && abs(value) <= 1_000_000.0) {
      "Aidoku canvas plan contains an invalid number."
    }
    return value.toFloat()
  }

  private fun planInteger(value: Double): Int {
    val rounded = value.roundToInt()
    check(abs(value - rounded.toDouble()) <= 0.001) {
      "Aidoku canvas source rectangles must use integer pixels."
    }
    return rounded
  }

  private fun ensureBitmapAllocationBudget(additionalPixels: Long) {
    check(additionalPixels > 0 &&
      additionalPixels <= Long.MAX_VALUE / SANDBOX_IMAGE_BITMAP_BYTES_PER_PIXEL) {
      "Aidoku canvas bitmap dimensions are invalid."
    }
    val runtime = Runtime.getRuntime()
    val usedBytes = runtime.totalMemory() - runtime.freeMemory()
    val availableBytes = (runtime.maxMemory() - usedBytes).coerceAtLeast(0L)
    val reserveBytes = maxOf(
      SANDBOX_IMAGE_MIN_HEAP_RESERVE_BYTES,
      runtime.maxMemory() / 4L
    )
    val requiredBytes = additionalPixels * SANDBOX_IMAGE_BITMAP_BYTES_PER_PIXEL
    check(availableBytes > reserveBytes && requiredBytes <= availableBytes - reserveBytes) {
      "Aidoku canvas does not have enough free heap for a safe bitmap allocation."
    }
  }

  @SuppressLint("UseKtx")
  private fun renderCanvasPlan(inputBytes: ByteArray, plan: JSONObject): ByteArray {
    check(plan.optInt("version") == 2) { "Unsupported Aidoku canvas plan." }
    val inputDimensions = decodeImageBounds(inputBytes)
    check(inputDimensions.first > 0 && inputDimensions.second > 0) {
      "Aidoku canvas plan input is not a decodable image."
    }
    val contextsJson = plan.getJSONArray("contexts")
    check(contextsJson.length() in 1..SANDBOX_IMAGE_MAX_CONTEXTS) {
      "Aidoku canvas plan exceeds the context limit."
    }
    val commandsJson = plan.getJSONArray("commands")
    check(commandsJson.length() <= SANDBOX_IMAGE_MAX_COMMANDS) {
      "Aidoku canvas plan exceeds the command limit."
    }
    val outputContextId = plan.getInt("outputContextId")
    ensureBitmapAllocationBudget(
      inputDimensions.first.toLong() * inputDimensions.second.toLong()
    )
    val inputBitmap = BitmapFactory.decodeByteArray(
      inputBytes,
      0,
      inputBytes.size,
      BitmapFactory.Options().apply { inPreferredConfig = Bitmap.Config.ARGB_8888 }
    ) ?: throw IllegalStateException("Aidoku canvas plan input could not be decoded.")
    check(validImageDimensions(inputBitmap.width, inputBitmap.height)) {
      "Aidoku canvas decoded beyond the image safety limit."
    }
    val contextBitmaps = LinkedHashMap<Int, Bitmap>()
    var totalPixels = inputBitmap.width.toLong() * inputBitmap.height.toLong()
    val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
    try {
      repeat(contextsJson.length()) { contextIndex ->
        val context = contextsJson.getJSONObject(contextIndex)
        val contextId = context.getInt("id")
        check(contextId > 0 && !contextBitmaps.containsKey(contextId)) {
          "Aidoku canvas plan context ID is invalid."
        }
        val width = context.getInt("width")
        val height = context.getInt("height")
        check(validImageDimensions(width, height)) {
          "Aidoku canvas plan dimensions exceed the safety limit."
        }
        totalPixels += width.toLong() * height.toLong()
        check(totalPixels <= SANDBOX_IMAGE_MAX_TOTAL_PIXELS) {
          "Aidoku canvas plan exceeds the aggregate pixel limit."
        }
        ensureBitmapAllocationBudget(width.toLong() * height.toLong())
        val destination = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        var retainedDestination = false
        try {
          contextBitmaps[contextId] = destination
          retainedDestination = true
        } finally {
          if (!retainedDestination && !destination.isRecycled) destination.recycle()
        }
      }

      // Replaying one chronological stream preserves Canvas2D semantics across
      // contexts. Grouping commands by context would make a destination created
      // first read a source context before that source had been rendered.
      repeat(commandsJson.length()) { commandIndex ->
        val command = commandsJson.getJSONObject(commandIndex)
        check(command.getString("op") == "copy") {
          "Aidoku canvas plan contains an unsupported command."
        }
        val destination = contextBitmaps[command.getInt("destinationContextId")]
          ?: throw IllegalStateException(
            "Aidoku canvas plan references an unavailable destination context."
          )
        val sourceDescription = command.getJSONObject("source")
        val source = when (sourceDescription.getString("type")) {
          "input" -> inputBitmap
          "context" -> contextBitmaps[sourceDescription.getInt("id")]
            ?: throw IllegalStateException(
              "Aidoku canvas plan references an unavailable source context."
            )
          else -> throw IllegalStateException("Aidoku canvas plan image is invalid.")
        }
        val sourceRectJson = command.getJSONObject("sourceRect")
        val sourceX = planInteger(sourceRectJson.getDouble("x"))
        val sourceY = planInteger(sourceRectJson.getDouble("y"))
        val sourceWidth = planInteger(sourceRectJson.getDouble("width"))
        val sourceHeight = planInteger(sourceRectJson.getDouble("height"))
        check(
          sourceX >= 0 &&
            sourceY >= 0 &&
            sourceWidth > 0 &&
            sourceHeight > 0 &&
            sourceX.toLong() + sourceWidth <= source.width &&
            sourceY.toLong() + sourceHeight <= source.height
        ) { "Aidoku canvas source rectangle is out of bounds." }
        val destinationRectJson = command.getJSONObject("destinationRect")
        val destinationX = finitePlanNumber(destinationRectJson.getDouble("x"))
        val destinationY = finitePlanNumber(destinationRectJson.getDouble("y"))
        val destinationWidth = finitePlanNumber(destinationRectJson.getDouble("width"))
        val destinationHeight = finitePlanNumber(destinationRectJson.getDouble("height"))
        check(destinationWidth > 0f && destinationHeight > 0f) {
          "Aidoku canvas destination rectangle is invalid."
        }
        val transform = command.getJSONObject("transform")
        val translateX = finitePlanNumber(transform.getDouble("translateX"))
        val translateY = finitePlanNumber(transform.getDouble("translateY"))
        val scaleX = finitePlanNumber(transform.getDouble("scaleX"))
        val scaleY = finitePlanNumber(transform.getDouble("scaleY"))
        val rotateAngle = finitePlanNumber(transform.getDouble("rotateAngle"))
        check(abs(scaleX) <= 16f && abs(scaleY) <= 16f && abs(rotateAngle) <= Math.PI * 100) {
          "Aidoku canvas transform exceeds the safety limit."
        }

        var sourceForDraw = source
        var sourceRect = Rect(
          sourceX,
          sourceY,
          sourceX + sourceWidth,
          sourceY + sourceHeight
        )
        var selfCopySnapshot: Bitmap? = null
        if (source === destination) {
          ensureBitmapAllocationBudget(sourceWidth.toLong() * sourceHeight.toLong())
          val snapshot = Bitmap.createBitmap(
            sourceWidth,
            sourceHeight,
            Bitmap.Config.ARGB_8888
          )
          selfCopySnapshot = snapshot
          try {
            Canvas(snapshot).drawBitmap(
              source,
              sourceRect,
              Rect(0, 0, sourceWidth, sourceHeight),
              paint
            )
          } catch (error: Throwable) {
            if (!snapshot.isRecycled) snapshot.recycle()
            throw error
          }
          sourceForDraw = snapshot
          sourceRect = Rect(0, 0, sourceWidth, sourceHeight)
        }

        try {
          val canvas = Canvas(destination)
          val checkpoint = canvas.save()
          try {
            canvas.translate(translateX, translateY)
            canvas.rotate(Math.toDegrees(rotateAngle.toDouble()).toFloat())
            canvas.scale(scaleX, scaleY)
            canvas.drawBitmap(
              sourceForDraw,
              sourceRect,
              RectF(
                destinationX,
                destinationY,
                destinationX + destinationWidth,
                destinationY + destinationHeight
              ),
              paint
            )
          } finally {
            canvas.restoreToCount(checkpoint)
          }
        } finally {
          if (selfCopySnapshot?.isRecycled == false) selfCopySnapshot.recycle()
        }
      }

      val output = contextBitmaps[outputContextId]
        ?: throw IllegalStateException("Aidoku canvas output context is unavailable.")
      return compressPngBounded(output)
    } finally {
      contextBitmaps.values.forEach { bitmap ->
        if (!bitmap.isRecycled) bitmap.recycle()
      }
      if (!inputBitmap.isRecycled) inputBitmap.recycle()
    }
  }

  private fun compressPngBounded(bitmap: Bitmap): ByteArray {
    val output = BoundedImageOutputStream(SANDBOX_IMAGE_MAX_BYTES)
    check(bitmap.compress(Bitmap.CompressFormat.PNG, 100, output)) {
      "Aidoku processed image could not be encoded."
    }
    return output.toByteArray()
  }

  private fun evaluate(script: String, timeoutMs: Long): String {
    check(timeoutMs > 0) { "The isolated Aidoku operation timed out." }
    return try {
      recyclePolicy.recordEvaluation()
      ensureRuntime().evaluateJavaScriptAsync(script)
        .get(timeoutMs, TimeUnit.MILLISECONDS)
    } catch (error: TimeoutException) {
      recycleIsolate()
      throw TimeoutException("The isolated Aidoku operation timed out.")
    } catch (error: Throwable) {
      // Isolate termination/OOM is contained without paying for a new service
      // connection. Only a confirmed dead Binder/service closes the sandbox.
      resetAfterRuntimeFailure(error)
      throw error
    }
  }

  private fun remainingMillis(deadline: Long): Long {
    val remaining = TimeUnit.NANOSECONDS.toMillis(deadline - System.nanoTime())
    if (remaining <= 0) throw TimeoutException("The isolated Aidoku operation timed out.")
    return remaining
  }

  private fun remainingMillisOrDefault(deadline: Long, fallback: Long): Long {
    val remaining = TimeUnit.NANOSECONDS.toMillis(deadline - System.nanoTime())
    return if (remaining > 0) remaining else fallback
  }

  private fun requireStatus(json: String, expected: String) {
    val parsed = JSONObject(json)
    if (parsed.optString("status") == expected) return
    throw IllegalStateException(parsed.optString("detail", "The isolated Aidoku runtime failed."))
  }

  // Guarded by the direct `isFeatureSupported` check below. Suppress only the
  // flow-insensitive lint warning, not the runtime check.
  @SuppressLint("RequiresFeature")
  private fun provideNamedData(
    activeIsolate: JavaScriptIsolate,
    name: String,
    bytes: ByteArray
  ) {
    val activeSandbox = sandbox ?: throw IllegalStateException("Aidoku sandbox is unavailable.")
    if (
      !activeSandbox.isFeatureSupported(
        JavaScriptSandbox.JS_FEATURE_PROVIDE_CONSUME_ARRAY_BUFFER
      )
    ) {
      throw IllegalStateException("Android System WebView cannot transfer AIX data safely.")
    }
    activeIsolate.provideNamedData(name, bytes)
  }

  private fun readPackageBytes(uriString: String): ByteArray {
    val uri = URI(uriString)
    require(uri.scheme == "file") { "Only cached file AIX packages can run in the sandbox." }
    val file = File(uri)
    check(file.isFile) { "The cached AIX package no longer exists." }
    val declaredSize = file.length()
    check(declaredSize in 1..NEMU_AIDOKU_SANDBOX_MAX_PACKAGE_BYTES.toLong()) {
      "AIX package exceeds the isolated runtime safety limit."
    }
    val bytes = file.inputStream().use { it.readBytes() }
    check(bytes.isNotEmpty() && bytes.size <= NEMU_AIDOKU_SANDBOX_MAX_PACKAGE_BYTES) {
      "AIX package exceeds the isolated runtime safety limit."
    }
    return bytes
  }

  private fun resetAfterRuntimeFailure(error: Throwable) {
    recycleIsolate()
    if (aidokuSandboxResetScope(error) == AidokuSandboxResetScope.SANDBOX_CONNECTION) {
      closeSandboxConnection()
    }
  }

  private fun recycleIsolate() {
    val oldIsolate = isolate
    isolate = null
    recyclePolicy.markIsolateReset()
    // `ensureRuntime` increments generation after the replacement isolate is
    // ready, so every prior session is already stale without mutating the map
    // during teardown.
    runCatching { oldIsolate?.close() }
  }

  private fun closeSandboxConnection() {
    val oldSandbox = sandbox
    sandbox = null
    runCatching { oldSandbox?.close() }
  }

  private fun closePendingSandboxConnection() {
    val connection = pendingSandboxConnection.detach() ?: return
    connection.addListener(
      {
        runCatching { connection.get().close() }
      },
      { command -> command.run() }
    )
  }

  private fun quote(value: String): String = JSONObject.quote(value)

  private fun jsonStringMap(value: JSONObject?): Map<String, String> {
    if (value == null) return emptyMap()
    return buildMap {
      value.keys().forEach { key -> put(key, value.getString(key)) }
    }
  }
}
