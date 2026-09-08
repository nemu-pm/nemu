import Foundation
import UIKit
import WebKit

/// The User-Agent the Aidoku runtime puts on every source request unless the
/// source package overrides it. A Cloudflare clearance cookie is bound to the
/// User-Agent that solved the challenge, so the solver WebView must present
/// exactly the string the follow-up source requests will send. Mirrored in JS
/// as `MOBILE_AIDOKU_DEFAULT_USER_AGENT`.
let nemuAidokuDefaultUserAgent =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"

/// Hidden phase only. Once the sheet is on screen the user owns the pace and
/// there is no timeout at all.
private let nemuCloudflareHiddenTimeoutSeconds: TimeInterval = 12
/// First moment a still-interactive challenge escalates to the visible sheet.
/// The probe below keeps running afterwards, so a challenge that only renders
/// its widget after an initial scripted round trip escalates on the next tick
/// (the ~6s recheck) instead of waiting for the hidden-phase deadline.
private let nemuCloudflareFirstInteractionProbeSeconds: TimeInterval = 3
private let nemuCloudflareProbeIntervalSeconds: TimeInterval = 0.7
/// The clearance cookie a solved challenge issues. Bound to the User-Agent
/// that solved it, which is why the solver pins the runtime's UA.
let nemuCloudflareClearanceCookieName = "cf_clearance"
private let nemuCloudflareMaxQueuedSolves = 8
/// The hidden WebView still needs a plausible viewport: a genuinely 0x0 web
/// content view never lays out, so the challenge script cannot run. The web
/// content gets a phone-sized frame inside a 1x1 clipping container that is
/// parked behind every other subview.
private let nemuCloudflareHiddenContentSize = CGSize(width: 390, height: 844)

/// Stable, machine-readable `nemuAidokuCfFailed` reasons. The JS Nemu Agent
/// sheet maps these onto localized copy; anything unknown falls back to the
/// generic failure string.
enum NemuCloudflareSolveFailure: String {
  /// Not https, carries credentials, or is an address literal / private name.
  case unsupportedUrl = "unsupported-url"
  /// The native address policy refused to resolve a public destination.
  case blockedDestination = "blocked-destination"
  /// WebKit could not compile or store the allow-list; never load without it.
  case ruleListUnavailable = "rule-list-unavailable"
  /// No view controller to host (or later present) the WebView.
  case noPresenter = "no-presenter"
  /// WebKit failed the navigation, or the allow-list refused it.
  case navigationFailed = "navigation-failed"
  /// The hidden phase expired without a fresh clearance cookie.
  case timeout = "timeout"
  /// The user closed the challenge sheet.
  case cancelled = "cancelled"
  /// Too many distinct hosts already waiting.
  case queueOverflow = "queue-overflow"
  /// The module or app context went away mid-solve.
  case interrupted = "interrupted"
  /// The url names a host this source never reached, or names it without a
  /// cookie scope at all. Only hosts that answered one of this source's own
  /// requests with a Cloudflare mitigation can be solved.
  case unsolicitedHost = "unsolicited-host"
}

/// What the DOM says about the current page.
private struct NemuCloudflareChallengeProbe {
  /// A challenge document is still on screen.
  let isChallenge: Bool
  /// The challenge is waiting on the user (Turnstile widget or an error panel).
  let needsInteraction: Bool

  static let empty = NemuCloudflareChallengeProbe(isChallenge: true, needsInteraction: false)
}

/// Reads the markers Cloudflare's interstitial exposes. Kept to element and
/// title lookups so nothing about the page is exfiltrated back into native.
private let nemuCloudflareProbeScript = """
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
  return JSON.stringify({
    challenge: needsInteraction || running || title === "Just a moment...",
    needsInteraction: needsInteraction
  });
})();
"""

/// Serialized, on-demand Cloudflare challenge solver.
///
/// This never runs inline. `solveCloudflare` is an explicit async API the JS
/// Nemu Agent sheet calls *after* the Aidoku runtime has already classified a
/// source failure as a Cloudflare challenge; the synchronous WASM HTTP path is
/// untouched and keeps failing fast. Exactly one solve runs at a time: a second
/// request for the same host joins the in-flight solve, a request for a
/// different host queues behind it.
///
/// All state below is main-thread only (WebKit requires it). Cookie reads and
/// writes hop to the scoped-jar bridge's serial queue and come back to main.
final class NemuAidokuCloudflareSolver {
  static let shared = NemuAidokuCloudflareSolver()

