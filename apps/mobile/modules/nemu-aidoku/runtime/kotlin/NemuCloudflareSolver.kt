package pm.nemu.mobile.aidoku

import android.app.Activity
import android.app.Dialog
import android.graphics.Color
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.Window
import android.webkit.CookieManager
import android.webkit.ServiceWorkerClient
import android.webkit.ServiceWorkerController
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import java.io.ByteArrayInputStream
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import org.json.JSONObject

/**
 * The User-Agent the Aidoku runtime puts on every source request unless the
 * source package overrides it. A Cloudflare clearance cookie is bound to the
 * User-Agent that solved the challenge, so the solver WebView must present
 * exactly the string the follow-up source requests will send. Mirrored in JS
 * as `MOBILE_AIDOKU_DEFAULT_USER_AGENT` and in
 * `ios/NemuAidokuCloudflareSolver.swift`.
 */
internal const val NEMU_AIDOKU_DEFAULT_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 " +
    "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"

internal const val NEMU_CLOUDFLARE_CLEARANCE_COOKIE = "cf_clearance"

/** Hidden phase only. Once the dialog is up the user owns the pace. */
private const val NEMU_CLOUDFLARE_HIDDEN_TIMEOUT_MS = 12_000L

/**
 * First moment a still-interactive challenge escalates to the visible dialog.
 * The probe below keeps running afterwards, so a challenge that only renders
 * its widget after an initial scripted round trip escalates on the next tick
 * (the ~6s recheck) instead of waiting for the hidden-phase deadline.
 */
private const val NEMU_CLOUDFLARE_FIRST_INTERACTION_PROBE_MS = 3_000L
private const val NEMU_CLOUDFLARE_PROBE_INTERVAL_MS = 700L
private const val NEMU_CLOUDFLARE_MAX_QUEUED_SOLVES = 8

/**
 * The hidden WebView still needs a plausible viewport: a genuinely 0x0 web
 * content view never lays out, so the challenge script cannot run. The web
 * content gets a phone-sized frame inside a 1x1 clipping container parked
 * behind every other view in the activity's content root.
 */
private const val NEMU_CLOUDFLARE_HIDDEN_CONTENT_WIDTH_DP = 390
private const val NEMU_CLOUDFLARE_HIDDEN_CONTENT_HEIGHT_DP = 844

/** Bounds one solve's contribution to a jar that already has size caps. */
private const val NEMU_CLOUDFLARE_MAX_ADOPTED_COOKIE_BYTES = 32 * 1024

/**
 * Bounds the pre-solve expiry sweep. Each name is written once per
 * (domain, path) pair, so the sweep is O(names x domains x paths) writes into
 * the shared [CookieManager] and a hostile jar must not be able to stall the
 * main thread with it.
 */
private const val NEMU_CLOUDFLARE_MAX_EXPIRED_COOKIE_NAMES = 64

/**
 * Stable, machine-readable `nemuAidokuCfFailed` reasons. The JS Nemu Agent
 * sheet maps these onto localized copy; anything unknown falls back to the
 * generic failure string. Mirrors `NemuCloudflareSolveFailure` on iOS.
 */
internal enum class NemuCloudflareSolveFailure(val reason: String) {
  UNSUPPORTED_URL("unsupported-url"),
  BLOCKED_DESTINATION("blocked-destination"),
  RULE_LIST_UNAVAILABLE("rule-list-unavailable"),
  NO_PRESENTER("no-presenter"),
  NAVIGATION_FAILED("navigation-failed"),
  TIMEOUT("timeout"),
  CANCELLED("cancelled"),
  QUEUE_OVERFLOW("queue-overflow"),
  INTERRUPTED("interrupted"),

  /**
   * The url names a host this source never reached, or names it without a
   * cookie scope at all. Only hosts that answered one of this source's own
   * requests with a Cloudflare mitigation can be solved.
   */
  UNSOLICITED_HOST("unsolicited-host")
}

/** What the DOM says about the current page. */
private data class NemuCloudflareChallengeProbe(
  val isChallenge: Boolean,
  val needsInteraction: Boolean
) {
  companion object {
    /** Unknown reads stay "still a challenge" so nothing false-succeeds. */
    val EMPTY = NemuCloudflareChallengeProbe(isChallenge = true, needsInteraction = false)
  }
}

