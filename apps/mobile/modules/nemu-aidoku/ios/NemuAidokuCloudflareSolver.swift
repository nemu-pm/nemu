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

/// Name of the message handler the probe script reports through. Registered
/// only in `nemuCloudflareProbeWorld`, so the page's own scripts never see a
/// `window.webkit` object and cannot post to it.
private let nemuCloudflareProbeHandlerName = "nemuCloudflareProbe"

/// The probe runs in its own isolated content world: the page cannot observe
/// or patch the lookups below, and nothing it defines leaks in.
private let nemuCloudflareProbeWorld = WKContentWorld.world(name: "nemu-cloudflare-probe")

/// Reads the markers Cloudflare's interstitial exposes. Kept to element and
/// title lookups so nothing about the page is exfiltrated back into native.
///
/// **Pushed from a user script, never pulled with `evaluateJavaScript`.** Every
/// public `WKWebView` script-evaluation API (`evaluateJavaScript`, its
/// content-world variant, `callAsyncJavaScript`) runs the script with a forced
/// user gesture, which hands the document sticky user activation
/// (`navigator.userActivation.hasBeenActive === true`) although nobody touched
/// it. Polling the challenge page that way made every interstitial look
/// scripted: Turnstile still completed on the checkbox tap, but Cloudflare
/// then issued a `cf_clearance` its own edge refused, and the orchestrator
/// reloaded (setting `cf_chl_rc_ni`) instead of submitting its form — an
/// endless checkbox loop. A user script runs without any gesture, so the
/// page's activation state stays exactly what the user made it.
///
/// Injected at document end (the interstitial's markers are in its initial
/// HTML, so an empty just-committed document can never report "not a
/// challenge") and re-run on DOM mutations, because the Turnstile widget and
/// the error panel are inserted later. Only changes are posted.
private let nemuCloudflareProbeScript = """
(function () {
  var last = "";
  // The interstitial's inline bootstrap script defines `_cf_chl_opt`. Unlike
  // the title ("Just a moment...", which the orchestrator localizes) this is
  // the same in every language, and it is in the initial HTML, so it is read
  // once rather than on every mutation.
  var interstitial = false;
  try {
    interstitial = Array.prototype.some.call(document.scripts, function (script) {
      return (script.textContent || "").indexOf("_cf_chl_opt") !== -1;
    });
  } catch (error) { interstitial = false; }
  function report() {
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
    var state = JSON.stringify({
      challenge: needsInteraction || running || interstitial || title === "Just a moment...",
      needsInteraction: needsInteraction
    });
    if (state === last) return;
    last = state;
    try { window.webkit.messageHandlers.\(nemuCloudflareProbeHandlerName).postMessage(state); } catch (error) {}
  }
  report();
  try {
    new MutationObserver(report).observe(document, { childList: true, subtree: true, characterData: true });
  } catch (error) {}
})();
"""

/// `WKUserContentController` retains its message handlers, and the session
/// owns the WebView that owns the controller; a weak hop breaks that cycle.
private final class NemuCloudflareProbeMessageProxy: NSObject, WKScriptMessageHandler {
  weak var target: NemuCloudflareSolveSession?

  init(target: NemuCloudflareSolveSession) {
    self.target = target
  }