  typealias EventEmitter = (String, [String: Any?]) -> Void
  typealias Completion = (Bool) -> Void
  typealias PresenterProvider = () -> UIViewController?

  private struct QueuedSolve {
    let url: URL
    let challengeHost: String
    let cookieScope: String?
    let userAgent: String
    let emit: EventEmitter
    let presenterProvider: PresenterProvider
    var completions: [Completion]
  }

  private var queue: [QueuedSolve] = []
  private var active: NemuCloudflareSolveSession?

  private init() {}

  /// Entry point for `NemuAidokuModule.solveCloudflare`. Resolves `false`
  /// instead of throwing for every expected failure.
  func solve(
    urlString: String,
    cookieScope: String?,
    userAgent: String?,
    emit: @escaping EventEmitter,
    presenterProvider: @escaping PresenterProvider,
    completion: @escaping Completion
  ) {
    let normalizedScope = Self.normalizedCookieScope(cookieScope)
    let resolvedUserAgent = Self.normalizedUserAgent(userAgent)

    // `validatedURL` performs a blocking `getaddrinfo`, so the SSRF pre-flight
    // has to run off the main thread even though everything after it is
    // main-thread WebKit work.
    DispatchQueue.global(qos: .userInitiated).async {
      var validated: URL?
      var policyRefused = false
      do {
        validated = try NemuNativeHttpAddressPolicy.validatedURL(urlString)
      } catch {
        policyRefused = true
      }
      DispatchQueue.main.async {
        guard
          let url = validated,
          let challengeHost = NemuCloudflareChallengePolicy.challengeHost(for: url)
        else {
          let reason: NemuCloudflareSolveFailure =
            policyRefused ? .blockedDestination : .unsupportedUrl
          emit("nemuAidokuCfFailed", [
            "url": urlString,
            "reason": reason.rawValue,
          ])
          completion(false)
          return
        }
        // A scope is mandatory here even though the HTTP path treats a missing
        // one as "stateless": without it there is no record of what this
        // source reached, and a solve would have nowhere to publish its
        // cookies either.
        // "Did this source's own traffic hit a Cloudflare mitigation on this
        // host, recently?" A source names the challenge url, so nothing else
        // proves the WebView is pointed at an origin it actually talked to.
        guard
          let scope = normalizedScope,
          NemuCloudflareChallengeHostRegistry.shared.allows(
            cookieScope: scope,
            host: challengeHost
          )
        else {
          emit("nemuAidokuCfFailed", [
            "url": urlString,
            "reason": NemuCloudflareSolveFailure.unsolicitedHost.rawValue,
          ])
          completion(false)
          return
        }
        self.enqueue(QueuedSolve(
          url: url,
          challengeHost: challengeHost,
          cookieScope: normalizedScope,
          userAgent: resolvedUserAgent,
          emit: emit,
          presenterProvider: presenterProvider,
          completions: [completion]
        ))
      }
    }
  }

  /// Fails every in-flight and queued solve. Used when the module's app context
  /// is torn down so no WebView outlives it.
  func cancelAll() {
    cancelEverything(reason: .interrupted)
  }

  /// The user closed the Nemu Agent sheet. Same teardown as `cancelAll()` —
  /// the presented challenge sheet is dismissed with the session — but
  /// reported as a cancellation rather than an interruption.
  func cancelUserSolves() {
    cancelEverything(reason: .cancelled)
  }

  private func cancelEverything(reason: NemuCloudflareSolveFailure) {
    DispatchQueue.main.async {
      let pending = self.queue
      self.queue = []
      for solve in pending {
        solve.emit("nemuAidokuCfFailed", [
          "url": solve.url.absoluteString,
          "reason": reason.rawValue,
        ])
        for completion in solve.completions { completion(false) }
      }
      self.active?.abort(reason: reason)
    }
  }

