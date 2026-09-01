package pm.nemu.mobile.aidoku

import android.content.ComponentCallbacks2
import android.content.Context
import android.content.res.Configuration
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.webkit.CookieManager
import com.facebook.drawee.backends.pipeline.Fresco
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import expo.modules.kotlin.types.OptimizedRecord
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.nio.charset.StandardCharsets
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Future
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.launch
import kotlinx.coroutines.runInterruptible
import okhttp3.Call
import okhttp3.CookieJar
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.ResponseBody
import okhttp3.MediaType.Companion.toMediaTypeOrNull

private const val NEMU_NATIVE_HTTP_VERSION = "built-in"
private const val NEMU_ASYNC_HTTP_MAX_TIMEOUT_MS = 30_000
private const val NEMU_SYNC_HTTP_MAX_TIMEOUT_MS = 12_000
private const val NEMU_COOKIE_SCOPE_MAX_CHARACTERS = 512
private const val NEMU_NATIVE_HTTP_TEMP_MAX_AGE_MS = 60 * 60 * 1_000L
private const val NEMU_NATIVE_HTTP_TEMP_ACTIVE_GRACE_MS = 5 * 60 * 1_000L
private const val NEMU_NATIVE_HTTP_TEMP_MAX_FILES = 128
private const val NEMU_NATIVE_HTTP_TEMP_MAX_BYTES = 256L * 1024 * 1024
private val NEMU_NATIVE_HTTP_TEMP_FILE_PATTERN = Regex(
  "^nemu-http-(?:\\d+|stage-\\d+|output-\\d+|" +
    "stage-segment-\\d{2}-\\d+|output-segment-\\d{2}-\\d+)\\.part$"
)
private const val MOBILE_USER_AGENT =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Mobile Safari/537.36"

@OptimizedRecord
class NemuAidokuHttpRequest : Record {
  @Field
  var requestId: String? = null

  @Field
  var cookieScope: String? = null

  @Field
  var url: String = ""

  @Field
  var method: String = "GET"

  @Field
  var headers: Map<String, String> = emptyMap()

  @Field
  var body: String? = null

  @Field
  var timeoutMs: Int? = null

  @Field
  var responseMode: String = "auto"

  @Field
  var maxResponseBytes: Int? = null

  @Field
  var requireHttps: Boolean = false
}

@OptimizedRecord
class NemuAidokuHttpFileRequest : Record {
  @Field
  var requestId: String? = null

  @Field
  var cookieScope: String? = null

  @Field
  var url: String = ""

  @Field
  var headers: Map<String, String> = emptyMap()

  @Field
  var timeoutMs: Int? = null

  @Field
  var maxResponseBytes: Int = 0

  @Field
  var requireHttps: Boolean = false

  @Field
  var maxImageDimension: Int? = null

  @Field
  var maxImagePixels: Int? = null

  @Field
  var allowLongStripSegments: Boolean = false
}

private data class NativeHttpResult(
  val status: Int,
  val headers: Map<String, String> = emptyMap(),
  val bytes: ByteArray = ByteArray(0),
  val error: String? = null
)

private data class NativeHttpFileResult(
  val status: Int,
  val headers: Map<String, String> = emptyMap(),
  val kind: String = "file",
  val fileUri: String? = null,
  val byteLength: Long? = null,
  val manifestVersion: Int? = null,
  val imageWidth: Long? = null,
  val imageHeight: Long? = null,
  val imageSegments: List<NativeHttpImageSegmentResult> = emptyList(),
  val error: String? = null
)

private data class NativeHttpImageSegmentResult(
  val fileUri: String,
  val byteLength: Long,
  val width: Long,
  val height: Long,
  val mimeType: String
)

class NemuAidokuModule : Module() {
  private val nativeHttpCookieStore = NemuNativeHttpCookieStore()
  private val sandboxCookieStore = AidokuSandboxCookieStore()
  private val sandboxManagerOwner = AidokuSandboxManagerOwner<AidokuSandboxManager>()
  // `newBuilder()` shares the dispatcher's connection pool and thread pool.
  // Creating a brand-new client per WASM request prevented keep-alive reuse and
  // made a source operation pay a fresh DNS/TLS setup for every page/API call.
  private val baseHttpClient = OkHttpClient.Builder()
    .cookieJar(CookieJar.NO_COOKIES)
    // Source packages are untrusted programs. Resolve only public destinations,
    // bypass process/system HTTP proxies that could relay private-network URLs,
    // and re-check the connected peer before every redirect hop sends bytes.
    // The pre-flight runs first because OkHttp resolves IP-literal hosts itself
    // and would otherwise reach the network interceptor only after connecting.
    .proxy(NEMU_NATIVE_HTTP_DIRECT_PROXY)
    .dns(NemuPublicAddressDns)
    .addInterceptor(NemuPublicAddressPreflightInterceptor())
    .addInterceptor(AidokuExplicitCookiePolicyInterceptor())
    .addNetworkInterceptor(NemuHttpsOnlyRedirectInterceptor())
    .addNetworkInterceptor(NemuPublicAddressNetworkInterceptor())
    .followRedirects(true)
    .followSslRedirects(true)
    .build()
  private val inFlightHttpCalls = ConcurrentHashMap.newKeySet<Call>()
  private val foregroundOnlyHttpCalls = ConcurrentHashMap.newKeySet<Call>()
  private val inFlightHttpCallsById = ConcurrentHashMap<String, Call>()
  private val preparedHttpRequestIds = ConcurrentHashMap.newKeySet<String>()
  private val cancelledHttpRequestIds = ConcurrentHashMap.newKeySet<String>()
  private val appIsActive = AtomicBoolean(true)
  private var imageMemoryCallbacks: ComponentCallbacks2? = null
  private var imageMemoryCallbacksContext: Context? = null