/**
 * Reads the markers Cloudflare's interstitial exposes. Kept to element and
 * title lookups so nothing about the page is exfiltrated back into native.
 * `evaluateJavascript` JSON-encodes the completion value, so the script yields
 * the object directly rather than a stringified copy.
 */
private val NEMU_CLOUDFLARE_PROBE_SCRIPT = """
(function () {
  var title = "";
  try { title = document.title || ""; } catch (error) { title = ""; }
  var turnstile = !!document.querySelector('input[name="cf-turnstile-response"]');
  var errorPanel = !!(
    document.querySelector('#challenge-error-title') ||
    document.querySelector('#challenge-error-text')
  );
  var running = !!(
    document.querySelector('#challenge-running') ||
    document.querySelector('#cf-challenge-running') ||
    document.querySelector('#challenge-form') ||
    document.querySelector('#cf-please-wait')
  );
  var needsInteraction = turnstile || errorPanel;
  return {
    challenge: needsInteraction || running || title === "Just a moment...",
    needsInteraction: needsInteraction
  };
})();
""".trimIndent()

/**
 * Serialized, on-demand Cloudflare challenge solver.
 *
 * This never runs inline. `solveCloudflare` is an explicit async API the JS
 * Nemu Agent sheet calls *after* the Aidoku runtime already classified a source
 * failure as a Cloudflare challenge; the synchronous WASM HTTP path is
 * untouched and keeps failing fast. Exactly one solve runs at a time: a second
 * request for the same host joins the in-flight solve, a request for a
 * different host queues behind it.
 *
 * **Cookie-store limitation.** Unlike iOS (`WKWebsiteDataStore.nonPersistent`),
 * an Android WebView always reads and writes the process-wide [CookieManager];
 * there is no per-WebView cookie store. The solver expires the challenge host's
 * cookies in that global store before loading — across the parent-domain and
 * path chains, because a cookie's identity is (name, domain, path) — and then
 * takes the post-sweep header as this solve's baseline. Only pairs that are new
 * or changed relative to that baseline are adopted, so whatever the sweep could
 * not reach (a cookie scoped to a path this url does not name) stays out of the
 * source's jar instead of being inherited from some other scope's earlier
 * solve. It is still not a private store: another WebView in the process would
 * observe the challenge host's cookies while a solve is running.
 *
 * **WebSockets are not gated.** Chromium routes a `WebSocket` handshake through
 * neither [android.webkit.WebViewClient.shouldInterceptRequest] nor
 * `shouldOverrideUrlLoading`, and the stable WebView API exposes no hook that
 * sees it — so the allow-list this solver enforces covers document, subframe
 * and subresource loads, and service-worker fetches (via
 * [NemuCloudflareServiceWorkerGate]), but not `ws:`/`wss:`. What still applies:
 * the challenge document is https and `MIXED_CONTENT_NEVER_ALLOW` is set, so
 * Chromium blocks plain `ws:` from it as mixed content, which leaves only
 * `wss:` to a host presenting a certificate the system trusts — a far cry from
 * arbitrary LAN probing, but not nothing. A CSP `connect-src` would be the
 * textbook fix and is not available here: `<meta http-equiv>` is only honoured
 * inside `<head>`, a document-start script runs before `<head>` exists (and
 * needs `androidx.webkit`'s `DOCUMENT_START_SCRIPT`, which this module does not
 * depend on), and it would not reach the cross-origin Turnstile iframe, which
 * carries Cloudflare's own policy. iOS has no equivalent gap: WebKit runs
 * content rule lists for WebSocket handshakes too.
 *
 * All state below is main-thread only (WebView requires it).
 */