  static func normalizedCookieScope(_ value: String?) -> String? {
    guard let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines),
          !trimmed.isEmpty
    else {
      return nil
    }
    guard trimmed.count <= 512,
          !trimmed.unicodeScalars.contains(where: CharacterSet.controlCharacters.contains)
    else {
      return nil
    }
    return trimmed
  }

  /// A caller-supplied UA wins, otherwise the runtime's default. A blank or
  /// control-bearing value is not usable as a header, so it falls back too.
  static func normalizedUserAgent(_ value: String?) -> String {
    guard let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines),
          !trimmed.isEmpty,
          trimmed.count <= 512,
          !trimmed.unicodeScalars.contains(where: CharacterSet.controlCharacters.contains)
    else {
      return nemuAidokuDefaultUserAgent
    }
    return trimmed
  }

  // MARK: - Queueing

  private func enqueue(_ solve: QueuedSolve) {
    if let active, active.challengeHost == solve.challengeHost {
      // Several screens can report the same challenge at once. They all wait
      // on the one solve rather than restarting it.
      active.addCompletions(solve.completions)
      return
    }
    if let index = queue.firstIndex(where: { $0.challengeHost == solve.challengeHost }) {
      queue[index].completions.append(contentsOf: solve.completions)
      return
    }
    if active != nil {
      guard queue.count < nemuCloudflareMaxQueuedSolves else {
        solve.emit("nemuAidokuCfFailed", [
          "url": solve.url.absoluteString,
          "reason": NemuCloudflareSolveFailure.queueOverflow.rawValue,
        ])
        for completion in solve.completions { completion(false) }
        return
      }
      queue.append(solve)
      return
    }
    start(solve)
  }

  private func start(_ solve: QueuedSolve) {
    let session = NemuCloudflareSolveSession(
      url: solve.url,
      challengeHost: solve.challengeHost,
      cookieScope: solve.cookieScope,
      userAgent: solve.userAgent,
      emit: solve.emit,
      presenterProvider: solve.presenterProvider,
      completions: solve.completions
    ) { [weak self] finished in
      guard let self, self.active === finished else { return }
      self.active = nil
      if !self.queue.isEmpty {
        self.start(self.queue.removeFirst())
      }
    }
    active = session
    session.begin()
  }
}

// MARK: - One solve

/// Owns a single hidden-then-maybe-visible WebView solve. Main thread only.
private final class NemuCloudflareSolveSession: NSObject, WKNavigationDelegate, WKUIDelegate {
  let url: URL
  let challengeHost: String
  let cookieScope: String?
  let userAgent: String

  private let emit: NemuAidokuCloudflareSolver.EventEmitter
  private let presenterProvider: NemuAidokuCloudflareSolver.PresenterProvider
  private let onFinish: (NemuCloudflareSolveSession) -> Void
  private var completions: [NemuAidokuCloudflareSolver.Completion]

  private var webView: WKWebView?
  private var hiddenContainer: UIView?
  private var ruleListIdentifier: String?
  private var challengeController: NemuCloudflareChallengeViewController?
  private var probeTimer: Timer?
  private var timeoutWork: DispatchWorkItem?
  private var startedAt = Date()
  private var baselineClearance: String?
  private var didEmitWaiting = false
  private var probeInFlight = false
  private var finished = false
  private var settled = false

  init(
    url: URL,
    challengeHost: String,
    cookieScope: String?,
    userAgent: String,
    emit: @escaping NemuAidokuCloudflareSolver.EventEmitter,
    presenterProvider: @escaping NemuAidokuCloudflareSolver.PresenterProvider,
    completions: [NemuAidokuCloudflareSolver.Completion],
    onFinish: @escaping (NemuCloudflareSolveSession) -> Void
  ) {
    self.url = url
    self.challengeHost = challengeHost
    self.cookieScope = cookieScope
    self.userAgent = userAgent
    self.emit = emit
    self.presenterProvider = presenterProvider
    self.completions = completions
    self.onFinish = onFinish
    super.init()
  }

  func addCompletions(_ next: [NemuAidokuCloudflareSolver.Completion]) {
    guard !settled else {
      for completion in next { completion(false) }
      return
    }
    completions.append(contentsOf: next)
  }