  override fun definition() = ModuleDefinition {
    Name("NemuAidoku")

    // Emitted by the on-demand Cloudflare solver (`solveCloudflare`) so the JS
    // "Nemu Agent" sheet can render live progress without blocking the RN
    // thread. Synchronous WASM HTTP calls surface the challenge immediately;
    // these events are for the explicit, non-blocking verification + retry.
    Events(
      "nemuAidokuCfSolveStart",
      "nemuAidokuCfWaiting",
      "nemuAidokuCfCaptcha",
      "nemuAidokuCfSuccess",
      "nemuAidokuCfFailed",
      "nemuNetworkAccessChanged"
    )

    Function("isAvailable") {
      true
    }

    Function("getNetworkAccessState") {
      "notRestricted"
    }

    Function("getHttpClientStatus") {
      mapOf(
        "available" to true,
        "abiVersion" to 6,
        "supportsRequestLifecycle" to true,
        "supportsCloudflareSolver" to false,
        "version" to NEMU_NATIVE_HTTP_VERSION,
        "platform" to "android",
        "detail" to "Built-in native source networking is available."
      )
    }

    Function("getAidokuSandboxStatus") {
      if (!androidx.javascriptengine.JavaScriptSandbox.isSupported()) {
        AidokuSandboxStatus(
          false,
          "Android System WebView does not provide the isolated JavaScript sandbox."
        ).toMap()
      } else {
        AidokuSandboxStatus(
          true,
          "Isolated Android WebAssembly runtime is available."
        ).toMap()
      }
    }

    Function("prepareHttpRequest") { requestId: String ->
      prepareHttpRequest(requestId)
    }

    Function("cancelHttpRequest") { requestId: String ->
      cancelHttpRequest(requestId)
    }

    Function("releaseHttpRequest") { requestId: String ->
      releaseHttpRequest(requestId)
    }

    OnCreate {
      registerImageMemoryCallbacks()
      appContext.backgroundCoroutineScope.launch {
        appContext.reactContext?.applicationContext?.cacheDir?.let(
          ::pruneNativeHttpTemporaryFiles
        )
      }
    }

    OnActivityEntersForeground {
      appIsActive.set(true)
    }

    OnActivityEntersBackground {
      appIsActive.set(false)
      // Foreground synchronous WASM work must stop when its UI disappears.
      // Async requests (headless refresh and the isolated Aidoku executor) are
      // allowed to finish so switching apps does not turn a valid background
      // fetch into an artificial network error.
      cancelForegroundOnlyWork()
      clearImageMemoryCache()
    }

    OnDestroy {
      appIsActive.set(false)
      unregisterImageMemoryCallbacks()
      cancelInFlightWork()
      nativeHttpCookieStore.close()
      sandboxManagerOwner.destroy { it.close() }
      sandboxCookieStore.close()
    }

    AsyncFunction("clearImageMemoryCache") {
      clearImageMemoryCache()
    }

    AsyncFunction("resetMobileSourceProfileAuthState") { promise: Promise ->
      resetMobileSourceProfileAuthState(promise)
    }

    AsyncFunction("sendHttpRequest") { request: NemuAidokuHttpRequest, promise: Promise ->
      sendHttpRequestAsync(
        request,
        NEMU_ASYNC_HTTP_MAX_TIMEOUT_MS,
        allowBackground = true,
        promise = promise
      )
    }

    AsyncFunction("downloadHttpFile") { request: NemuAidokuHttpFileRequest, promise: Promise ->
      downloadHttpFileAsync(request, promise)
    }

    Function("sendHttpRequestSync") { request: NemuAidokuHttpRequest ->
      sendHttpRequest(
        request,
        NEMU_SYNC_HTTP_MAX_TIMEOUT_MS,
        allowBackground = false
      )
    }

    AsyncFunction("createAidokuSandboxSession") {
        sessionId: String,
        packageUri: String,
        sourceKey: String,
        expectedSourceId: String,
        expectedVersion: Int,
        settingsJson: String,
        promise: Promise ->
      settleSandboxPromise(
        getAidokuSandboxManager().createSession(
          sessionId,
          packageUri,
          sourceKey,
          expectedSourceId,
          expectedVersion,
          settingsJson
        ),
        promise,
        35_000
      )
    }

    AsyncFunction("executeAidokuSandboxOperation") {
        sessionId: String,
        operationJson: String,
        promise: Promise ->
      settleSandboxPromise(
        getAidokuSandboxManager().executeOperation(sessionId, operationJson),
        promise,
        25_000
      )
    }

    AsyncFunction("processAidokuSandboxImage") {
        sessionId: String,
        operationJson: String,
        imageBytes: ByteArray,
        promise: Promise ->
      settleSandboxPromise(
        getAidokuSandboxManager().processImage(sessionId, operationJson, imageBytes),
        promise,
        25_000
      )
    }

    AsyncFunction("updateAidokuSandboxSettings") {
        sessionId: String,
        settingsJson: String,
        promise: Promise ->
      settleSandboxPromise(
        getAidokuSandboxManager().updateSettings(sessionId, settingsJson),
        promise,
        20_000
      )
    }

    AsyncFunction("clearAidokuSandboxSettings") {
        key: String,
        matchPrefix: Boolean,
        promise: Promise ->
      settleSandboxPromise(
        getAidokuSandboxManager().clearPersistedSettings(key, matchPrefix),
        promise,
        20_000
      )
    }

    AsyncFunction("disposeAidokuSandboxSession") {
        sessionId: String,
        promise: Promise ->
      val manager = sandboxManagerOwner.current()
      if (manager == null) {
        promise.resolve("{\"status\":\"disposed\"}")
      } else {
        settleSandboxPromise(
          manager.disposeSession(sessionId),
          promise,
          25_000
        )
      }
    }

    // Keep the ABI while failing closed. Android WebView cannot route every
    // redirect/subresource/service-worker fetch through our protected OkHttp
    // DNS + connected-peer boundary, so it must never load an untrusted URL.
    AsyncFunction("solveCloudflare") { url: String, promise: Promise ->
      solveCloudflareAsync(url, promise)
    }
  }