internal class NemuCloudflareSolver(
  private val activityProvider: () -> Activity?,
  private val emit: (String, Map<String, Any?>) -> Unit,
  private val adoptCookies: (cookieScope: String?, url: HttpUrl, cookieHeader: String) -> Unit,
  private val storedClearance: (cookieScope: String?, url: HttpUrl) -> String?,
  /**
   * "Did this source's own traffic hit a Cloudflare mitigation on this host,
   * recently?" A source names the challenge url, so nothing else proves the
   * WebView is being pointed at an origin the source actually talked to.
   */
  private val allowsChallengeHost: (cookieScope: String?, host: String) -> Boolean
) {
  private data class QueuedSolve(
    val url: HttpUrl,
    val challengeHost: String,
    val cookieScope: String?,
    val userAgent: String,
    val completions: MutableList<(Boolean) -> Unit>
  )

  private val main = Handler(Looper.getMainLooper())
  private val queue = ArrayDeque<QueuedSolve>()
  private var active: Session? = null

  /** Resolves `false` instead of throwing for every expected failure. */
  fun solve(
    urlString: String,
    cookieScope: String?,
    userAgent: String?,
    completion: (Boolean) -> Unit
  ) {
    val normalizedScope = normalizedCookieScope(cookieScope)
    val resolvedUserAgent = normalizedUserAgent(userAgent)
    val url = urlString.toHttpUrlOrNull()
    val challengeHost = url?.let { NemuCloudflareChallengePolicy.challengeHost(it) }
    if (url == null || challengeHost == null) {
      failImmediately(urlString, NemuCloudflareSolveFailure.UNSUPPORTED_URL, completion)
      return
    }
    // A scope is mandatory here even though the HTTP path treats a missing one
    // as "stateless": without it there is no record of what this source
    // reached, and a solve would have nowhere to publish its cookies either.
    if (normalizedScope == null || !allowsChallengeHost(normalizedScope, challengeHost)) {
      failImmediately(urlString, NemuCloudflareSolveFailure.UNSOLICITED_HOST, completion)
      return
    }
    // The address policy is the same gate direct source HTTP uses: https only,
    // resolvable to a public address, no literal or reserved destination.
    try {
      NemuNativeHttpAddressPolicy.requirePublicDestination(challengeHost)
      NemuNativeHttpAddressPolicy.resolvePublicAddresses(challengeHost) {
        java.net.InetAddress.getAllByName(it).toList()
      }
    } catch (error: Throwable) {
      failImmediately(urlString, NemuCloudflareSolveFailure.BLOCKED_DESTINATION, completion)
      return
    }
    main.post {
      enqueue(
        QueuedSolve(
          url = url,
          challengeHost = challengeHost,
          cookieScope = normalizedScope,
          userAgent = resolvedUserAgent,
          completions = mutableListOf(completion)
        )
      )
    }
  }

  /** Fails every in-flight and queued solve (app context teardown, profile switch). */
  fun cancelAll() {
    cancelEverything(NemuCloudflareSolveFailure.INTERRUPTED)
  }

  /**
   * The user closed the Nemu Agent sheet. Same teardown as [cancelAll] — the
   * presented challenge dialog is dismissed with the session — but reported as
   * a cancellation rather than an interruption.
   */
  fun cancelUserSolves() {
    cancelEverything(NemuCloudflareSolveFailure.CANCELLED)
  }

  private fun cancelEverything(failure: NemuCloudflareSolveFailure) {
    main.post {
      while (queue.isNotEmpty()) {
        val pending = queue.removeFirst()
        emitFailure(pending.url.toString(), failure)
        pending.completions.forEach { it(false) }
      }
      active?.abort(failure)
    }
  }

  private fun failImmediately(
    urlString: String,
    failure: NemuCloudflareSolveFailure,
    completion: (Boolean) -> Unit
  ) {
    main.post {
      emitFailure(urlString, failure)
      completion(false)
    }
  }

  private fun emitFailure(urlString: String, failure: NemuCloudflareSolveFailure) {
    emit("nemuAidokuCfFailed", mapOf("url" to urlString, "reason" to failure.reason))
  }

  /**
   * Two solves may only be merged when they would publish their cookies into
   * the same jar. Keying the merge on the host alone let two sources that happen
   * to share a challenge host join one solve, after which the adopted clearance
   * landed in the *first* requester's scope while every joiner was still told
   * `true` — and then made its next request without a clearance cookie. The
   * scope is part of the identity, so it is part of the key.
   */
  private fun enqueue(solve: QueuedSolve) {
    val current = active
    if (
      current != null &&
      current.challengeHost == solve.challengeHost &&
      current.cookieScope == solve.cookieScope
    ) {
      // Several screens can report the same challenge at once. They all wait on
      // the one solve rather than restarting it.
      current.addCompletions(solve.completions)
      return
    }
    val queued = queue.firstOrNull {
      it.challengeHost == solve.challengeHost && it.cookieScope == solve.cookieScope
    }
    if (queued != null) {
      queued.completions.addAll(solve.completions)
      return
    }
    if (current != null) {
      if (queue.size >= NEMU_CLOUDFLARE_MAX_QUEUED_SOLVES) {
        emitFailure(solve.url.toString(), NemuCloudflareSolveFailure.QUEUE_OVERFLOW)
        solve.completions.forEach { it(false) }
        return
      }
      queue.addLast(solve)
      return
    }
    start(solve)
  }

  private fun start(solve: QueuedSolve) {
    val session = Session(solve)
    active = session
    session.begin()
  }

  private fun finish(session: Session) {
    if (active !== session) return
    active = null
    if (queue.isNotEmpty()) start(queue.removeFirst())
  }

  // MARK: - One solve

  /** Owns a single hidden-then-maybe-visible WebView solve. Main thread only. */
  private inner class Session(
    private val solve: QueuedSolve
  ) : NemuCloudflareSolverSessionCallbacks {
    val challengeHost: String get() = solve.challengeHost
    val cookieScope: String? get() = solve.cookieScope

    private var webView: WebView? = null
    private var hiddenContainer: FrameLayout? = null
    private var dialog: Dialog? = null
    private var startedAtMs = 0L
    private var baselineClearance: String? = null
    /**
     * The challenge host's cookies as they stood once the pre-solve sweep had
     * run. Everything this solve adopts is a diff against it, so a cookie some
     * other scope's earlier solve left in the process-wide jar is never adopted
     * and never mistaken for this solve's own clearance.
     */
    private var baselineCookieHeader: String = ""
    private var didEmitWaiting = false
    private var probeInFlight = false
    private var finished = false
    private var settled = false

    private val probeRunnable = object : Runnable {
      override fun run() {
        if (finished) return
        probe()
        main.postDelayed(this, NEMU_CLOUDFLARE_PROBE_INTERVAL_MS)
      }
    }

    private val timeoutRunnable = Runnable {
      if (!finished && dialog == null) fail(NemuCloudflareSolveFailure.TIMEOUT)
    }

    fun addCompletions(next: List<(Boolean) -> Unit>) {
      if (settled) {
        next.forEach { it(false) }
        return
      }
      solve.completions.addAll(next)
    }

    fun abort(failure: NemuCloudflareSolveFailure) = fail(failure)

    fun begin() {
      emit("nemuAidokuCfSolveStart", mapOf("url" to solve.url.toString()))
      // Remember the clearance the source already holds so a stale cookie left
      // over from the failed request cannot be mistaken for a fresh solve.
      baselineClearance = storedClearance(solve.cookieScope, solve.url)
      load()
    }

    private fun load() {
      val activity = activityProvider()
      val root = activity?.window?.decorView?.findViewById<ViewGroup>(android.R.id.content)
      if (activity == null || root == null) {
        fail(NemuCloudflareSolveFailure.NO_PRESENTER)
        return
      }

      val cookies = runCatching { CookieManager.getInstance() }.getOrNull()
      if (cookies == null) {
        // No Android System WebView in this process; nothing can be solved.
        fail(NemuCloudflareSolveFailure.NAVIGATION_FAILED)
        return
      }
      // Closest available stand-in for a fresh per-solve store: expire whatever
      // the shared CookieManager holds for this host before the challenge runs,
      // so a stale clearance cannot be read back as this solve's result.
      baselineCookieHeader = expireHostCookies(cookies, solve.url)
      // Service-worker fetches never reach the WebViewClient; gate them too.
      NemuCloudflareServiceWorkerGate.install()
      NemuCloudflareServiceWorkerGate.open(solve.challengeHost)

      val view = runCatching { WebView(activity) }.getOrNull()
      if (view == null) {
        fail(NemuCloudflareSolveFailure.NAVIGATION_FAILED)
        return
      }
      configure(view, cookies)
      view.webViewClient = SolverWebViewClient(this, solve.challengeHost)

      val density = activity.resources.displayMetrics
      val width = TypedValue.applyDimension(
        TypedValue.COMPLEX_UNIT_DIP,
        NEMU_CLOUDFLARE_HIDDEN_CONTENT_WIDTH_DP.toFloat(),
        density
      ).toInt()
      val height = TypedValue.applyDimension(
        TypedValue.COMPLEX_UNIT_DIP,
        NEMU_CLOUDFLARE_HIDDEN_CONTENT_HEIGHT_DP.toFloat(),
        density
      ).toInt()
      view.layoutParams = FrameLayout.LayoutParams(width, height)

      val container = FrameLayout(activity)
      container.layoutParams = ViewGroup.LayoutParams(1, 1)
      container.clipChildren = true
      container.clipToPadding = true
      container.alpha = 0.02f
      container.isEnabled = false
      container.addView(view)
      root.addView(container, 0)

      webView = view
      hiddenContainer = container
      startedAtMs = SystemClock.elapsedRealtime()

      // The UA comes from `settings.userAgentString`, which also applies to
      // every subresource the challenge fetches — a per-request header would
      // only cover the document.
      view.loadUrl(solve.url.toString())

      emitWaitingOnce()
      main.postDelayed(timeoutRunnable, NEMU_CLOUDFLARE_HIDDEN_TIMEOUT_MS)
      main.postDelayed(probeRunnable, NEMU_CLOUDFLARE_PROBE_INTERVAL_MS)
    }

    // `allowFileAccessFromFileURLs` / `allowUniversalAccessFromFileURLs` are
    // deprecated (their defaults are already false), but this is a security
    // boundary for a source-controlled page: state it rather than inherit it.
    @Suppress("DEPRECATION")
    private fun configure(view: WebView, cookies: CookieManager) {
      cookies.setAcceptCookie(true)
      cookies.setAcceptThirdPartyCookies(view, true)
      view.settings.apply {
        // The challenge is a JavaScript program; it cannot be solved with
        // scripting off. Everything else the page could reach is closed.
        javaScriptEnabled = true
        domStorageEnabled = true
        userAgentString = solve.userAgent
        allowFileAccess = false
        allowContentAccess = false
        allowFileAccessFromFileURLs = false
        allowUniversalAccessFromFileURLs = false
        javaScriptCanOpenWindowsAutomatically = false
        setSupportMultipleWindows(false)
        mediaPlaybackRequiresUserGesture = true
        setGeolocationEnabled(false)
        mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        cacheMode = WebSettings.LOAD_NO_CACHE
        loadsImagesAutomatically = true
      }
      view.isVerticalScrollBarEnabled = false
      view.isHorizontalScrollBarEnabled = false
      view.setBackgroundColor(Color.TRANSPARENT)
    }

    /**
     * Expires every cookie the shared jar would send to the challenge host, and
     * returns whatever survived — this solve's baseline.
     *
     * A cookie's identity is (name, domain, path). The old sweep wrote one
     * `name=; Max-Age=0; Path=/` per name against `https://host/`, which only
     * reached host-only, root-path cookies and left every `Domain=.parent` and
     * `Path=/x` sibling in place — so a later read could pick up a cookie some
     * *other* scope's solve had set. The sweep now walks the parent-domain
     * chain and the url's own path chain, and names are collected from both the
     * origin and the full url so path-scoped cookies are seen at all.
     *
     * It still cannot be exhaustive (a cookie scoped to a path this url does
     * not name survives), which is why the return value matters: [evaluate]
     * adopts only what is new or changed relative to it.
     */
    private fun expireHostCookies(cookies: CookieManager, url: HttpUrl): String {
      val origin = "https://${url.host}/"
      fun read(scope: String): String =
        runCatching { cookies.getCookie(scope).orEmpty() }.getOrDefault("")

      val names = LinkedHashSet<String>()
      for (scope in listOf(origin, url.toString())) {
        NemuCloudflareChallengePolicy.cookiePairs(read(scope)).forEach { (name, _) ->
          names.add(name)
        }
      }
      if (names.isNotEmpty()) {
        val domains = NemuCloudflareChallengePolicy.cookieExpiryDomains(url.host)
        val paths = NemuCloudflareChallengePolicy.cookieExpiryPaths(url.encodedPath)
        for (name in names.take(NEMU_CLOUDFLARE_MAX_EXPIRED_COOKIE_NAMES)) {
          for (domain in domains) {
            for (path in paths) {
              val expiry = buildString {
                append(name).append("=; Max-Age=0; Path=").append(path)
                if (domain != null) append("; Domain=").append(domain)
                // `__Secure-`/`__Host-` prefixed names are only accepted with
                // `Secure`; the origin is https, so it costs nothing to set.
                append("; Secure")
              }
              runCatching { cookies.setCookie(origin, expiry) }
            }
          }
        }
        runCatching { cookies.flush() }
      }
      return read(origin)
    }

    private fun emitWaitingOnce() {
      if (didEmitWaiting) return
      didEmitWaiting = true
      emit("nemuAidokuCfWaiting", mapOf("url" to solve.url.toString()))
    }

    // MARK: - Detection

    override fun onPageFinished() {
      emitWaitingOnce()
      probe()
    }

    override fun onNavigationFailed() {
      // A blocked subresource surfaces here too; it must not kill an otherwise
      // healthy challenge, and neither must anything once the user is driving.
      if (finished || dialog != null) return
      fail(NemuCloudflareSolveFailure.NAVIGATION_FAILED)
    }

    /**
     * Reads the DOM markers and the challenge host's cookies together. A solve
     * is complete when a `cf_clearance` cookie for the challenge host exists,
     * its value differs from the one the source already had, and the page is no
     * longer a challenge document.
     */
    private fun probe() {
      val view = webView ?: return
      if (finished || probeInFlight) return
      probeInFlight = true
      view.evaluateJavascript(NEMU_CLOUDFLARE_PROBE_SCRIPT) { value ->
        probeInFlight = false
        if (finished) return@evaluateJavascript
        evaluate(parseProbe(value), readHostCookieHeader())
      }
    }

    private fun readHostCookieHeader(): String {
      val origin = "https://${solve.url.host}/"
      return runCatching {
        CookieManager.getInstance().getCookie(origin).orEmpty()
      }.getOrDefault("")
    }

    private fun evaluate(probe: NemuCloudflareChallengeProbe, cookieHeader: String) {
      // Only the pairs this solve actually produced. The process-wide jar can
      // still be carrying another scope's earlier solve; adopting that would
      // move one source's session into another's jar, and reading its
      // `cf_clearance` would report "solved" for a challenge nothing answered.
      val solved = NemuCloudflareChallengePolicy.newOrChangedCookieHeader(
        baselineCookieHeader,
        cookieHeader
      )
      val clearance = clearanceValue(solved)
      if (clearance != null && clearance != baselineClearance && !probe.isChallenge) {
        succeed(solved)
        return
      }
      if (dialog != null || !probe.needsInteraction) return
      val elapsed = SystemClock.elapsedRealtime() - startedAtMs
      if (elapsed < NEMU_CLOUDFLARE_FIRST_INTERACTION_PROBE_MS) return
      present()
    }

    private fun clearanceValue(cookieHeader: String): String? {
      if (cookieHeader.isBlank()) return null
      return cookieHeader.split(";").asSequence()
        .map { it.trim() }
        .mapNotNull { pair ->
          val separator = pair.indexOf('=')
          if (separator <= 0) return@mapNotNull null
          val name = pair.substring(0, separator).trim()
          if (name != NEMU_CLOUDFLARE_CLEARANCE_COOKIE) return@mapNotNull null
          pair.substring(separator + 1).trim()
        }
        .firstOrNull()
    }

    private fun parseProbe(value: String?): NemuCloudflareChallengeProbe {
      if (value.isNullOrBlank() || value == "null") return NemuCloudflareChallengeProbe.EMPTY
      return runCatching {
        val json = JSONObject(value)
        NemuCloudflareChallengeProbe(
          isChallenge = json.optBoolean("challenge", true),
          needsInteraction = json.optBoolean("needsInteraction", false)
        )
      }.getOrDefault(NemuCloudflareChallengeProbe.EMPTY)
    }

    // MARK: - Visible dialog

    private fun present() {
      val view = webView ?: return
      if (dialog != null) return
      val activity = activityProvider()
      if (activity == null || activity.isFinishing) {
        fail(NemuCloudflareSolveFailure.NO_PRESENTER)
        return
      }
      // The user now drives the pace, so the hidden-phase deadline is dropped.
      main.removeCallbacks(timeoutRunnable)

      hiddenContainer?.removeAllViews()
      (hiddenContainer?.parent as? ViewGroup)?.removeView(hiddenContainer)
      hiddenContainer = null

      val presented = buildDialog(activity, view)
      dialog = presented
      runCatching { presented.show() }.onFailure {
        dialog = null
        fail(NemuCloudflareSolveFailure.NO_PRESENTER)
        return
      }
      emit("nemuAidokuCfCaptcha", mapOf("url" to solve.url.toString()))
    }

    private fun buildDialog(activity: Activity, view: WebView): Dialog {
      val content = LinearLayout(activity).apply {
        orientation = LinearLayout.VERTICAL
        layoutParams = ViewGroup.LayoutParams(
          ViewGroup.LayoutParams.MATCH_PARENT,
          ViewGroup.LayoutParams.MATCH_PARENT
        )
      }
      val header = LinearLayout(activity).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        val padding = TypedValue.applyDimension(
          TypedValue.COMPLEX_UNIT_DIP,
          12f,
          activity.resources.displayMetrics
        ).toInt()
        setPadding(padding, padding, padding, padding)
      }
      header.addView(
        TextView(activity).apply {
          text = solve.challengeHost
          textSize = 15f
          layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        }
      )
      header.addView(
        Button(activity).apply {
          text = activity.getString(android.R.string.cancel)
          setOnClickListener { fail(NemuCloudflareSolveFailure.CANCELLED) }
        }
      )
      content.addView(header)
      view.layoutParams = LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        0,
        1f
      )
      view.isEnabled = true
      view.visibility = View.VISIBLE
      content.addView(view)

      return Dialog(activity).apply {
        requestWindowFeature(Window.FEATURE_NO_TITLE)
        setContentView(content)
        setCanceledOnTouchOutside(false)
        setCancelable(true)
        window?.setLayout(
          ViewGroup.LayoutParams.MATCH_PARENT,
          ViewGroup.LayoutParams.MATCH_PARENT
        )
        // Back button or a programmatic cancel both land here; teardown detaches
        // the listener first so a solved challenge is not reported as cancelled.
        setOnCancelListener { fail(NemuCloudflareSolveFailure.CANCELLED) }
      }
    }

    // MARK: - Termination

    private fun succeed(cookieHeader: String) {
      if (finished) return
      finished = true
      val bounded = if (cookieHeader.length > NEMU_CLOUDFLARE_MAX_ADOPTED_COOKIE_BYTES) {
        cookieHeader.substring(0, NEMU_CLOUDFLARE_MAX_ADOPTED_COOKIE_BYTES)
      } else {
        cookieHeader
      }
      // Every pair here came from `getCookie(origin)`, so it is a cookie the
      // challenge host would be sent, and it survived the diff against this
      // solve's baseline, so this solve is what wrote it.
      adoptCookies(solve.cookieScope, solve.url, bounded)
      teardown()
      emit("nemuAidokuCfSuccess", mapOf("url" to solve.url.toString()))
      settle(true)
    }

    private fun fail(failure: NemuCloudflareSolveFailure) {
      if (finished) return
      finished = true
      teardown()
      emitFailure(solve.url.toString(), failure)
      settle(false)
    }

    private fun settle(result: Boolean) {
      settled = true
      val pending = solve.completions.toList()
      solve.completions.clear()
      pending.forEach { it(result) }
      finish(this)
    }

    private fun teardown() {
      main.removeCallbacks(probeRunnable)
      main.removeCallbacks(timeoutRunnable)
      NemuCloudflareServiceWorkerGate.close()

      dialog?.let { presented ->
        presented.setOnCancelListener(null)
        presented.setOnDismissListener(null)
        runCatching { presented.dismiss() }
      }
      dialog = null

      webView?.let { view ->
        runCatching { view.stopLoading() }
        view.webViewClient = WebViewClient()
        view.settings.javaScriptEnabled = false
        (view.parent as? ViewGroup)?.removeView(view)
        runCatching { view.destroy() }
      }
      webView = null

      hiddenContainer?.removeAllViews()
      (hiddenContainer?.parent as? ViewGroup)?.removeView(hiddenContainer)
      hiddenContainer = null
    }
  }

  companion object {
    internal fun normalizedCookieScope(value: String?): String? {
      val trimmed = value?.trim().orEmpty()
      if (trimmed.isEmpty() || trimmed.length > 512) return null
      if (trimmed.any { it.isISOControl() }) return null
      return trimmed
    }

    /**
     * A caller-supplied UA wins, otherwise the runtime's default. A blank or
     * control-bearing value is not usable as a header, so it falls back too.
     */
    internal fun normalizedUserAgent(value: String?): String {
      val trimmed = value?.trim().orEmpty()
      if (trimmed.isEmpty() || trimmed.length > 512) return NEMU_AIDOKU_DEFAULT_USER_AGENT
      if (trimmed.any { it.isISOControl() }) return NEMU_AIDOKU_DEFAULT_USER_AGENT
      return trimmed
    }
  }
}