  func begin() {
    emit("nemuAidokuCfSolveStart", ["url": url.absoluteString])
    // Remember the clearance the source already holds so a stale cookie left
    // over from the failed request cannot be mistaken for a fresh solve.
    NemuAidokuScopedCookieJars.clearanceValue(cookieScope: cookieScope, url: url) { [weak self] value in
      guard let self, !self.finished else { return }
      self.baselineClearance = value
      self.compileAllowListAndLoad()
    }
  }

  func abort(reason: NemuCloudflareSolveFailure) {
    fail(reason)
  }

  // MARK: - Setup

  private func compileAllowListAndLoad() {
    guard
      let json = NemuCloudflareChallengePolicy.contentRuleListJSON(challengeHost: challengeHost),
      let store = WKContentRuleListStore.default()
    else {
      fail(.ruleListUnavailable)
      return
    }
    let identifier = "nemu-cloudflare-\(challengeHost)"
    store.compileContentRuleList(
      forIdentifier: identifier,
      encodedContentRuleList: json
    ) { [weak self] ruleList, error in
      DispatchQueue.main.async {
        guard let self, !self.finished else { return }
        guard let ruleList, error == nil else {
          // Fail closed: without the compiled allow-list the WebView could
          // reach any host the challenge page names.
          self.fail(.ruleListUnavailable)
          return
        }
        self.ruleListIdentifier = identifier
        self.load(with: ruleList)
      }
    }
  }

  private func load(with ruleList: WKContentRuleList) {
    // The hidden phase attaches to the key window rather than the presenting
    // controller's own view, so dismissing an unrelated sheet mid-solve cannot
    // pull the WebView out of the window and suspend the challenge script.
    guard let presenter = presenterProvider() else {
      fail(.noPresenter)
      return
    }
    let presenterView: UIView? = presenter.view
    guard let hostView = presenterView?.window ?? presenterView else {
      fail(.noPresenter)
      return
    }

    let configuration = WKWebViewConfiguration()
    // A throwaway, non-persistent store per solve: no app cookie, cache, or
    // storage is visible to the challenge page, and nothing it writes survives.
    configuration.websiteDataStore = WKWebsiteDataStore.nonPersistent()
    configuration.userContentController = WKUserContentController()
    configuration.userContentController.add(ruleList)
    configuration.suppressesIncrementalRendering = false
    configuration.allowsInlineMediaPlayback = false
    configuration.mediaTypesRequiringUserActionForPlayback = .all
    configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
    // The challenge is a JavaScript program; it cannot be solved with scripting
    // off. Everything else the page could reach is closed instead.
    configuration.defaultWebpagePreferences.allowsContentJavaScript = true
    if Self.prefersMobileContentMode(userAgent) {
      configuration.defaultWebpagePreferences.preferredContentMode = .mobile
    }
    // iOS keeps file access, file-url content access, and universal access from
    // file urls disabled by default, and the compiled allow-list blocks every
    // non-https request, so no `file:` or `content:` url can be reached at all.

    let webView = WKWebView(
      frame: CGRect(origin: .zero, size: nemuCloudflareHiddenContentSize),
      configuration: configuration
    )
    webView.customUserAgent = userAgent
    webView.navigationDelegate = self
    webView.uiDelegate = self
    webView.allowsBackForwardNavigationGestures = false
    webView.isOpaque = false
    webView.backgroundColor = .clear
    webView.scrollView.isScrollEnabled = true

    let container = UIView(frame: CGRect(x: 0, y: 0, width: 1, height: 1))
    container.clipsToBounds = true
    container.isUserInteractionEnabled = false
    container.alpha = 0.02
    container.addSubview(webView)
    hostView.insertSubview(container, at: 0)

    self.webView = webView
    hiddenContainer = container
    startedAt = Date()

    var request = URLRequest(url: url)
    request.setValue(userAgent, forHTTPHeaderField: "User-Agent")
    request.cachePolicy = .reloadIgnoringLocalCacheData
    webView.load(request)

    emitWaitingOnce()
    armHiddenTimeout()
    armProbeTimer()
  }

