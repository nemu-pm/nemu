package pm.nemu.mobile.aidoku

/**
 * The installer the solver injects at document start. Kept as one function
 * literal so the solver, the JVM tests and the JS behaviour test
 * (`src/sources/mobileCloudflareSocketGuard.test.ts`, which extracts this
 * literal and runs it against a fake realm) all exercise the same text.
 *
 * It replaces, in every realm it reaches:
 *
 * - `WebSocket` and `WebSocketStream`, which only construct for `wss:` (or an
 *   `https:` url, which the platform maps to `wss:`) to an allow-listed host,
 * - `WebTransport`, which only constructs for `https:` to an allow-listed
 *   host, and
 * - `RTCPeerConnection` / `webkitRTCPeerConnection`, which never construct:
 *   ICE would otherwise send STUN/TURN to any address, private ones included.
 *
 * Each replacement is a `Proxy` over the native constructor with a
 * null-prototype handler, so statics, `prototype`, `instanceof` and subclassing
 * keep working, a polluted `Object.prototype` cannot contribute traps, and the
 * native constructor is never reachable from page script (`prototype.constructor`
 * is repointed at the proxy). The global binding is non-writable and
 * non-configurable. Every primordial the checks use is captured before any page
 * script runs, and the href handed to the native constructor is the one that
 * was checked, so a url object whose `toString` changes between calls cannot
 * slip a second destination through.
 *
 * Same-origin child realms reached through `contentWindow`/`contentDocument`
 * are guarded on first access. That is what reaches a new iframe's initial
 * empty document, where Chromium runs no document-start script — but only
 * through those two getters; `window[0]` reaches it unguarded. Workers are not
 * reachable from here at all. See `NemuCloudflareSolver.kt` for both.
 *
 * **Cloudflare's own Turnstile frame is left alone.** When the realm the
 * script is injected into has the origin `exemptOrigin`
 * (`https://challenges.cloudflare.com`, see [NemuCloudflareSocketGuard.script])
 * it returns before reading or replacing anything. Turnstile fingerprints its
 * own realm, and Proxy-wrapped constructors, a hooked `contentWindow` getter
 * and an `RTCPeerConnection` that throws are exactly the kind of tampering it
 * scores; a widget that decides it is being scripted issues a clearance the
 * edge then refuses — the endless-checkbox loop the iOS solver hit. That frame
 * is Cloudflare's code, not the source's, and every request it makes still
 * goes through the native allow-list; only its sockets go unguarded (see the
 * residual risks in `NemuCloudflareSolver.kt`). The origin is read from
 * `location`, an unforgeable property, before any page script has run, and
 * only for the realm the script was injected into: a child realm adopted
 * through a guarded frame's getters is always guarded, and an opaque-origin
 * frame (`"null"`) never matches.
 *
 * Must not contain a `$`: this is a Kotlin raw string.
 */