  private fun clearImageMemoryCache() {
    if (Fresco.hasBeenInitialized()) {
      // Drop decoded pixels only. Fresco's disk cache stays intact, so leaving
      // the reader cannot retain an entire chapter in native memory and a
      // return visit still avoids another network download.
      Fresco.getImagePipeline().clearMemoryCaches()
    }
  }

  private fun pruneNativeHttpTemporaryFiles(cacheDir: File) {
    val directory = File(cacheDir, "nemu-native-http-downloads")
    val now = System.currentTimeMillis()
    val candidates = directory.listFiles()
      ?.filter { it.isFile && NEMU_NATIVE_HTTP_TEMP_FILE_PATTERN.matches(it.name) }
      ?.sortedBy(File::lastModified)
      ?.toMutableList()
      ?: return

    candidates.removeAll { file ->
      val expired = now - file.lastModified() > NEMU_NATIVE_HTTP_TEMP_MAX_AGE_MS
      expired && file.delete()
    }
    var retainedBytes = candidates.sumOf { it.length().coerceAtLeast(0L) }
    while (
      candidates.size > NEMU_NATIVE_HTTP_TEMP_MAX_FILES ||
      retainedBytes > NEMU_NATIVE_HTTP_TEMP_MAX_BYTES
    ) {
      val oldest = candidates.firstOrNull() ?: break
      // A request currently streaming owns a freshly modified file. Leave that
      // active window alone even if another crash left the directory over cap.
      if (now - oldest.lastModified() <= NEMU_NATIVE_HTTP_TEMP_ACTIVE_GRACE_MS) break
      candidates.removeAt(0)
      val bytes = oldest.length().coerceAtLeast(0L)
      if (oldest.delete()) retainedBytes = (retainedBytes - bytes).coerceAtLeast(0L)
    }
  }

  private fun registerImageMemoryCallbacks() {
    if (imageMemoryCallbacks != null) return
    val context = appContext.reactContext?.applicationContext ?: return
    val callbacks = object : ComponentCallbacks2 {
      override fun onConfigurationChanged(newConfig: Configuration) = Unit

      override fun onLowMemory() {
        clearImageMemoryCache()
        sandboxManagerOwner.current()?.requestRuntimeRecycle()
      }

      @Suppress("DEPRECATION")
      override fun onTrimMemory(level: Int) {
        if (level >= ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW) {
          clearImageMemoryCache()
          sandboxManagerOwner.current()?.requestRuntimeRecycle()
        }
      }
    }
    context.registerComponentCallbacks(callbacks)
    imageMemoryCallbacks = callbacks
    imageMemoryCallbacksContext = context
  }

  private fun unregisterImageMemoryCallbacks() {
    val callbacks = imageMemoryCallbacks ?: return
    imageMemoryCallbacksContext?.unregisterComponentCallbacks(callbacks)
    imageMemoryCallbacks = null
    imageMemoryCallbacksContext = null
  }

  private fun resetMobileSourceProfileAuthState(promise: Promise) {
    // Cancel native source work before clearing every scoped and WebView cookie
    // store so a stale response cannot repopulate the next profile. The sandbox
    // jars are the ones `executeSandboxHttpRequest` and image decoration use,
    // so leaving them behind would carry a source login across the transition.
    nativeHttpCookieStore.clear()
    sandboxCookieStore.clear()
    cancelInFlightWork()

    val settled = AtomicBoolean(false)
    fun resolve() {
      if (settled.compareAndSet(false, true)) {
        promise.resolve(null)
      }
    }
    fun reject(error: Throwable) {
      if (settled.compareAndSet(false, true)) {
        promise.reject(
          "E_SOURCE_AUTH_RESET",
          "Could not clear Android source authentication state.",
          error
        )
      }
    }

    val clearWebViewCookies = {
      try {
        val manager = CookieManager.getInstance()
        manager.removeAllCookies {
          try {
            manager.flush()
            resolve()
          } catch (error: Throwable) {
            reject(error)
          }
        }
      } catch (error: Throwable) {
        reject(error)
      }
    }
    if (Looper.myLooper() == Looper.getMainLooper()) {
      clearWebViewCookies()
    } else {
      Handler(Looper.getMainLooper()).post { clearWebViewCookies() }
    }
  }