  static func prefersMobileContentMode(_ userAgent: String) -> Bool {
    let lowered = userAgent.lowercased()
    return lowered.contains("iphone") || lowered.contains("ipad")
  }

  private func emitWaitingOnce() {
    guard !didEmitWaiting else { return }
    didEmitWaiting = true
    emit("nemuAidokuCfWaiting", ["url": url.absoluteString])
  }

  private func armHiddenTimeout() {
    timeoutWork?.cancel()
    let work = DispatchWorkItem { [weak self] in
      guard let self, !self.finished, self.challengeController == nil else { return }
      self.fail(.timeout)
    }
    timeoutWork = work
    DispatchQueue.main.asyncAfter(
      deadline: .now() + nemuCloudflareHiddenTimeoutSeconds,
      execute: work
    )
  }

  private func armProbeTimer() {
    probeTimer?.invalidate()
    let timer = Timer(
      timeInterval: nemuCloudflareProbeIntervalSeconds,
      repeats: true
    ) { [weak self] _ in
      self?.probe()
    }
    probeTimer = timer
    RunLoop.main.add(timer, forMode: .common)
  }

  // MARK: - Detection

  /// Reads the DOM markers and the WebView's cookie jar together. A solve is
  /// complete when a `cf_clearance` cookie for the challenge host exists, its
  /// value differs from the one the source already had, and the page is no
  /// longer a challenge document.
  private func probe() {
    guard !finished, let webView, !probeInFlight else { return }
    probeInFlight = true
    webView.evaluateJavaScript(nemuCloudflareProbeScript) { [weak self] value, _ in
      guard let self else { return }
      let probe = Self.parseProbe(value)
      guard !self.finished, let webView = self.webView else {
        self.probeInFlight = false
        return
      }
      webView.configuration.websiteDataStore.httpCookieStore.getAllCookies { [weak self] cookies in
        guard let self else { return }
        self.probeInFlight = false
        guard !self.finished else { return }
        self.evaluate(probe: probe, cookies: cookies)
      }
    }
  }

  private func evaluate(probe: NemuCloudflareChallengeProbe, cookies: [HTTPCookie]) {
    let adoptable = cookies.filter {
      NemuCloudflareChallengePolicy.cookieDomainCoversChallengeHost(
        $0.domain,
        challengeHost: challengeHost
      )
    }
    let clearance = adoptable.first { $0.name == nemuCloudflareClearanceCookieName }
    if let clearance, clearance.value != baselineClearance, !probe.isChallenge {
      succeed(with: adoptable)
      return
    }
    guard challengeController == nil, probe.needsInteraction else { return }
    let elapsed = Date().timeIntervalSince(startedAt)
    guard elapsed >= nemuCloudflareFirstInteractionProbeSeconds else { return }
    present()
  }

  private static func parseProbe(_ value: Any?) -> NemuCloudflareChallengeProbe {
    guard
      let json = value as? String,
      let data = json.data(using: .utf8),
      let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else {
      return .empty
    }
    return NemuCloudflareChallengeProbe(
      isChallenge: object["challenge"] as? Bool ?? true,
      needsInteraction: object["needsInteraction"] as? Bool ?? false
    )
  }

  // MARK: - Visible sheet

  private func present() {
    guard challengeController == nil, let webView else { return }
    guard let presenter = Self.topmostViewController(from: presenterProvider()) else {
      fail(.noPresenter)
      return
    }
    // The user now drives the pace, so the hidden-phase deadline is dropped.
    timeoutWork?.cancel()
    timeoutWork = nil

    webView.removeFromSuperview()
    hiddenContainer?.removeFromSuperview()
    hiddenContainer = nil

    let controller = NemuCloudflareChallengeViewController(
      webView: webView,
      title: challengeHost
    ) { [weak self] in
      self?.fail(.cancelled)
    }
    challengeController = controller
    presenter.present(controller, animated: true)
    // `presentationController` only exists once the presentation has begun.
    controller.observeDismissGesture()
    emit("nemuAidokuCfCaptcha", ["url": url.absoluteString])
  }

  private static func topmostViewController(
    from controller: UIViewController?
  ) -> UIViewController? {
    var current = controller
    while let presented = current?.presentedViewController, !presented.isBeingDismissed {
      current = presented
    }
    return current
  }