  func userContentController(
    _ userContentController: WKUserContentController,
    didReceive message: WKScriptMessage
  ) {
    target?.didReceiveProbe(message)
  }
}

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

  /// Two solves may only be merged when they would publish their cookies into
  /// the same jar. Keying the merge on the host alone let two sources that
  /// happen to share a challenge host join one solve, after which the adopted
  /// clearance landed in the *first* requester's scope while every joiner was
  /// still told `true` — and then made its next request without a clearance
  /// cookie. The scope is part of the identity, so it is part of the key.
  private func enqueue(_ solve: QueuedSolve) {
    if let active,
       active.challengeHost == solve.challengeHost,
       active.cookieScope == solve.cookieScope {
      // Several screens can report the same challenge at once. They all wait
      // on the one solve rather than restarting it.
      active.addCompletions(solve.completions)
      return
    }
    if let index = queue.firstIndex(where: {
      $0.challengeHost == solve.challengeHost && $0.cookieScope == solve.cookieScope
    }) {
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
  /// What the probe script last reported for the current main-frame document.
  /// Reset on every main-frame commit so a previous document's state never
  /// speaks for the next one.
  private var latestProbe = NemuCloudflareChallengeProbe.empty
  /// Whether the main-frame response WebKit is about to commit was the origin
  /// answering (`isClearedDocumentResponse`). Promoted to
  /// `committedDocumentCleared` only when that navigation actually commits.
  private var pendingMainFrameCleared = false
  /// Whether the main-frame document on screen came from a cleared response.
  /// Starts false: the document the solve opens on is the challenge itself.
  private var committedDocumentCleared = false
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
    // Main frame only, isolated world only: see `nemuCloudflareProbeScript`.
    configuration.userContentController.add(
      NemuCloudflareProbeMessageProxy(target: self),
      contentWorld: nemuCloudflareProbeWorld,
      name: nemuCloudflareProbeHandlerName
    )
    configuration.userContentController.addUserScript(WKUserScript(
      source: nemuCloudflareProbeScript,
      injectionTime: .atDocumentEnd,
      forMainFrameOnly: true,
      in: nemuCloudflareProbeWorld
    ))
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
    #if DEBUG
    // Lets Safari's Web Inspector attach to a live solve (network, console).
    webView.isInspectable = true
    #endif

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

  /// Reads the WebView's cookie jar against the DOM markers the probe script
  /// last pushed. A solve is complete when a `cf_clearance` cookie for the
  /// challenge host exists, its value differs from the one the source already
  /// had, the committed main-frame document came from a non-mitigated origin
  /// response, and that document is not a challenge
  /// (`NemuCloudflareChallengePolicy.isSolveComplete`).
  ///
  /// Never evaluates script in the page; see `nemuCloudflareProbeScript`.
  private func probe() {
    guard !finished, let webView, !probeInFlight else { return }
    probeInFlight = true
    webView.configuration.websiteDataStore.httpCookieStore.getAllCookies { [weak self] cookies in
      guard let self else { return }
      self.probeInFlight = false
      guard !self.finished else { return }
      self.evaluate(probe: self.latestProbe, cookies: cookies)
    }
  }

  fileprivate func didReceiveProbe(_ message: WKScriptMessage) {
    // The script is main-frame only; anything else is not ours to trust.
    guard !finished, message.frameInfo.isMainFrame else { return }
    latestProbe = Self.parseProbe(message.body)
    probe()
  }

  private func evaluate(probe: NemuCloudflareChallengeProbe, cookies: [HTTPCookie]) {
    // Rebuilt without their CHIPS partition so the source's plain
    // `cookies(for:)` lookup can see them; see `adoptableCookieProperties`.
    let adoptable = cookies.compactMap { cookie -> HTTPCookie? in
      guard
        NemuCloudflareChallengePolicy.cookieDomainCoversChallengeHost(
          cookie.domain,
          challengeHost: challengeHost
        ),
        let properties = cookie.properties,
        let adopted = NemuCloudflareChallengePolicy.adoptableCookieProperties(
          properties,
          challengeHost: challengeHost
        )
      else {
        return nil
      }
      return HTTPCookie(properties: adopted)
    }
    let clearance = adoptable.first { $0.name == nemuCloudflareClearanceCookieName }
    if NemuCloudflareChallengePolicy.isSolveComplete(
      clearance: clearance?.value,
      baselineClearance: baselineClearance,
      committedDocumentCleared: committedDocumentCleared,
      probeReportsChallenge: probe.isChallenge
    ) {
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
    presenter.present(controller.makeSheet(), animated: true)
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
      webView.configuration.userContentController.removeAllScriptMessageHandlers()
      webView.configuration.userContentController.removeAllUserScripts()
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
    let allowed = NemuCloudflareChallengePolicy.allowsRequest(
      isForMainFrame: isMainFrame,
      url: target,
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
    // The same predicate the action phase used. Judging a subframe by
    // `allowsSubresource` here while the action phase used
    // `allowsSubframeNavigation` meant a frame WebKit had already been told to
    // load could be cancelled on its response by a different rule.
    let allowed = NemuCloudflareChallengePolicy.allowsRequest(
      isForMainFrame: navigationResponse.isForMainFrame,
      url: responseUrl,
      challengeHost: challengeHost
    )
    if navigationResponse.isForMainFrame {
      // Judged here, where the status and headers are visible, and promoted
      // to `committedDocumentCleared` only if this navigation commits.
      pendingMainFrameCleared = allowed && isClearedDocument(navigationResponse.response)
    }
    decisionHandler(allowed ? .allow : .cancel)
  }

  private func isClearedDocument(_ response: URLResponse) -> Bool {
    guard let http = response as? HTTPURLResponse else { return false }
    var headers: [String: String] = [:]
    for (name, value) in http.allHeaderFields {
      guard let name = name as? String else { continue }
      headers[name] = value as? String ?? String(describing: value)
    }
    return NemuCloudflareChallengePolicy.isClearedDocumentResponse(
      url: http.url,
      status: http.statusCode,
      headers: headers,
      challengeHost: challengeHost
    )
  }

  func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
    // A new main-frame document is on screen; until its own probe reports,
    // assume it is still a challenge (the same default a failed read had).
    latestProbe = .empty
    // Only the response this commit belongs to can vouch for the document.
    committedDocumentCleared = pendingMainFrameCleared
    pendingMainFrameCleared = false
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
///
/// Presented inside a `UINavigationController` (`makeSheet()`) rather than
/// under a hand-placed `UINavigationBar`. A bare bar pinned to the safe-area
/// top sits flush against a page sheet's top edge — a sheet has no top safe
/// area inset — so the title and the close button were cramped against the
/// grabber zone. A navigation controller gets the system's sheet bar metrics,
/// the standard glass close button, and the scroll-edge treatment, which is
/// what the app's other native sheets look like.
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
    navigationItem.title = title
    navigationItem.rightBarButtonItem = UIBarButtonItem(
      barButtonSystemItem: .close,
      target: self,
      action: #selector(closeTapped)
    )
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("NemuCloudflareChallengeViewController is not storyboard-backed.")
  }

  /// The presentable sheet: this controller as the root of a navigation
  /// controller, full-height with the grabber the app's sheets show.
  func makeSheet() -> UINavigationController {
    let navigation = UINavigationController(rootViewController: self)
    navigation.modalPresentationStyle = .pageSheet
    if let sheet = navigation.sheetPresentationController {
      sheet.detents = [.large()]
      sheet.prefersGrabberVisible = true
    }
    return navigation
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .systemBackground

    guard let webView = hostedWebView else { return }
    webView.translatesAutoresizingMaskIntoConstraints = false
    webView.isUserInteractionEnabled = true
    view.addSubview(webView)

    // Below the navigation bar, not under it: the challenge page is a fixed
    // layout with its widget near the top, and nothing of it should sit
    // behind the bar.
    NSLayoutConstraint.activate([
      webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
      webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
    ])
  }

  /// The presentation controller of the sheet this controller is shown in
  /// (the navigation controller's, once `makeSheet()` wrapped it).
  private var sheetPresentationOwner: UIPresentationController? {
    navigationController?.presentationController ?? presentationController
  }

  /// Wired after `present` — `presentationController` does not exist before the
  /// presentation begins. Catches the sheet's own swipe-to-dismiss gesture.
  func observeDismissGesture() {
    sheetPresentationOwner?.delegate = self
  }

  /// Called during teardown so a successful solve does not report a cancel when
  /// the sheet is dismissed programmatically.
  func detachWebView() {
    didCancel = true
    hostedWebView?.removeFromSuperview()
    hostedWebView = nil
    sheetPresentationOwner?.delegate = nil
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