  private fun getAidokuSandboxManager(): AidokuSandboxManager {
    return sandboxManagerOwner.getOrCreate {
      val context = appContext.reactContext
        ?: throw IllegalStateException("React Native context is unavailable.")
      AidokuSandboxManager(
        context,
        ::executeSandboxHttpRequest,
        ::decorateSandboxImageHeaders
      )
    }
  }

  private fun <T> settleSandboxPromise(
    future: Future<T>,
    promise: Promise,
    timeoutMs: Long
  ) {
    // Expo dispatches every default AsyncFunction on one shared HandlerThread.
    // Waiting there for a source/network operation would stall unrelated Expo
    // modules (filesystem, background task, image picker) for up to 35 seconds.
    // `runInterruptible` moves only the blocking Future wait to the lifecycle-
    // bound IO scope and cancels it promptly when the AppContext is destroyed.
    appContext.backgroundCoroutineScope.launch {
      try {
        promise.resolve(
          runInterruptible { future.get(timeoutMs, TimeUnit.MILLISECONDS) }
        )
      } catch (error: Throwable) {
        future.cancel(true)
        val cause = error.cause ?: error
        promise.reject(
          "E_AIDOKU_SANDBOX",
          cause.localizedMessage ?: "The isolated Aidoku runtime failed.",
          cause
        )
      }
    }
  }

  private fun sendHttpRequestAsync(
    request: NemuAidokuHttpRequest,
    maxTimeoutMs: Int,
    allowBackground: Boolean,
    promise: Promise
  ) {
    // Expo's default AsyncFunction dispatcher is shared by unrelated native
    // modules. Keep blocking OkHttp I/O on the lifecycle-bound IO dispatcher so
    // a slow source cannot starve SQLite, filesystem, or background-task calls.
    appContext.backgroundCoroutineScope.launch {
      try {
        promise.resolve(
          runInterruptible {
            sendHttpRequest(request, maxTimeoutMs, allowBackground)
          }
        )
      } catch (error: Throwable) {
        promise.reject(
          "E_NATIVE_HTTP",
          error.localizedMessage ?: "The native source request failed.",
          error
        )
      }
    }
  }

  private fun downloadHttpFileAsync(
    request: NemuAidokuHttpFileRequest,
    promise: Promise
  ) {
    appContext.backgroundCoroutineScope.launch {
      try {
        promise.resolve(runInterruptible { downloadHttpFile(request) })
      } catch (error: Throwable) {
        promise.reject(
          "E_NATIVE_HTTP_FILE",
          error.localizedMessage ?: "The native source file download failed.",
          error
        )
      }
    }
  }

  private fun decorateSandboxImageHeaders(
    sourceKey: String,
    urlString: String,
    existingHeaders: Map<String, String>
  ): Map<String, String> {
    val url = urlString.toHttpUrlOrNull() ?: return existingHeaders
    val matchedCookies = sandboxCookieStore.get(sourceKey).loadForRequest(url)
    return mergeAidokuSandboxCookieHeaders(
      existingHeaders,
      matchedCookies.map { it.name to it.value }
    )
  }

  private fun executeSandboxHttpRequest(
    request: AidokuSandboxHttpRequest
  ): AidokuSandboxHttpResponse {
    val timeout = request.timeoutMs.coerceIn(1_000, NEMU_ASYNC_HTTP_MAX_TIMEOUT_MS)
    val scopedCookieJar = sandboxCookieStore.get(request.sourceKey)
    val client = baseHttpClient.newBuilder()
      // BridgeInterceptor replaces an existing Cookie header whenever a client
      // CookieJar returns values. The network interceptor below performs an
      // explicit-source-wins merge and persists each redirect hop instead.
      .cookieJar(CookieJar.NO_COOKIES)
      .addNetworkInterceptor(AidokuSandboxCookieInterceptor(scopedCookieJar))
      .connectTimeout(timeout.toLong(), TimeUnit.MILLISECONDS)
      .readTimeout(timeout.toLong(), TimeUnit.MILLISECONDS)
      .writeTimeout(timeout.toLong(), TimeUnit.MILLISECONDS)
      .callTimeout(timeout.toLong(), TimeUnit.MILLISECONDS)
      .build()
    val nativeRequest = NemuAidokuHttpRequest().apply {
      url = request.url
      method = request.method
      headers = request.headers
      body = request.body
      timeoutMs = timeout
      responseMode = "bytes"
      maxResponseBytes = NEMU_AIDOKU_SANDBOX_MAX_HTTP_BYTES
    }
    val response = executeRequest(client, nativeRequest, allowBackground = true)
    return AidokuSandboxHttpResponse(
      status = response.status,
      headers = response.headers,
      bytes = response.bytes,
      error = response.error
    )
  }