internal val NEMU_CLOUDFLARE_SOCKET_GUARD_FUNCTION = """
function (root, hosts, exemptOrigin) {
  "use strict";
  if (typeof exemptOrigin === "string") {
    var rootOrigin;
    try {
      rootOrigin = root.location.origin;
    } catch (error) {
      rootOrigin = undefined;
    }
    if (rootOrigin === exemptOrigin) return;
  }
  var defineProperty = Object.defineProperty;
  var getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
  var createObject = Object.create;
  var construct = Reflect.construct;
  var apply = Reflect.apply;
  var ProxyConstructor = Proxy;
  var URLConstructor = URL;
  var StringConstructor = String;
  var sliceString = String.prototype.slice;
  var WeakSetConstructor = WeakSet;
  var weakSetHas = WeakSet.prototype.has;
  var weakSetAdd = WeakSet.prototype.add;
  var urlPrototype = URLConstructor.prototype;
  var hrefOf = getOwnPropertyDescriptor(urlPrototype, "href").get;
  var protocolOf = getOwnPropertyDescriptor(urlPrototype, "protocol").get;
  var hostnameOf = getOwnPropertyDescriptor(urlPrototype, "hostname").get;
  var usernameOf = getOwnPropertyDescriptor(urlPrototype, "username").get;
  var passwordOf = getOwnPropertyDescriptor(urlPrototype, "password").get;
  var FallbackDOMException = root.DOMException;

  var allowed = createObject(null);
  for (var index = 0; index < hosts.length; index++) allowed[hosts[index]] = true;

  var socketSchemes = createObject(null);
  socketSchemes["wss:"] = "wss:";
  socketSchemes["https:"] = "wss:";
  var transportSchemes = createObject(null);
  transportSchemes["https:"] = "https:";

  var guardedRealms = new WeakSetConstructor();

  function baseOf(realm) {
    try {
      if (realm.document) return StringConstructor(realm.document.baseURI);
    } catch (error) {}
    try {
      return StringConstructor(realm.location.href);
    } catch (error) {}
    return undefined;
  }

  function checkedHref(realm, value, schemes, Refusal) {
    var text = StringConstructor(value);
    var base = baseOf(realm);
    var parsed;
    try {
      parsed = base === undefined
        ? new URLConstructor(text)
        : new URLConstructor(text, base);
    } catch (error) {
      throw new Refusal("The URL '" + text + "' is invalid.", "SyntaxError");
    }
    var protocol = apply(protocolOf, parsed, []);
    var scheme = schemes[protocol];
    var host = apply(hostnameOf, parsed, []);
    while (host.length > 0 && host[host.length - 1] === ".") {
      host = apply(sliceString, host, [0, host.length - 1]);
    }
    if (
      typeof scheme !== "string" ||
      apply(usernameOf, parsed, []) !== "" ||
      apply(passwordOf, parsed, []) !== "" ||
      allowed[host] !== true
    ) {
      throw new Refusal("Refused to connect to '" + text + "'.", "SecurityError");
    }
    return scheme + apply(sliceString, apply(hrefOf, parsed, []), [protocol.length]);
  }

  function seal(realm, name, value) {
    defineProperty(realm, name, {
      value: value,
      writable: false,
      enumerable: false,
      configurable: false
    });
  }

  function repointConstructor(Native, guarded) {
    var prototype = Native.prototype;
    if (!prototype) return;
    try {
      defineProperty(prototype, "constructor", {
        value: guarded,
        writable: true,
        enumerable: false,
        configurable: true
      });
    } catch (error) {}
  }

  function guardConnection(realm, name, schemes, Refusal) {
    var Native = realm[name];
    if (typeof Native !== "function") return;
    var guarded;
    var handler = createObject(null);
    handler.construct = function (target, args, newTarget) {
      var forwarded = args.length === 0
        ? []
        : args.length === 1
          ? [checkedHref(realm, args[0], schemes, Refusal)]
          : [checkedHref(realm, args[0], schemes, Refusal), args[1]];
      return construct(target, forwarded, newTarget === guarded ? target : newTarget);
    };
    guarded = new ProxyConstructor(Native, handler);
    repointConstructor(Native, guarded);
    seal(realm, name, guarded);
  }

  function blockConnection(realm, name, Native, Refusal) {
    if (typeof Native !== "function") return undefined;
    var handler = createObject(null);
    handler.construct = function () {
      throw new Refusal("Peer connections are disabled.", "NotAllowedError");
    };
    var guarded = new ProxyConstructor(Native, handler);
    repointConstructor(Native, guarded);
    seal(realm, name, guarded);
    return guarded;
  }

  function adopt(child) {
    if (!child) return;
    try {
      install(child);
    } catch (error) {}
  }

  function adoptThroughGetter(prototype, key, windowOf) {
    var descriptor = getOwnPropertyDescriptor(prototype, key);
    if (!descriptor || typeof descriptor.get !== "function" || !descriptor.configurable) return;
    var handler = createObject(null);
    handler.apply = function (target, receiver, args) {
      var child = null;
      try {
        child = apply(windowOf, receiver, []);
      } catch (error) {
        child = null;
      }
      adopt(child);
      return apply(target, receiver, args);
    };
    defineProperty(prototype, key, {
      get: new ProxyConstructor(descriptor.get, handler),
      set: descriptor.set,
      enumerable: descriptor.enumerable,
      configurable: descriptor.configurable
    });
  }

  function adoptFrames(realm) {
    var owners = ["HTMLIFrameElement", "HTMLFrameElement", "HTMLObjectElement"];
    for (var index = 0; index < owners.length; index++) {
      var Owner = realm[owners[index]];
      if (typeof Owner !== "function" || !Owner.prototype) continue;
      var windowDescriptor = getOwnPropertyDescriptor(Owner.prototype, "contentWindow");
      if (!windowDescriptor || typeof windowDescriptor.get !== "function") continue;
      var windowOf = windowDescriptor.get;
      adoptThroughGetter(Owner.prototype, "contentWindow", windowOf);
      adoptThroughGetter(Owner.prototype, "contentDocument", windowOf);
    }
  }

  function install(realm) {
    if (apply(weakSetHas, guardedRealms, [realm])) return;
    var marker = getOwnPropertyDescriptor(realm, "WebSocket");
    if (marker && marker.configurable === false) return;
    apply(weakSetAdd, guardedRealms, [realm]);
    var Refusal = typeof realm.DOMException === "function"
      ? realm.DOMException
      : FallbackDOMException;
    guardConnection(realm, "WebSocket", socketSchemes, Refusal);
    guardConnection(realm, "WebSocketStream", socketSchemes, Refusal);
    guardConnection(realm, "WebTransport", transportSchemes, Refusal);
    var peer = realm.RTCPeerConnection;
    var legacyPeer = realm.webkitRTCPeerConnection;
    var guardedPeer = blockConnection(realm, "RTCPeerConnection", peer, Refusal);
    if (guardedPeer && legacyPeer === peer) {
      seal(realm, "webkitRTCPeerConnection", guardedPeer);
    } else {
      blockConnection(realm, "webkitRTCPeerConnection", legacyPeer, Refusal);
    }
    adoptFrames(realm);
  }

  install(root);
}
""".trimIndent()