  // MARK: - Termination

  private func succeed(with cookies: [HTTPCookie]) {
    guard !finished else { return }
    finished = true
    let solvedUrl = url
    NemuAidokuScopedCookieJars.store(
      cookies: cookies,
      cookieScope: cookieScope,
      url: solvedUrl,
      challengeHost: challengeHost
    ) { [weak self] in
      guard let self else { return }
      self.teardown()
      self.emit("nemuAidokuCfSuccess", ["url": solvedUrl.absoluteString])
      self.settle(true)
    }
  }

  private func fail(_ reason: NemuCloudflareSolveFailure) {
    guard !finished else { return }
    finished = true
    teardown()
    emit("nemuAidokuCfFailed", [
      "url": url.absoluteString,
      "reason": reason.rawValue,
    ])
    settle(false)
  }

  private func settle(_ result: Bool) {
    settled = true
    let pending = completions
    completions = []
    for completion in pending { completion(result) }
    onFinish(self)
  }

  private func teardown() {
    probeTimer?.invalidate()
    probeTimer = nil
    timeoutWork?.cancel()
    timeoutWork = nil

    if let webView {
      webView.stopLoading()
      webView.navigationDelegate = nil
      webView.uiDelegate = nil
      webView.configuration.userContentController.removeAllContentRuleLists()
      webView.removeFromSuperview()
    }
    webView = nil
    hiddenContainer?.removeFromSuperview()
    hiddenContainer = nil

    if let controller = challengeController {
      controller.detachWebView()
      controller.presentingViewController?.dismiss(animated: true)
      challengeController = nil
    }

    // Compiled lists are keyed by host and would otherwise accumulate on disk.
    if let identifier = ruleListIdentifier {
      ruleListIdentifier = nil
      WKContentRuleListStore.default()?.removeContentRuleList(forIdentifier: identifier) { _ in }
    }
  }

  // MARK: - WKNavigationDelegate

  func webView(
    _ webView: WKWebView,
    decidePolicyFor navigationAction: WKNavigationAction,
    preferences: WKWebpagePreferences,
    decisionHandler: @escaping (WKNavigationActionPolicy, WKWebpagePreferences) -> Void
  ) {
    if Self.prefersMobileContentMode(userAgent) {
      preferences.preferredContentMode = .mobile
    }
    guard let target = navigationAction.request.url else {
      decisionHandler(.cancel, preferences)
      return
    }
    // A nil target frame is a new window / `target=_blank`; treat it as the
    // strictest case rather than a subresource.
    let isMainFrame = navigationAction.targetFrame?.isMainFrame ?? true
    let allowed = isMainFrame
      ? NemuCloudflareChallengePolicy.allowsMainFrameNavigation(
          target,
          challengeHost: challengeHost
        )
      : NemuCloudflareChallengePolicy.allowsSubframeNavigation(
          target,
          challengeHost: challengeHost
        )
    decisionHandler(allowed ? .allow : .cancel, preferences)
  }

  func webView(
    _ webView: WKWebView,
    decidePolicyFor navigationResponse: WKNavigationResponse,
    decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void
  ) {
    guard let responseUrl = navigationResponse.response.url else {
      decisionHandler(.cancel)
      return
    }
    let allowed = navigationResponse.isForMainFrame
      ? NemuCloudflareChallengePolicy.allowsMainFrameNavigation(
          responseUrl,
          challengeHost: challengeHost
        )
      : NemuCloudflareChallengePolicy.allowsSubresource(
          responseUrl,
          challengeHost: challengeHost
        )
    decisionHandler(allowed ? .allow : .cancel)
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    emitWaitingOnce()
    probe()
  }

  func webView(
    _ webView: WKWebView,
    didFail navigation: WKNavigation!,
    withError error: any Error
  ) {
    handleNavigationError(error)
  }

  func webView(
    _ webView: WKWebView,
    didFailProvisionalNavigation navigation: WKNavigation!,
    withError error: any Error
  ) {
    handleNavigationError(error)
  }