  private fun sendHttpRequest(
    request: NemuAidokuHttpRequest,
    maxTimeoutMs: Int,
    allowBackground: Boolean
  ): Map<String, Any?> {
    val requestId = request.requestId?.trim()?.takeIf { it.isNotEmpty() }
    if (requestId != null) {
      preparedHttpRequestIds.add(requestId)
    }
    try {
      if (request.url.isBlank()) {
        return response(status = 0, error = "Invalid URL.")
      }

      if (!allowBackground && !appIsActive.get()) {
        return response(status = 0, error = "App is not active.")
      }
      if (requestId != null && cancelledHttpRequestIds.contains(requestId)) {
        return response(status = 0, error = "Request cancelled.")
      }

      val timeout = (request.timeoutMs ?: maxTimeoutMs)
        .coerceIn(1000, maxTimeoutMs)
      val cookieScope = request.cookieScope
        ?.trim()
        ?.takeIf { it.isNotEmpty() }
      if (
        cookieScope != null &&
        (
          cookieScope.length > NEMU_COOKIE_SCOPE_MAX_CHARACTERS ||
          cookieScope.any { it.isISOControl() }
        )
      ) {
        return response(status = 0, error = "Invalid native HTTP cookie scope.")
      }
      val clientBuilder = baseHttpClient.newBuilder()
        // A missing scope is intentionally stateless. There is no process-wide
        // fallback jar that could carry authenticated source cookies across a
        // profile boundary.
        .cookieJar(CookieJar.NO_COOKIES)
        .connectTimeout(timeout.toLong(), TimeUnit.MILLISECONDS)
        .readTimeout(timeout.toLong(), TimeUnit.MILLISECONDS)
        .writeTimeout(timeout.toLong(), TimeUnit.MILLISECONDS)
        // connect/read/write are phase deadlines, not a total deadline. Without
        // callTimeout one synchronous host call can consume their sum while the
        // React Native JS thread is unable to process timers or navigation.
        .callTimeout(timeout.toLong(), TimeUnit.MILLISECONDS)
      val scopedCookieJar = cookieScope?.let(nativeHttpCookieStore::get)
      // Apply redirect policy even without a jar so a stateless request cannot
      // forward a caller-authored Cookie header to another origin.
      clientBuilder.addNetworkInterceptor(
        AidokuSandboxCookieInterceptor(scopedCookieJar)
      )
      val client = clientBuilder.build()

      // Never run the interactive Cloudflare solver inline here. Aidoku's WASM
      // host contract is synchronous, so waiting for a WebView would freeze the
      // RN JS thread for up to 45 seconds. The 403/429/503 response is surfaced
      // as CloudflareBlockedError by aidoku-runtime; the Nemu Agent sheet then
      // invokes the non-blocking `solveCloudflare` API and retries explicitly.
      return response(
        executeRequest(client, request, allowBackground),
        handledCloudflare = false,
        responseMode = request.responseMode
      )
    } finally {
      if (requestId != null) {
        releaseHttpRequest(requestId)
      }
    }
  }

  private fun downloadHttpFile(
    request: NemuAidokuHttpFileRequest
  ): Map<String, Any?> {
    val requestId = request.requestId?.trim()?.takeIf { it.isNotEmpty() }
    if (requestId != null) preparedHttpRequestIds.add(requestId)
    try {
      if (request.url.isBlank()) {
        return fileResponse(status = 0, error = "Invalid URL.")
      }
      if (request.maxResponseBytes <= 0) {
        return fileResponse(status = 0, error = "Invalid native HTTP file byte limit.")
      }
      val imagePolicy = try {
        NemuImageMetadataPolicy.requestedPolicy(
          request.maxImageDimension,
          request.maxImagePixels
        )
      } catch (error: IOException) {
        return fileResponse(status = 0, error = error.localizedMessage)
      }
      if (request.allowLongStripSegments && imagePolicy == null) {
        return fileResponse(
          status = 0,
          error = "Segmented image output requires paired image safety limits."
        )
      }
      if (requestId != null && cancelledHttpRequestIds.contains(requestId)) {
        return fileResponse(status = 0, error = "Request cancelled.")
      }

      val timeout = (request.timeoutMs ?: NEMU_ASYNC_HTTP_MAX_TIMEOUT_MS)
        .coerceIn(1_000, NEMU_ASYNC_HTTP_MAX_TIMEOUT_MS)
      val cookieScope = request.cookieScope?.trim()?.takeIf { it.isNotEmpty() }
      if (
        cookieScope != null &&
        (
          cookieScope.length > NEMU_COOKIE_SCOPE_MAX_CHARACTERS ||
          cookieScope.any { it.isISOControl() }
        )
      ) {
        return fileResponse(status = 0, error = "Invalid native HTTP cookie scope.")
      }

      val clientBuilder = baseHttpClient.newBuilder()
        .cookieJar(CookieJar.NO_COOKIES)
        .connectTimeout(timeout.toLong(), TimeUnit.MILLISECONDS)
        .readTimeout(timeout.toLong(), TimeUnit.MILLISECONDS)
        .writeTimeout(timeout.toLong(), TimeUnit.MILLISECONDS)
        .callTimeout(timeout.toLong(), TimeUnit.MILLISECONDS)
      val scopedCookieJar = cookieScope?.let(nativeHttpCookieStore::get)
      clientBuilder.addNetworkInterceptor(
        AidokuSandboxCookieInterceptor(scopedCookieJar)
      )
      val context = appContext.reactContext?.applicationContext
        ?: return fileResponse(status = 0, error = "React Native context is unavailable.")
      pruneNativeHttpTemporaryFiles(context.cacheDir)
      return fileResponse(
        executeFileRequest(
          clientBuilder.build(),
          request,
          context.cacheDir,
          imagePolicy
        )
      )
    } finally {
      if (requestId != null) releaseHttpRequest(requestId)
    }
  }