/**
 * Builds the document-start script that closes the connection channels
 * Chromium never routes through [android.webkit.WebViewClient] or the
 * service-worker client: WebSockets, WebTransport and WebRTC.
 *
 * The host list is [NemuCloudflareChallengePolicy.allowedHosts], the same list
 * the request callbacks enforce, so the page-side guard and the native
 * allow-list cannot drift apart.
 *
 * Injected into every frame but a no-op in Cloudflare's own
 * `https://challenges.cloudflare.com` frame ([exemptOrigin]); see
 * [NEMU_CLOUDFLARE_SOCKET_GUARD_FUNCTION].
 */
internal object NemuCloudflareSocketGuard {
  /**
   * Every frame, whatever its origin — deliberately wider than the two
   * allow-listed origins. The script grants nothing (no bridge, no injected
   * object); it only takes capability away, so the narrow spelling would only
   * leave frames unguarded: a `data:` or sandboxed `srcdoc` subframe has an
   * opaque origin that no `https://host` rule matches, and both load under
   * [NemuCloudflareChallengePolicy.allowsRequest]. `*` is the one rule
   * Chromium's origin matcher applies to opaque origins too. (A rule list
   * cannot express "everything but one origin", so the Turnstile exemption is
   * made by the script itself; see [exemptOrigin].)
   */
  val ALLOWED_ORIGIN_RULES: Set<String> = setOf("*")

  /**
   * The one origin the guard stands down in: Cloudflare's Turnstile frame.
   * Null when the challenge host *is* the platform host, so a document the
   * solve was pointed at is never the exempt one.
   */
  fun exemptOrigin(challengeHost: String): String? =
    if (challengeHost == NemuCloudflareChallengePolicy.CHALLENGE_PLATFORM_HOST) {
      null
    } else {
      "https://${NemuCloudflareChallengePolicy.CHALLENGE_PLATFORM_HOST}"
    }

  /** Null when [challengeHost] could never be allow-listed; the solve must not start. */
  fun script(challengeHost: String): String? {
    val hosts = NemuCloudflareChallengePolicy.allowedHosts(challengeHost) ?: return null
    val literal = hosts.joinToString(separator = ",", prefix = "[", postfix = "]") {
      jsStringLiteral(it)
    }
    val exempt = exemptOrigin(challengeHost)?.let(::jsStringLiteral) ?: "null"
    return "($NEMU_CLOUDFLARE_SOCKET_GUARD_FUNCTION)(self, $literal, $exempt);"
  }

  /**
   * A double-quoted JS string literal. The hosts reaching here are already
   * normalized to `[a-z0-9.-]`, so this is belt and braces: it escapes
   * everything that could end the literal or the script (quotes, backslash,
   * line terminators including U+2028/U+2029, other controls, `<`/`>`).
   */
  fun jsStringLiteral(value: String): String {
    val out = StringBuilder(value.length + 2)
    out.append('"')
    for (character in value) {
      when {
        character == '"' -> out.append("\\\"")
        character == '\\' -> out.append("\\\\")
        character == '\n' -> out.append("\\n")
        character == '\r' -> out.append("\\r")
        character == '\t' -> out.append("\\t")
        character.code < 0x20 ||
          character.code == 0x7f ||
          character == '\u2028' ||
          character == '\u2029' ||
          character == '<' ||
          character == '>' -> out.append(String.format("\\u%04x", character.code))
        else -> out.append(character)
      }
    }
    out.append('"')
    return out.toString()
  }
}