/** The answer every off-allow-list request gets: a blank 403, never a socket. */
private fun nemuCloudflareBlockedResponse(): WebResourceResponse =
  WebResourceResponse(
    "text/plain",
    "utf-8",
    403,
    "Blocked",
    emptyMap(),
    ByteArrayInputStream(ByteArray(0))
  )

/**
 * Applies the solver's allow-list to service-worker fetches.
 *
 * A service worker's own `fetch`es never reach [WebViewClient]: Chromium routes
 * them through [ServiceWorkerController]'s client instead, so without this they
 * bypassed the boundary entirely. Registrations are process-global and outlive
 * the WebView that created them, so a challenge page could register a worker,
 * let the solve end, and keep fetching afterwards.
 *
 * The client is installed once per process, on the first solve, and answers
 * with [nemuCloudflareBlockedResponse] unless a solve is running *and* the
 * request satisfies [NemuCloudflareChallengePolicy.allowsRequest] for that
 * solve's host. With no solve active every worker fetch in the process is
 * refused; nothing else in this app hosts a WebView, so that costs nothing
 * today, but a second WebView owner would need this to become per-origin.
 *
 * [shouldInterceptRequest] runs on a WebView background thread, hence the
 * volatile host. iOS needs no equivalent: WebKit runs a compiled
 * `WKContentRuleList` inside service workers as well.
 */