  private fun executeFileRequest(
    client: OkHttpClient,
    request: NemuAidokuHttpFileRequest,
    cacheDir: File,
    imagePolicy: NemuImageDimensionPolicy?
  ): NativeHttpFileResult {
    var temporaryFile: File? = null
    var retained = false
    return try {
      val parsedUrl = request.url.toHttpUrlOrNull()
      if (request.requireHttps && parsedUrl?.isHttps != true) {
        return NativeHttpFileResult(
          status = 0,
          error = "Native source networking requires HTTPS for this request."
        )
      }
      val requestBuilder = Request.Builder().url(request.url).get()
      if (request.requireHttps) {
        requestBuilder.tag(
          NemuHttpsOnlyRequestPolicy::class.java,
          NemuHttpsOnlyRequestPolicy
        )
      }
      if (!request.headers.keys.any { it.equals("user-agent", ignoreCase = true) }) {
        requestBuilder.header("User-Agent", MOBILE_USER_AGENT)
      }
      NemuNativeHttpRequestHeaderPolicy.normalize(request.headers).forEach { (key, value) ->
        requestBuilder.header(key, value)
      }

      val call = client.newCall(requestBuilder.build())
      val requestId = request.requestId?.trim()?.takeIf { it.isNotEmpty() }
      if (requestId != null && cancelledHttpRequestIds.contains(requestId)) {
        call.cancel()
        return NativeHttpFileResult(status = 0, error = "Request cancelled.")
      }
      inFlightHttpCalls.add(call)
      if (requestId != null) inFlightHttpCallsById[requestId] = call
      if (requestId != null && cancelledHttpRequestIds.contains(requestId)) {
        call.cancel()
      }
      try {
        call.execute().use { httpResponse ->
          val headers = responseHeaders(httpResponse)
          if (httpResponse.code !in 200..299) {
            return NativeHttpFileResult(
              status = httpResponse.code,
              headers = headers,
              error = "HTTP file download failed with status ${httpResponse.code}."
            )
          }
          val body = httpResponse.body
            ?: return NativeHttpFileResult(
              status = httpResponse.code,
              headers = headers,
              error = "HTTP file download returned an empty response body."
            )
          val declaredLength = body.contentLength()
          if (declaredLength > request.maxResponseBytes.toLong()) {
            return NativeHttpFileResult(
              status = httpResponse.code,
              headers = headers,
              error = "HTTP response exceeds the ${request.maxResponseBytes} byte safety limit."
            )
          }

          val nativeDownloadDir = File(cacheDir, "nemu-native-http-downloads")
          if (!nativeDownloadDir.exists() && !nativeDownloadDir.mkdirs()) {
            throw IOException("Could not create the native HTTP download directory.")
          }
          val outputFile = File.createTempFile("nemu-http-", ".part", nativeDownloadDir)
          temporaryFile = outputFile
          var total = 0L
          FileOutputStream(outputFile).use { output ->
            body.byteStream().use { input ->
              val buffer = ByteArray(16 * 1024)
              while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                if (count.toLong() > request.maxResponseBytes.toLong() - total) {
                  throw IOException(
                    "HTTP response exceeds the ${request.maxResponseBytes} byte safety limit."
                  )
                }
                output.write(buffer, 0, count)
                total += count.toLong()
              }
            }
          }
          if (total <= 0L || total != outputFile.length()) {
            throw IOException("HTTP file download produced an empty or incomplete file.")
          }
          var publishedFile = outputFile
          var publishedLength = total
          var publishedHeaders = headers
          if (imagePolicy != null) {
            try {
              NemuImageMetadataPolicy.validateFile(outputFile, imagePolicy)
            } catch (error: NemuImageDimensionLimitException) {
              val plan = NemuLongStripImagePolicy.inspectAndPlan(
                outputFile,
                imagePolicy,
                request.maxResponseBytes.toLong()
              )
              val isCancelled = {
                Thread.currentThread().isInterrupted ||
                  (requestId != null && cancelledHttpRequestIds.contains(requestId))
              }
              // The opt-in segmented attempt and any bounded single-image
              // fallback share one CPU deadline. A late aggregate-byte
              // failure must not restart a second 30-second work window.
              val transcodeDeadlineNanos =
                NemuLongStripImageTranscoder.newRequestDeadlineNanos()
              if (
                request.allowLongStripSegments &&
                request.maxResponseBytes.toLong() >
                  NemuLongStripImageTranscoder.SEGMENTED_MANIFEST_RESERVE_BYTES &&
                plan.container.displayedDimensions.height >
                  plan.container.displayedDimensions.width
              ) {
                try {
                  val transcoded = NemuLongStripImageTranscoder.transcodeSegments(
                    source = outputFile,
                    plan = plan,
                    outputPolicy = imagePolicy,
                    maximumOutputBytes =
                      request.maxResponseBytes.toLong() -
                        NemuLongStripImageTranscoder.SEGMENTED_MANIFEST_RESERVE_BYTES,
                    isCancelled = isCancelled,
                    deadlineNanos = transcodeDeadlineNanos
                  )
                  val segments = transcoded.segments.map { segment ->
                    NativeHttpImageSegmentResult(
                      fileUri = Uri.fromFile(segment.file).toString(),
                      byteLength = segment.byteLength,
                      width = segment.dimensions.width,
                      height = segment.dimensions.height,
                      mimeType = segment.mimeType
                    )
                  }
                  return NativeHttpFileResult(
                    status = httpResponse.code,
                    headers = NemuTranscodedImageResponseHeaders.rewrite(
                      headers,
                      segments.first().mimeType
                    ),
                    kind = "segmented-image",
                    byteLength = transcoded.byteLength,
                    manifestVersion = 1,
                    imageWidth = transcoded.dimensions.width,
                    imageHeight = transcoded.dimensions.height,
                    imageSegments = segments
                  )
                } catch (_: NemuLongStripSegmentOutputLimitException) {
                  // Segment output is an opt-in fidelity enhancement. If its
                  // aggregate encoder budget is exhausted, cleanly fall back
                  // to the already-bounded single-image transcode. Corruption,
                  // cancellation, timeout, decoder, and OOM failures remain
                  // fail-closed and are intentionally not caught here.
                }
              }
              val transcoded = NemuLongStripImageTranscoder.transcode(
                source = outputFile,
                plan = plan,
                outputPolicy = imagePolicy,
                maximumOutputBytes = request.maxResponseBytes.toLong(),
                isCancelled = isCancelled,
                deadlineNanos = transcodeDeadlineNanos
              )
              publishedFile = transcoded.file
              publishedLength = transcoded.byteLength
              publishedHeaders = NemuTranscodedImageResponseHeaders.rewrite(
                headers,
                transcoded.mimeType
              )
            }
          }
          // The normal download is returned directly. A transcoded download is
          // a separate, atomically published file, so the existing finally
          // cleanup retires only its oversized source temporary.
          retained = publishedFile == outputFile
          NativeHttpFileResult(
            status = httpResponse.code,
            headers = publishedHeaders,
            fileUri = Uri.fromFile(publishedFile).toString(),
            byteLength = publishedLength
          )
        }
      } finally {
        inFlightHttpCalls.remove(call)
        if (requestId != null) inFlightHttpCallsById.remove(requestId, call)
      }
    } catch (error: Exception) {
      NativeHttpFileResult(
        status = 0,
        error = error.localizedMessage ?: "Native HTTP file download failed."
      )
    } finally {
      if (!retained) temporaryFile?.delete()
    }
  }

  private fun executeRequest(
    client: OkHttpClient,
    request: NemuAidokuHttpRequest,
    allowBackground: Boolean = false
  ): NativeHttpResult {
    return try {
      val parsedUrl = request.url.toHttpUrlOrNull()
      if (request.requireHttps && parsedUrl?.isHttps != true) {
        return NativeHttpResult(
          status = 0,
          error = "Native source networking requires HTTPS for this request."
        )
      }
      val method = request.method.ifBlank { "GET" }.uppercase(Locale.US)
      val contentType = request.headers.entries.firstOrNull {
        it.key.equals("content-type", ignoreCase = true)
      }?.value?.toMediaTypeOrNull()
      val body = request.body
      val requestBody = when {
        method == "GET" || method == "HEAD" -> null
        body != null -> body.toByteArray(StandardCharsets.UTF_8).toRequestBody(contentType)
        method == "POST" || method == "PUT" || method == "PATCH" ->
          ByteArray(0).toRequestBody(contentType)
        else -> null
      }

      val requestBuilder = Request.Builder()
        .url(request.url)
        .method(method, requestBody)
      if (request.requireHttps) {
        requestBuilder.tag(
          NemuHttpsOnlyRequestPolicy::class.java,
          NemuHttpsOnlyRequestPolicy
        )
      }
      if (!request.headers.keys.any { it.equals("user-agent", ignoreCase = true) }) {
        requestBuilder.header("User-Agent", MOBILE_USER_AGENT)
      }
      NemuNativeHttpRequestHeaderPolicy.normalize(request.headers).forEach { (key, value) ->
        requestBuilder.header(key, value)
      }

      val call = client.newCall(requestBuilder.build())
      val requestId = request.requestId?.trim()?.takeIf { it.isNotEmpty() }
      if (requestId != null && cancelledHttpRequestIds.contains(requestId)) {
        call.cancel()
        return NativeHttpResult(status = 0, error = "Request cancelled.")
      }
      if (!allowBackground && !appIsActive.get()) {
        call.cancel()
        return NativeHttpResult(status = 0, error = "App is not active.")
      }
      inFlightHttpCalls.add(call)
      if (!allowBackground) {
        foregroundOnlyHttpCalls.add(call)
      }
      if (requestId != null) {
        inFlightHttpCallsById[requestId] = call
      }
      // Close the race where the activity backgrounds between the active check
      // and registration. The lifecycle callback will cancel a registered call;
      // this second check covers a callback that ran just before registration.
      if (
        (!allowBackground && !appIsActive.get()) ||
        (requestId != null && cancelledHttpRequestIds.contains(requestId))
      ) {
        call.cancel()
      }
      try {
        call.execute().use { httpResponse ->
          val bytes = readResponseBytes(
            httpResponse.body,
            request.maxResponseBytes?.takeIf { it >= 0 }
          )
          NativeHttpResult(
            status = httpResponse.code,
            headers = responseHeaders(httpResponse),
            bytes = bytes,
            error = null
          )
        }
      } finally {
        inFlightHttpCalls.remove(call)
        foregroundOnlyHttpCalls.remove(call)
        if (requestId != null) {
          inFlightHttpCallsById.remove(requestId, call)
        }
      }
    } catch (error: Exception) {
      NativeHttpResult(status = 0, error = error.localizedMessage ?: "Request failed.")
    }
  }

  private fun readResponseBytes(body: ResponseBody?, maxResponseBytes: Int?): ByteArray {
    if (body == null) return ByteArray(0)
    if (maxResponseBytes == null) return body.bytes()

    val declaredLength = body.contentLength()
    if (declaredLength > maxResponseBytes.toLong()) {
      throw IOException("HTTP response exceeds the $maxResponseBytes byte safety limit.")
    }

    val initialCapacity = if (declaredLength in 1..maxResponseBytes.toLong()) {
      declaredLength.toInt()
    } else {
      minOf(maxResponseBytes, 16 * 1024)
    }
    val output = ByteArrayOutputStream(initialCapacity)
    val chunk = ByteArray(16 * 1024)
    body.byteStream().use { input ->
      while (true) {
        val count = input.read(chunk)
        if (count < 0) break
        if (count > maxResponseBytes - output.size()) {
          throw IOException("HTTP response exceeds the $maxResponseBytes byte safety limit.")
        }
        output.write(chunk, 0, count)
      }
    }
    return output.toByteArray()
  }

  private fun cancelInFlightWork() {
    cancelledHttpRequestIds.addAll(preparedHttpRequestIds)
    inFlightHttpCalls.forEach { it.cancel() }
  }

  private fun cancelForegroundOnlyWork() {
    foregroundOnlyHttpCalls.forEach { it.cancel() }
  }

  private fun prepareHttpRequest(requestId: String): Boolean {
    val normalized = requestId.trim()
    if (normalized.isEmpty()) return false
    cancelledHttpRequestIds.remove(normalized)
    preparedHttpRequestIds.add(normalized)
    return appIsActive.get()
  }

  private fun cancelHttpRequest(requestId: String): Boolean {
    val normalized = requestId.trim()
    if (normalized.isEmpty()) return false
    val wasPrepared = preparedHttpRequestIds.contains(normalized)
    if (wasPrepared) {
      cancelledHttpRequestIds.add(normalized)
    }
    val call = inFlightHttpCallsById.remove(normalized)
    call?.cancel()
    return wasPrepared || call != null
  }

  private fun releaseHttpRequest(requestId: String) {
    val normalized = requestId.trim()
    if (normalized.isEmpty()) return
    inFlightHttpCallsById.remove(normalized)?.cancel()
    preparedHttpRequestIds.remove(normalized)
    cancelledHttpRequestIds.remove(normalized)
  }

  private fun responseHeaders(httpResponse: Response): Map<String, String> {
    return httpResponse.headers.names().associate { name ->
      name.lowercase(Locale.US) to httpResponse.headers.values(name).joinToString(", ")
    }
  }

  private fun solveCloudflareAsync(url: String, promise: Promise) {
    sendEvent(
      "nemuAidokuCfFailed",
      mapOf(
        "url" to url,
        "reason" to "Secure Cloudflare verification is unavailable on this platform."
      )
    )
    promise.resolve(false)
  }

  private fun response(
    result: NativeHttpResult,
    handledCloudflare: Boolean,
    responseMode: String = "both"
  ): Map<String, Any?> {
    return response(
      status = result.status,
      headers = result.headers,
      bytes = result.bytes,
      error = result.error,
      handledCloudflare = handledCloudflare,
      responseMode = responseMode
    )
  }

  private fun fileResponse(result: NativeHttpFileResult): Map<String, Any?> {
    return mapOf(
      "status" to result.status,
      "headers" to result.headers,
      "kind" to result.kind,
      "fileUri" to result.fileUri,
      "byteLength" to result.byteLength,
      "manifestVersion" to result.manifestVersion,
      "imageWidth" to result.imageWidth,
      "imageHeight" to result.imageHeight,
      "imageSegments" to result.imageSegments.map { segment ->
        mapOf(
          "fileUri" to segment.fileUri,
          "byteLength" to segment.byteLength,
          "width" to segment.width,
          "height" to segment.height,
          "mimeType" to segment.mimeType
        )
      },
      "error" to result.error
    )
  }

  private fun fileResponse(
    status: Int,
    headers: Map<String, String> = emptyMap(),
    fileUri: String? = null,
    byteLength: Long? = null,
    error: String?
  ): Map<String, Any?> {
    return mapOf(
      "status" to status,
      "headers" to headers,
      "kind" to "file",
      "fileUri" to fileUri,
      "byteLength" to byteLength,
      "error" to error
    )
  }

  private fun resolvedResponseMode(
    requestedMode: String,
    headers: Map<String, String>
  ): String {
    val normalized = requestedMode.lowercase(Locale.US)
    if (normalized == "text" || normalized == "bytes" || normalized == "both") {
      return normalized
    }
    val contentType = headers.entries.firstOrNull {
      it.key.equals("content-type", ignoreCase = true)
    }?.value?.lowercase(Locale.US)
    if (contentType.isNullOrBlank()) return "both"
    return if (
      contentType.startsWith("text/") ||
      contentType.contains("json") ||
      contentType.contains("xml") ||
      contentType.contains("javascript") ||
      contentType.contains("x-www-form-urlencoded") ||
      contentType.contains("graphql")
    ) "text" else "bytes"
  }

  private fun response(
    status: Int,
    headers: Map<String, String> = emptyMap(),
    bytes: ByteArray = ByteArray(0),
    error: String?,
    handledCloudflare: Boolean = false,
    responseMode: String = "both"
  ): Map<String, Any?> {
    val mode = resolvedResponseMode(responseMode, headers)
    return mapOf(
      "status" to status,
      "headers" to headers,
      "body" to if (mode == "bytes") null else String(bytes, StandardCharsets.UTF_8),
      "bytesBase64" to if (mode == "text") null else Base64.encodeToString(bytes, Base64.NO_WRAP),
      "error" to error,
      "handledCloudflare" to handledCloudflare
    )
  }
}