  private func handleNavigationError(_ error: any Error) {
    let nsError = error as NSError
    // A cancelled load is what the allow-list and `decidePolicyFor` produce for
    // a blocked subresource; that must not kill an otherwise healthy challenge.
    if nsError.domain == NSURLErrorDomain, nsError.code == NSURLErrorCancelled { return }
    if nsError.domain == "WebKitErrorDomain", nsError.code == 102 { return }
    guard challengeController == nil else { return }
    fail(.navigationFailed)
  }

  func webView(
    _ webView: WKWebView,
    didReceive challenge: URLAuthenticationChallenge,
    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
  ) {
    // Never let a source-controlled page harvest credentials or downgrade TLS.
    completionHandler(.performDefaultHandling, nil)
  }

  func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
    guard !finished else { return }
    fail(.navigationFailed)
  }

  // MARK: - WKUIDelegate

  func webView(
    _ webView: WKWebView,
    createWebViewWith configuration: WKWebViewConfiguration,
    for navigationAction: WKNavigationAction,
    windowFeatures: WKWindowFeatures
  ) -> WKWebView? {
    // No popups: a second WebView would not carry the compiled allow-list.
    return nil
  }

  func webView(
    _ webView: WKWebView,
    runJavaScriptAlertPanelWithMessage message: String,
    initiatedByFrame frame: WKFrameInfo,
    completionHandler: @escaping () -> Void
  ) {
    completionHandler()
  }

  func webView(
    _ webView: WKWebView,
    runJavaScriptConfirmPanelWithMessage message: String,
    initiatedByFrame frame: WKFrameInfo,
    completionHandler: @escaping (Bool) -> Void
  ) {
    completionHandler(false)
  }

  func webView(
    _ webView: WKWebView,
    runJavaScriptTextInputPanelWithPrompt prompt: String,
    defaultText: String?,
    initiatedByFrame frame: WKFrameInfo,
    completionHandler: @escaping (String?) -> Void
  ) {
    completionHandler(nil)
  }
}

// MARK: - Visible challenge sheet

/// Hosts the solver's WebView once the challenge needs the user. Closing the
/// sheet — by the close button or by the sheet's own dismiss gesture — cancels
/// the solve.
private final class NemuCloudflareChallengeViewController: UIViewController,
  UIAdaptivePresentationControllerDelegate {
  private var hostedWebView: WKWebView?
  private let onCancel: () -> Void
  private var didCancel = false

  init(webView: WKWebView, title: String, onCancel: @escaping () -> Void) {
    self.hostedWebView = webView
    self.onCancel = onCancel
    super.init(nibName: nil, bundle: nil)
    self.title = title
    modalPresentationStyle = .pageSheet
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("NemuCloudflareChallengeViewController is not storyboard-backed.")
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .systemBackground

    let bar = UINavigationBar()
    bar.translatesAutoresizingMaskIntoConstraints = false
    let item = UINavigationItem(title: title ?? "")
    item.rightBarButtonItem = UIBarButtonItem(
      barButtonSystemItem: .close,
      target: self,
      action: #selector(closeTapped)
    )
    bar.items = [item]
    view.addSubview(bar)

    guard let webView = hostedWebView else { return }
    webView.translatesAutoresizingMaskIntoConstraints = false
    webView.isUserInteractionEnabled = true
    view.addSubview(webView)

    NSLayoutConstraint.activate([
      bar.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
      bar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      bar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      webView.topAnchor.constraint(equalTo: bar.bottomAnchor),
      webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
    ])
  }

  /// Wired after `present` — `presentationController` does not exist before the
  /// presentation begins. Catches the sheet's own swipe-to-dismiss gesture.
  func observeDismissGesture() {
    presentationController?.delegate = self
  }

  /// Called during teardown so a successful solve does not report a cancel when
  /// the sheet is dismissed programmatically.
  func detachWebView() {
    didCancel = true
    hostedWebView?.removeFromSuperview()
    hostedWebView = nil
    presentationController?.delegate = nil
  }

  @objc private func closeTapped() {
    cancelOnce()
  }

  func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
    cancelOnce()
  }

  private func cancelOnce() {
    guard !didCancel else { return }
    didCancel = true
    onCancel()
  }
}