internal object NemuCloudflareServiceWorkerGate {
  @Volatile
  private var challengeHost: String? = null
  private var installed = false

  /** Idempotent; a process without an Android System WebView simply no-ops. */
  @Synchronized
  fun install() {
    if (installed) return
    val controller = runCatching { ServiceWorkerController.getInstance() }.getOrNull() ?: return
    val client = object : ServiceWorkerClient() {
      override fun shouldInterceptRequest(request: WebResourceRequest): WebResourceResponse? {
        val host = challengeHost ?: return nemuCloudflareBlockedResponse()
        // A worker fetch is never a main-frame load.
        if (NemuCloudflareChallengePolicy.allowsRequest(false, request.url, host)) return null
        return nemuCloudflareBlockedResponse()
      }
    }
    installed = runCatching { controller.setServiceWorkerClient(client) }.isSuccess
  }

  fun open(host: String) {
    challengeHost = host
  }

  fun close() {
    challengeHost = null
  }
}

/**
 * Enforces the solver's allow-list on the request path. Anything off it gets a
 * blank 403 rather than a network call, and a main-frame navigation that leaves
 * the challenge host is refused outright.
 *
 * This covers document, subframe and subresource loads — everything Chromium
 * reports to a [WebViewClient]. It does **not** cover WebSocket handshakes,
 * which Chromium never surfaces here; see this file's solver KDoc for what that
 * leaves open. Service-worker fetches are handled by
 * [NemuCloudflareServiceWorkerGate] instead, for the same reason.
 */
private class SolverWebViewClient(
  private val callbacks: NemuCloudflareSolverSessionCallbacks,
  private val challengeHost: String
) : WebViewClient() {

  override fun shouldInterceptRequest(
    view: WebView,
    request: WebResourceRequest
  ): WebResourceResponse? {
    if (
      NemuCloudflareChallengePolicy.allowsRequest(
        request.isForMainFrame,
        request.url,
        challengeHost
      )
    ) {
      return null
    }
    return nemuCloudflareBlockedResponse()
  }

  override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
    // `true` means "the app handled it" — i.e. the WebView must not load it.
    // This fires for subframe navigations too, so it has to use the same
    // frame-aware decision as `shouldInterceptRequest`: the Turnstile widget
    // navigates an iframe onto the challenge platform host, which the
    // main-frame rule rejects.
    return !NemuCloudflareChallengePolicy.allowsRequest(
      request.isForMainFrame,
      request.url,
      challengeHost
    )
  }

  override fun onPageFinished(view: WebView, url: String?) {
    callbacks.onPageFinished()
  }

  override fun onReceivedError(
    view: WebView,
    request: WebResourceRequest,
    error: android.webkit.WebResourceError
  ) {
    if (!request.isForMainFrame) return
    callbacks.onNavigationFailed()
  }

  override fun onRenderProcessGone(
    view: WebView,
    detail: android.webkit.RenderProcessGoneDetail
  ): Boolean {
    callbacks.onNavigationFailed()
    return true
  }
}

/** Callback surface the WebViewClient needs from a solve session. */
internal interface NemuCloudflareSolverSessionCallbacks {
  fun onPageFinished()
  fun onNavigationFailed()
}
